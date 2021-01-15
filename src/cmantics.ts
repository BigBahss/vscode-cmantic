import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';


// A DocumentSymbol that understands the semantics of C/C++.
export class Symbol extends vscode.DocumentSymbol
{
    readonly document: vscode.TextDocument;
    readonly parent?: Symbol;

    constructor(docSymbol: vscode.DocumentSymbol, document: vscode.TextDocument, parent?: Symbol)
    {
        super(docSymbol.name, docSymbol.detail, docSymbol.kind, docSymbol.range, docSymbol.selectionRange);
        this.children = docSymbol.children;
        this.document = document;
        this.parent = parent;
    }

    // Returns all the text contained in this symbol.
    text(): string
    {
        return this.document.getText(this.range);
    }

    // Returns the identifier of this symbol, such as a function name. this.id() != this.name for functions.
    id(): string
    {
        return this.document.getText(this.selectionRange);
    }

    // Returns an array of Symbol's starting with the top-most ancestor and ending with this.parent.
    // Returns an empty array if this is a top-level symbol.
    scopes(): Symbol[]
    {
        let scopes: Symbol[] = [];
        let symbol: Symbol = this;
        while (symbol.parent) {
            scopes.push(symbol.parent);
            symbol = symbol.parent;
        }
        return scopes.reverse();
    }

    // Finds the most likely definition of this symbol in the case that multiple are found.
    async findDefinition(): Promise<vscode.Location | undefined>
    {
        return await findDefinitionOfDocumentSymbol(this.selectionRange.start, this.document.uri);
    }

    isFunctionDeclaration(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Function:
            return this.text().endsWith(';');
        default:
            return false;
        }
    }

    isConstructor(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
            return true;
        case vscode.SymbolKind.Method:
            return this.id() === this.parent?.id();
        default:
            return false;
        }
    }

    isDestructor(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
            return this.id() === '~' + this.parent?.id();
        default:
            return false;
        }
    }

    isConstexpr(): boolean
    {
        const leadingRange = new vscode.Range(this.range.start, this.selectionRange.start);
        if (this.document.getText(leadingRange).match(/\bconstexpr\b/)) {
            return true;
        }
        return false;
    }

    isInline(): boolean
    {
        const leadingRange = new vscode.Range(this.range.start, this.selectionRange.start);
        if (this.document.getText(leadingRange).match(/\binline\b/)) {
            return true;
        }
        return false;
    }

    // Formats this function declaration for use as a definition (without curly braces).
    async newFunctionDefinition(target: SourceFile, position?: vscode.Position): Promise<string>
    {
        if (!this.isFunctionDeclaration()) {
            return '';
        }

        let scopeString = '';
        for (const scope of this.scopes()) {
            const targetScope = await target.findMatchingSymbol(scope);
            if (!targetScope || (position && !targetScope.range.contains(position))) {
                scopeString += scope.id() + '::';
            }
        }

        const funcName = this.id();
        const declaration = this.text();
        const maskedDeclaration = maskUnimportantText(declaration);

        const paramStart = maskedDeclaration.indexOf('(', maskedDeclaration.indexOf(funcName) + funcName.length) + 1;
        const lastParen = maskedDeclaration.lastIndexOf(')');
        const trailingReturnOperator = maskedDeclaration.substring(paramStart, lastParen).indexOf('->');
        const paramEnd = trailingReturnOperator === -1 ?
                         lastParen : maskedDeclaration.substring(paramStart, trailingReturnOperator).lastIndexOf(')');
        const parameters = stripDefaultValues(declaration.substring(paramStart, paramEnd));

        // Intelligently align the definition in the case of a multi-line declaration.
        // FIXME: Smart alignment sometimes works incorrectly.
        let leadingText = declaration.substring(0, declaration.indexOf(funcName));
        const l = this.document.lineAt(this.range.start);
        const leadingIndent = l.text.substring(0, l.firstNonWhitespaceCharacterIndex).length;
        const re_newLineAlignment = new RegExp(
                util.endOfLine(this.document) + ' '.repeat(leadingIndent + leadingText.length) + '\s*', 'g');
        leadingText = leadingText.replace(/\b(virtual|static|explicit|friend)\b\s*/g, '');
        let definition = funcName + '(' + parameters + ')'
                + declaration.substring(paramEnd + 1, declaration.length - 1);
        let match: RegExpExecArray | null;
        while (match = re_newLineAlignment.exec(definition)) {
            definition = definition.replace(
                    match[0], util.endOfLine(target.document) + ' '.repeat(leadingText.length + scopeString.length));
        }

        definition = leadingText + scopeString + definition;
        definition = definition.replace(/\s*\b(override|final)\b/g, '');

        return definition;
    }
}


