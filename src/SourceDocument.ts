import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as parse from './parsing';
import SourceFile from './SourceFile';
import SourceSymbol from './SourceSymbol';
import CSymbol from './CSymbol';
import { ProposedPosition } from './ProposedPosition';
import SubSymbol from './SubSymbol';


const re_preprocessorDirective = /(?<=^\s*)#.*\S(?=\s*$)/gm;

/**
 * Represents a C/C++ source file that has access to the contents of the file.
 */
export default class SourceDocument extends SourceFile implements vscode.TextDocument {
    private readonly doc: vscode.TextDocument;
    private readonly proposedDefinitions = new WeakMap<vscode.Position, vscode.Location>();

    constructor(document: vscode.TextDocument, sourceFile?: SourceFile) {
        super(document.uri);
        this.doc = document;
        this.symbols = sourceFile?.symbols;
    }

    static async open(uri: vscode.Uri): Promise<SourceDocument> {
        const document = await vscode.workspace.openTextDocument(uri);
        return new SourceDocument(document);
    }

    // Pass through to the provided TextDocument in order to implement.
    get isUntitled(): boolean { return this.doc.isUntitled; }
    get languageId(): string { return this.doc.languageId; }
    get version(): number { return this.doc.version; }
    get isDirty(): boolean { return this.doc.isDirty; }
    get isClosed(): boolean { return this.doc.isClosed; }
    save(): Thenable<boolean> { return this.doc.save(); }
    get eol(): vscode.EndOfLine { return this.doc.eol; }
    get lineCount(): number { return this.doc.lineCount; }
    lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine { return this.doc.lineAt(lineOrPosition as any); }
    offsetAt(position: vscode.Position): number { return this.doc.offsetAt(position); }
    positionAt(offset: number): vscode.Position { return this.doc.positionAt(offset); }
    getText(range?: vscode.Range): string { return this.doc.getText(range); }
    getWordRangeAtPosition(position: vscode.Position, regex?: RegExp): vscode.Range | undefined { return this.doc.getWordRangeAtPosition(position, regex); }
    validateRange(range: vscode.Range): vscode.Range { return this.doc.validateRange(range); }
    validatePosition(position: vscode.Position): vscode.Position { return this.doc.validatePosition(position); }

    get endOfLine(): string { return util.endOfLine(this); }

    rangeAt(startOffset: number, endOffset: number): vscode.Range {
        const start = this.positionAt(startOffset);
        const end = this.positionAt(endOffset);
        return new vscode.Range(start, end);
    }

    async getSymbol(position: vscode.Position): Promise<CSymbol | undefined> {
        const symbol = await super.getSymbol(position);
        return symbol ? new CSymbol(symbol, this) : undefined;
    }

    static async getSymbol(location: vscode.Location): Promise<CSymbol | undefined> {
        const sourceDoc = await SourceDocument.open(location.uri);
        return sourceDoc.getSymbol(location.range.start);
    }

    async findMatchingSymbol(target: CSymbol): Promise<CSymbol | undefined> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        return SourceFile.findMatchingSymbol(target, this.symbols, this) as CSymbol | undefined;
    }

    async allFunctions(): Promise<CSymbol[]> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const sourceDoc = this;

        return function findFunctions(symbols: SourceSymbol[]): CSymbol[] {
            const functions: CSymbol[] = [];

            symbols.forEach(symbol => {
                if (symbol.isFunction()) {
                    functions.push(new CSymbol(symbol, sourceDoc));
                } else if (symbol.children.length > 0) {
                    functions.push(...findFunctions(symbol.children));
                }
            });

            return functions;
        } (this.symbols);
    }

    async namespaces(): Promise<CSymbol[]> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const namespaces: CSymbol[] = [];
        this.symbols.forEach(symbol => {
            if (symbol.kind === vscode.SymbolKind.Namespace) {
                namespaces.push(new CSymbol(symbol, this));
            }
        });

        return namespaces;
    }

    get preprocessorDirectives(): SubSymbol[] {
        if (this._preprocessorDirectives) {
            return this._preprocessorDirectives;
        }

        this._preprocessorDirectives = [];
        const maskedText = parse.maskNonSourceText(this.getText());

        for (const match of maskedText.matchAll(re_preprocessorDirective)) {
            if (match.index) {
                const range = this.rangeAt(match.index, match.index + match[0].length);
                this._preprocessorDirectives.push(new SubSymbol(this, range));
            }
        }

        return this._preprocessorDirectives;
    }
    private _preprocessorDirectives?: SubSymbol[];

    get includedFiles(): string[] {
        if (this._includedFiles) {
            return this._includedFiles;
        }

        this._includedFiles = [];

        for (const directive of this.preprocessorDirectives) {
            const fileMatch = directive.text().match(/(?<=^#\s*include\s*[<"]).+(?=[>"])/);
            if (fileMatch) {
                this._includedFiles.push(fileMatch[0]);
            }
        }

        return this._includedFiles;
    }
    private _includedFiles?: string[];

    hasHeaderGuard(): boolean {
        return this.positionAfterHeaderGuard() !== undefined;
    }

    positionAfterHeaderGuard(): vscode.Position | undefined {
        let line: number | undefined;

        for (let i = 0; i < this.preprocessorDirectives.length; ++i) {
            if (/^#\s*pragma\s+once\b/.test(this.preprocessorDirectives[i].text())) {
                line = this.preprocessorDirectives[i].range.start.line;
                continue;
            }

            const match = this.preprocessorDirectives[i].text().match(/(?<=^#\s*ifndef\s+)[\w_][\w\d_]*/);
            if (match && ++i < this.preprocessorDirectives.length) {
                const re_headerGuardDefine = new RegExp(`^#\\s*define\\s+${match[0]}\\b`);
                if (re_headerGuardDefine.test(this.preprocessorDirectives[i].text())) {
                    line = this.preprocessorDirectives[i].range.start.line;
                    break;
                }
            }

            if (line !== undefined) {
                break;
            }
        }

        if (line !== undefined) {
            return new vscode.Position(line + 1, 0);
        }
    }

    positionAfterHeaderComment(): ProposedPosition {
        const text = this.getText();
        const maskedText = parse.maskComments(text, false);
        const offset = maskedText.search(/\S/);
        if (offset !== -1) {
            // Return position before first non-comment text.
            return new ProposedPosition(this.positionAt(offset), { before: true });
        }

        // Return position after header comment when there is no non-comment text in the file.
        const endTrimmedTextLength = text.trimEnd().length;
        return new ProposedPosition(this.positionAt(endTrimmedTextLength), {
            after: endTrimmedTextLength !== 0
        });
    }

    /**
     * Returns the best positions to place new includes (system and project includes).
     * Optionally provide a beforePos to enforce that the positions returned are before it.
     */
     findPositionForNewInclude(beforePos?: vscode.Position): { system: vscode.Position; project: vscode.Position } {
        let systemIncludeLine: number | undefined;
        let projectIncludeLine: number | undefined;

        for (const directive of this.preprocessorDirectives) {
            if (beforePos?.isBefore(directive.range.end)) {
                break;
            }

            const directiveText = directive.text();
            if (/^#\s*include\s*<.+>/.test(directiveText)) {
                systemIncludeLine = directive.range.start.line;
            } else if (/^#\s*include\s*".+"/.test(directiveText)) {
                projectIncludeLine = directive.range.start.line;
            }
        }

        if (systemIncludeLine === undefined) {
            systemIncludeLine = projectIncludeLine;
        }

        if (projectIncludeLine === undefined) {
            projectIncludeLine = systemIncludeLine;
        }

        if (systemIncludeLine === undefined || projectIncludeLine === undefined) {
            let position = this.positionAfterHeaderGuard();
            if (!position) {
                position = this.positionAfterHeaderComment();
            }
            return { system: position, project: position };
        }

        return {
            system: new vscode.Position(systemIncludeLine + 1, 0),
            project: new vscode.Position(projectIncludeLine + 1, 0)
        };
    }

    async findSmartPositionForFunctionDeclaration(
        definition: CSymbol, targetDoc?: SourceDocument, parentClass?: CSymbol, access?: util.AccessLevel
    ): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        if (!targetDoc) {
            targetDoc = this;
        }

        if (!targetDoc.symbols) {
            await targetDoc.executeSourceSymbolProvider();
        }

        if (!targetDoc.symbols || targetDoc.symbols.length === 0) {
            return util.positionAfterLastNonEmptyLine(targetDoc);
        } else if (definition?.uri.fsPath !== this.uri.fsPath || (!definition.parent && this.symbols.length === 0)) {
            return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
        }

        if (access !== undefined) {
            const memberPos = await targetDoc.findPositionForMemberFunction(definition, parentClass, access);
            if (memberPos) {
                return memberPos;
            }
        }

        const siblingFunctions = SourceDocument.siblingFunctions(definition, this.symbols);
        const definitionIndex = SourceDocument.indexOfSymbol(definition, siblingFunctions);
        const before = siblingFunctions.slice(0, definitionIndex).reverse();
        const after = siblingFunctions.slice(definitionIndex + 1);

        const siblingPos = await this.findPositionRelativeToSiblings(
                definition, before, after, targetDoc, false, parentClass);
        if (siblingPos) {
            return siblingPos;
        }

        if (access === undefined) {
            const memberPos = await targetDoc.findPositionForMemberFunction(definition, parentClass, access);
            if (memberPos) {
                return memberPos;
            }
        }

        // If a sibling declaration couldn't be found in targetDoc, look for a position in a parent namespace.
        const namespacePos = await targetDoc.findPositionInParentNamespace(definition);
        if (namespacePos) {
            return namespacePos;
        }

        // If all else fails then return a position after the last symbol in the document.
        return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
    }

    /**
     * Returns the best position to place the definition for a function declaration.
     * If targetDoc is undefined then this SourceDocument will be used.
     */
    async findSmartPositionForFunctionDefinition(
        declarationOrPosition: SourceSymbol | CSymbol | ProposedPosition, targetDoc?: SourceDocument
    ): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const declaration = await async function (sourceDoc: SourceDocument): Promise<CSymbol | undefined> {
            if (declarationOrPosition instanceof ProposedPosition) {
                return declarationOrPosition.options.relativeTo !== undefined
                        ? sourceDoc.getSymbol(declarationOrPosition.options.relativeTo.start)
                        : sourceDoc.getSymbol(declarationOrPosition);
            } else if (declarationOrPosition instanceof CSymbol) {
                return declarationOrPosition;
            } else {
                return new CSymbol(declarationOrPosition, sourceDoc);
            }
        } (this);

        if (!targetDoc) {
            targetDoc = this;
        }

        if (!targetDoc.symbols) {
            await targetDoc.executeSourceSymbolProvider();
        }

        if (!targetDoc.symbols || targetDoc.symbols.length === 0) {
            return util.positionAfterLastNonEmptyLine(targetDoc);
        } else if (declaration?.uri.fsPath !== this.uri.fsPath || (!declaration.parent && this.symbols.length === 0)) {
            return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
        }

        const siblingFunctions = SourceDocument.siblingFunctions(declaration, this.symbols);
        const declarationIndex = SourceDocument.indexOfSymbol(declaration, siblingFunctions);
        const before = siblingFunctions.slice(0, declarationIndex).reverse();
        const after = siblingFunctions.slice(declarationIndex + 1);
        if (declarationOrPosition instanceof ProposedPosition) {
            const position = declarationOrPosition;
            if (position.options.after) {
                before.push(declaration);
                before.shift();
            } else if (position.options.before) {
                after.unshift(declaration);
                after.pop();
            }
        }

        const position = await this.findPositionRelativeToSiblings(declaration, before, after, targetDoc, true);
        if (position) {
            return position;
        }

        // If a sibling definition couldn't be found in targetDoc, look for a position in a parent namespace.
        const namespacePos = await targetDoc.findPositionInParentNamespace(declaration);
        if (namespacePos) {
            return namespacePos;
        }

        // If all else fails then return a position after the last symbol in the document.
        return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
    }

    async findPositionForFunctionDefinition(
        declaration: CSymbol, targetDoc?: SourceDocument
    ): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        if (!targetDoc) {
            targetDoc = this;
        }

        if (!targetDoc.symbols) {
            await targetDoc.executeSourceSymbolProvider();
        }

        if (!targetDoc.symbols || targetDoc.symbols.length === 0) {
            return util.positionAfterLastNonEmptyLine(targetDoc);
        } else if (declaration?.uri.fsPath !== this.uri.fsPath || (!declaration.parent && this.symbols.length === 0)) {
            return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
        }

        // If a sibling definition couldn't be found in targetDoc, look for a position in a parent namespace.
        const namespacePos = await targetDoc.findPositionInParentNamespace(declaration);
        if (namespacePos) {
            return namespacePos;
        }

        // If all else fails then return a position after the last symbol in the document.
        return targetDoc.positionAfterLastSymbol(targetDoc.symbols);
    }

    /**
     * Returns a position after the last symbol in this SourceDocument, or after the last non-empty line.
     */
    async findPositionForNewSymbol(): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }
        return this.positionAfterLastSymbol(this.symbols);
    }

    // TODO: Give this function a better name or refactor this to not be so terrible.
    private async findPositionRelativeToSiblings(
        anchorSymbol: CSymbol,
        before: SourceSymbol[],
        after: SourceSymbol[],
        targetDoc: SourceDocument,
        findDefinition: boolean,
        parentClass?: CSymbol
    ): Promise<ProposedPosition | undefined> {
        const anchorSymbolAllScopes = anchorSymbol.allScopes();

        let checkedFunctionCount = 0;
        for (const symbol of before) {
            if (checkedFunctionCount > 5) {
                break;
            }
            const functionSymbol = new CSymbol(symbol, this);
            const isDeclOrDef = findDefinition
                    ? functionSymbol.isFunctionDeclaration()
                    : functionSymbol.isFunctionDefinition();
            if (isDeclOrDef) {
                ++checkedFunctionCount;
                const location = findDefinition
                        ? await this.findDefinition(functionSymbol)
                        : await functionSymbol.findDeclaration();
                if (!location || location.uri.fsPath !== targetDoc.uri.fsPath) {
                    continue;
                }

                const linkedSymbol = await targetDoc.getSymbol(location.range.start);
                if (!linkedSymbol || linkedSymbol.isClassOrStruct()) {
                    /* cpptools is dumb and will return the class when finding the
                     * declaration/definition of an undeclared member function. */
                    continue;
                }

                if (!util.arraysIntersect(linkedSymbol.allScopes(), anchorSymbolAllScopes)) {
                    continue;
                }

                if (!(anchorSymbol.uri.fsPath === linkedSymbol.uri.fsPath
                        && anchorSymbol.parent?.range.contains(linkedSymbol.selectionRange))
                        && parentClass?.matches(linkedSymbol) !== false) {
                    this.proposedDefinitions.set(
                        anchorSymbol.selectionRange.start,
                        new vscode.Location(targetDoc.uri, linkedSymbol.selectionRange)
                    );
                    return new ProposedPosition(linkedSymbol.trailingCommentEnd(), {
                        relativeTo: linkedSymbol.range,
                        after: true
                    });
                }
            }
        }

        checkedFunctionCount = 0;
        for (const symbol of after) {
            if (checkedFunctionCount > 5) {
                break;
            }
            const functionSymbol = new CSymbol(symbol, this);
            const isDeclOrDef = findDefinition
                    ? functionSymbol.isFunctionDeclaration()
                    : functionSymbol.isFunctionDefinition();
            if (isDeclOrDef) {
                ++checkedFunctionCount;
                const location = findDefinition
                        ? await this.findDefinition(functionSymbol)
                        : await functionSymbol.findDeclaration();
                if (!location || location.uri.fsPath !== targetDoc.uri.fsPath) {
                    continue;
                }

                const linkedSymbol = await targetDoc.getSymbol(location.range.start);
                if (!linkedSymbol || linkedSymbol.isClassOrStruct()) {
                    /* cpptools is dumb and will return the class when finding the
                     * declaration/definition of an undeclared member function. */
                    continue;
                }

                if (!util.arraysIntersect(linkedSymbol.allScopes(), anchorSymbolAllScopes)) {
                    continue;
                }

                if (!(anchorSymbol.uri.fsPath === linkedSymbol.uri.fsPath
                        && anchorSymbol.parent?.range.contains(linkedSymbol.selectionRange))
                        && parentClass?.matches(linkedSymbol) !== false) {
                    this.proposedDefinitions.set(
                        anchorSymbol.selectionRange.start,
                        new vscode.Location(targetDoc.uri, linkedSymbol.selectionRange)
                    );
                    return new ProposedPosition(linkedSymbol.leadingCommentStart, {
                        relativeTo: linkedSymbol.range,
                        before: true
                    });
                }
            }
        }
    }

    private async findPositionForMemberFunction(
        symbol: CSymbol,
        parentClass?: CSymbol,
        access?: util.AccessLevel
    ): Promise<ProposedPosition | undefined> {
        if (!access) {
            access = util.AccessLevel.public;
        }

        if (parentClass) {
            return parentClass.findPositionForNewMemberFunction(access);
        }

        const immediateScope = symbol.immediateScope();
        if (immediateScope) {
            const parentClassLocation = await immediateScope.findDefinition();
            if (parentClassLocation?.uri.fsPath === this.uri.fsPath) {
                parentClass = await this.getSymbol(parentClassLocation.range.start);
                if (parentClass?.isClassOrStruct()) {
                    return parentClass.findPositionForNewMemberFunction(access);
                }
            }
        }
    }

    private async findPositionInParentNamespace(symbol: CSymbol): Promise<ProposedPosition | undefined> {
        for (const scope of symbol.scopes().reverse()) {
            if (scope.kind === vscode.SymbolKind.Namespace) {
                const targetNamespace = await this.findMatchingSymbol(scope);
                if (!targetNamespace) {
                    continue;
                }

                if (targetNamespace.children.length === 0) {
                    return new ProposedPosition(targetNamespace.bodyStart(), {
                        after: true,
                        nextTo: true,
                        emptyScope: true,
                        inNamespace: true
                    });
                }

                const lastChild = new CSymbol(targetNamespace.children[targetNamespace.children.length - 1], this);
                return new ProposedPosition(lastChild.trailingCommentEnd(), {
                    relativeTo: lastChild.range,
                    after: true
                });
            }
        }
    }

    private positionAfterLastSymbol(symbols: SourceSymbol[]): ProposedPosition {
        if (symbols.length > 0) {
            const lastSymbol = new CSymbol(symbols[symbols.length - 1], this);
            return new ProposedPosition(lastSymbol.trailingCommentEnd(), {
                relativeTo: lastSymbol.range,
                after: true
            });
        }
        return util.positionAfterLastNonEmptyLine(this);
    }

    private async findDefinition(symbol: SourceSymbol): Promise<vscode.Location | undefined> {
        const definition = this.proposedDefinitions.get(symbol.selectionRange.start);
        if (definition) {
            return definition;
        }
        return symbol.findDefinition();
    }

    private static siblingFunctions(symbol: SourceSymbol, topLevelSymbols: SourceSymbol[]): SourceSymbol[] {
        return (symbol.parent ? symbol.parent.children : topLevelSymbols).filter(sibling => {
            return sibling.isFunction();
        });
    }

    private static indexOfSymbol(symbol: SourceSymbol, siblings: SourceSymbol[]): number {
        const declarationSelectionRange = symbol.selectionRange;
        return siblings.findIndex(sibling => {
            return sibling.selectionRange.isEqual(declarationSelectionRange);
        });
    }
}