// Represents a C/C++ source file.
export class SourceFile
{
    readonly document: vscode.TextDocument;
    readonly uri: vscode.Uri;
    symbols: vscode.DocumentSymbol[];

    constructor(document: vscode.TextDocument)
    {
        this.document = document;
        this.uri = document.uri;
        this.symbols = [];
    }

    text(): string { return this.document.getText(); }

    // Queries and sorts document symbols to set the symbols property.
    // Methods that use the symbols property will call this automatically if it hasn't been called yet.
    async updateSymbols(): Promise<void>
    {
        const newSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', this.uri);

        if (!newSymbols) {
            return;
        }
        this.symbols = newSymbols;

        const sortSymbolTree = (symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] => {
            symbols = symbols.sort((a: vscode.DocumentSymbol, b: vscode.DocumentSymbol) => {
                return a.range.start.isAfter(b.range.start) ? 1 : -1;
            });

            for (const symbol of symbols) {
                symbol.children = sortSymbolTree(symbol.children);
            }
            return symbols;
        };

        this.symbols = sortSymbolTree(this.symbols);
    }

    async getSymbol(position: vscode.Position): Promise<Symbol | undefined>
    {
        if (this.symbols.length === 0) {
            await this.updateSymbols();
        }

        const searchSymbolTree = (symbolResults: vscode.DocumentSymbol[], parent?: Symbol): Symbol | undefined => {
            const docSymbols = symbolResults as vscode.DocumentSymbol[];
            for (const docSymbol of docSymbols) {
                if (!docSymbol.range.contains(position)) {
                    continue;
                }
                const symbol = new Symbol(docSymbol, this.document, parent);
                if (symbol.children.length === 0) {
                    return symbol;
                } else {
                    return searchSymbolTree(symbol.children, symbol);
                }
            }
        };

        return searchSymbolTree(this.symbols);
    }

    async findMatchingSymbol(target: vscode.DocumentSymbol): Promise<Symbol | undefined>
    {
        if (this.symbols.length === 0) {
            await this.updateSymbols();
        }

        const searchSymbolTree = (symbolResults: vscode.DocumentSymbol[], parent?: Symbol): Symbol | undefined => {
            const docSymbols = symbolResults as vscode.DocumentSymbol[];
            for (const docSymbol of docSymbols) {
                const symbol = new Symbol(docSymbol, this.document, parent);
                if (docSymbol.name === target.name) {
                    return symbol;
                } else {
                    return searchSymbolTree(docSymbol.children, symbol);
                }
            }
        };

        return searchSymbolTree(this.symbols);
    }

    async findDefinition(position: vscode.Position): Promise<vscode.Location | undefined>
    {
        return await findDefinitionOfDocumentSymbol(position, this.uri);
    }

    isHeader(): boolean
    {
        return SourceFile.isHeader(this.document.fileName);
    }

    static isHeader(fileName: string): boolean
    {
        return cfg.headerExtensions().includes(util.fileExtension(fileName));
    }

    async hasHeaderGuard(): Promise<boolean>
    {
        if (this.text().match(/^\s*#pragma\s+once\b/)) {
            return true;
        }

        if (this.symbols.length === 0) {
            await this.updateSymbols();
        }

        for (const symbol of this.symbols) {
            if (symbol.name === cfg.headerGuardDefine(util.fileName(this.uri.path))) {
                return true;
            }
        }

        return false;
    }

    async findMatchingSourceFile(): Promise<vscode.Uri | undefined>
    {
        return SourceFile.findMatchingSourceFile(this.document.fileName);
    }

    static async findMatchingSourceFile(fileName: string): Promise<vscode.Uri | undefined>
    {
        const extension = util.fileExtension(fileName);
        const baseName = util.fileNameBase(fileName);
        const directory = util.directory(fileName);
        const headerExtensions = cfg.headerExtensions();
        const sourceExtensions = cfg.sourceExtensions();

        let globPattern: string;
        if (headerExtensions.indexOf(extension) !== -1) {
            globPattern = `**/${baseName}.{${sourceExtensions.join(",")}}`;
        } else if (sourceExtensions.indexOf(extension) !== -1) {
            globPattern = `**/${baseName}.{${headerExtensions.join(",")}}`;
        } else {
            return;
        }

        const uris = await vscode.workspace.findFiles(globPattern);
        let bestMatch: vscode.Uri | undefined;
        let smallestDiff: number | undefined;

        for (const uri of uris) {
            if (uri.scheme !== 'file') {
                continue;
            }

            const diff = util.compareDirectoryPaths(util.directory(uri.path), directory);
            if (!smallestDiff || diff < smallestDiff) {
                smallestDiff = diff;
                bestMatch = uri;
            }
        }

        return bestMatch;
    }

    async findPositionForNewDefinition(declaration: Symbol, target?: SourceFile): Promise<ProposedPosition>
    {
        if (declaration.document !== this.document || (!declaration.parent && this.symbols.length === 0)) {
            return { value: new vscode.Position(0, 0) };
        }
        if (!target) {
            target = this;
        }
        if (target.symbols.length === 0) {
            await target.updateSymbols();
            if (target.symbols.length === 0) {
                for (let i = target.document.lineCount - 1; i >= 0; --i) {
                    if (!target.document.lineAt(i).isEmptyOrWhitespace) {
                        return { value: target.document.lineAt(i).range.end, after: true };
                    }
                }
                return { value: new vscode.Position(0, 0) };
            }
        }

        // Split sibling symbols into those that come before and after the declaration in this source file.
        const siblingSymbols = declaration.parent ? declaration.parent.children : this.symbols;
        let before: vscode.DocumentSymbol[] = [];
        let after: vscode.DocumentSymbol[] = [];
        let hitTarget = false;
        for (const symbol of siblingSymbols) {
            if (symbol.range === declaration.range) {
                hitTarget = true;
            }
            !hitTarget ? before.push(symbol) : after.push(symbol);
        }

        // Find the closest relative definition to place the new definition next to.
        for (const symbol of before.reverse()) {
            const definitionLocation = await findDefinitionOfDocumentSymbol(symbol.selectionRange.start, this.uri);
            if (!definitionLocation) {
                continue;
            }
            const definition = await target.getSymbol(definitionLocation.range.start);
            if (definition) {
                return { value: getEndOfStatement(definition.range.end, target.document), after: true };
            }
        }
        for (const symbol of after) {
            const definitionLocation = await findDefinitionOfDocumentSymbol(symbol.selectionRange.start, this.uri);
            if (!definitionLocation) {
                continue;
            }
            const definition = await target.getSymbol(definitionLocation.range.start);
            if (definition) {
                return { value: getEndOfStatement(definition.range.start, target.document), before: true };
            }
        }

        // If a relative definition could not be found then return the range of the last symbol in the target file.
        return {
            value: getEndOfStatement(target.symbols[target.symbols.length - 1].range.end, target.document),
            after: true
        };
    }

    async findPositionForNewInclude(): Promise<NewIncludePosition>
    {
        // TODO: Clean up this mess.
        const largestBlock = (
            line: vscode.TextLine, start: vscode.Position, largest: vscode.Range | undefined
        ): vscode.Range => {
            const r = new vscode.Range(start, line.range.start);
            return (!largest || r > largest) ? r : largest;
        };

        let systemIncludeStart: vscode.Position | undefined;
        let projectIncludeStart: vscode.Position | undefined;
        let largestSystemIncludeBlock: vscode.Range | undefined;
        let largestProjectIncludeBlock: vscode.Range | undefined;
        for (let i = 0; i < this.document.lineCount; ++i) {
            const line = this.document.lineAt(i);
            if (!line.text.trim().match(/^#include\s*(<.+>)|(".+")$/)) {
                if (systemIncludeStart) {
                    largestSystemIncludeBlock = largestBlock(line, systemIncludeStart, largestSystemIncludeBlock);
                    systemIncludeStart = undefined;
                } else if (projectIncludeStart) {
                    largestProjectIncludeBlock = largestBlock(line, projectIncludeStart, largestProjectIncludeBlock);
                    projectIncludeStart = undefined;
                }
            } else if (line.text.match(/<.+>/)) {
                if (!systemIncludeStart) {
                    systemIncludeStart = line.range.start;
                }
                if (projectIncludeStart) {
                    largestProjectIncludeBlock = largestBlock(line, projectIncludeStart, largestProjectIncludeBlock);
                    projectIncludeStart = undefined;
                }
            } else if (line.text.match(/".+"/)) {
                if (!projectIncludeStart) {
                    projectIncludeStart = line.range.start;
                }
                if (systemIncludeStart) {
                    largestSystemIncludeBlock = largestBlock(line, systemIncludeStart, largestSystemIncludeBlock);
                    systemIncludeStart = undefined;
                }
            }
        }

        let systemIncludePos: vscode.Position | undefined;
        let projectIncludePos: vscode.Position | undefined;
        if (largestSystemIncludeBlock) {
            systemIncludePos = largestSystemIncludeBlock.end;
            if (!largestProjectIncludeBlock) {
                projectIncludePos = systemIncludePos;
            }
        }
        if (largestProjectIncludeBlock) {
            projectIncludePos = largestProjectIncludeBlock.end;
            if (!largestSystemIncludeBlock) {
                systemIncludePos = projectIncludePos;
            }
        }
        if (systemIncludePos && projectIncludePos) {
            return { system: systemIncludePos, project: projectIncludePos };
        }

        let startLineNum = this.document.lineCount - 1;
        if (this.symbols.length === 0) {
            await this.updateSymbols();
            if (this.symbols.length === 0) {
                startLineNum = this.document.lineCount - 1;
            }
        }
        if (this.symbols.length !== 0) {
            startLineNum = this.symbols[0].range.start.line;
        }
        for (let i = startLineNum; i >= 0; --i) {
            const line = this.document.lineAt(i);
            if (!line.isEmptyOrWhitespace) {
                return { system: line.range.end, project: line.range.end };
            }
        }

        return { system: new vscode.Position(0, 0), project: new vscode.Position(0, 0) };
    }

    // Finds a position for a header guard by skipping over any comments that appear at the top of the file.
    findPositionForNewHeaderGuard(): ProposedPosition
    {
        const maskedText = this.text().replace(/\/\*(\*(?=\/)|[^*])*\*\//g, match => ' '.repeat(match.length))
                                      .replace(/\/\/.*/g, match => ' '.repeat(match.length));
        let match = maskedText.match(/\S/);
        if (typeof match?.index === 'number') {
            return {
                value: this.document.positionAt(match.index),
                before: true
            };
        }

        const endTrimmedTextLength = this.text().trimEnd().length;
        return {
            value: this.document.positionAt(endTrimmedTextLength),
            after: endTrimmedTextLength !== 0
        };
    }
}


export interface ProposedPosition
{
    value: vscode.Position;
    before?: boolean;
    after?: boolean;
}

export interface NewIncludePosition
{
    system: vscode.Position;
    project: vscode.Position;
}


// DocumentSymbol ranges don't always include the final semi-colon.
function getEndOfStatement(position: vscode.Position, document: vscode.TextDocument): vscode.Position
{
    let nextPosition = position.translate(0, 1);
    while (document.getText(new vscode.Range(position, nextPosition)) === ';') {
        position = nextPosition;
        nextPosition = position.translate(0, 1);
    }
    return position;
}

function maskUnimportantText(source: string, maskChar: string = ' '): string
{
    const replacer = (match: string) => maskChar.repeat(match.length);
    // Mask comments
    source = source.replace(/(?<=\/\*)(\*(?=\/)|[^*])*(?=\*\/)/g, replacer);
    source = source.replace(/(?<=\/\/).*/g, replacer);
    // Mask quoted characters
    source = source.replace(/(?<=").*(?=")(?<!\\)/g, replacer);
    source = source.replace(/(?<=').*(?=')(?<!\\)/g, replacer);
    // Mask template arguments
    source = source.replace(/(?<=<)(>(?=>)|[^>])*(?=>)/g, replacer);

    return source;
}

function stripDefaultValues(parameters: string): string
{
    parameters = parameters.replace(/[^\w\s]=/g, '');
    parameters = parameters.replace(/\b\s*=\s*\b/g, '=');
    parameters = parameters.replace(/\(\)/g, '');

    let maskedParameters = maskUnimportantText(parameters).split(',');
    let strippedParameters = '';
    let charPos = 0;
    for (const maskedParameter of maskedParameters) {
        if (maskedParameter.includes('=')) {
            strippedParameters += parameters.substring(charPos, charPos + maskedParameter.indexOf('=')) + ',';
        } else {
            strippedParameters += parameters.substring(charPos, charPos + maskedParameter.length) + ',';
        }
        charPos += maskedParameter.length + 1;
    }

    return strippedParameters.substring(0, strippedParameters.length - 1);
}

async function findDefinitionOfDocumentSymbol(
    position: vscode.Position,
    uri: vscode.Uri
): Promise<vscode.Location | undefined> {
    const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
            'vscode.executeDefinitionProvider', uri, position);

    if (!definitionResults) {
        return;
    }

    for (const result of definitionResults) {
        const location = result instanceof vscode.Location ?
                result : new vscode.Location(result.targetUri, result.targetRange);

        if (location.uri !== uri && !location.range.contains(position)) {
            return location;
        }
    }
}
