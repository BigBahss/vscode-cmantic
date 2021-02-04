import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { CSymbol } from './CSymbol';
import { SourceFile } from './SourceFile';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from "./ProposedPosition";

/**
 * Represents a C/C++ source file.
 */
export class SourceDocument extends SourceFile implements vscode.TextDocument
{
    private readonly doc: vscode.TextDocument;

    constructor(document: vscode.TextDocument, sourceFile?: SourceFile)
    {
        super(document.uri);
        this.doc = document;
        this.symbols = sourceFile?.symbols;
    }

    static async open(uri: vscode.Uri): Promise<SourceDocument>
    {
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

    async getSymbol(position: vscode.Position): Promise<CSymbol | undefined>
    {
        const sourceSymbol = await super.getSymbol(position);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<CSymbol | undefined>
    {
        const sourceSymbol = await super.findMatchingSymbol(target);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this);
    }

    hasHeaderGuard(): boolean
    {
        return this.positionAfterHeaderGuard() !== undefined;
    }

    positionAfterHeaderGuard(): vscode.Position | undefined
    {
        let offset: number | undefined;
        let maskedText = util.maskComments(this.getText());
        maskedText = util.maskStringLiterals(maskedText);

        const pragmaOnceMatch = maskedText.match(/^\s*#pragma\s+once\b/);
        if (pragmaOnceMatch) {
            offset = pragmaOnceMatch.index;
        }

        const headerGuardDefine = cfg.headerGuardDefine(util.fileName(this.uri.path));
        const re_headerGuardDefine = new RegExp('^\\s*#define\\s+' + headerGuardDefine + '\\b', 'm');
        const defineMatch = maskedText.match(re_headerGuardDefine);
        if (defineMatch) {
            offset = defineMatch.index;
        }

        if (offset !== undefined) {
            const positionOfHeaderGuard = this.positionAt(offset);
            return new vscode.Position(positionOfHeaderGuard.line + 1, 0);
        }
    }

    positionAfterHeaderComment(): ProposedPosition
    {
        const maskedText = util.maskComments(this.getText(), false);
        let match = maskedText.match(/\S/);
        if (match?.index !== undefined) {
            // Return position before first non-comment text.
            return new ProposedPosition(this.positionAt(match.index), { before: true });
        }

        // Return position after header comment when there is no non-comment text in the file.
        const endTrimmedTextLength = this.getText().trimEnd().length;
        return new ProposedPosition(this.positionAt(endTrimmedTextLength), {
            after: endTrimmedTextLength !== 0
        });
    }

    /**
     * Returns the best position to place the definition for a function declaration.
     * If targetDoc is undefined the position will be for this SourceDocument.
     */
    async findPositionForFunctionDefinition(
        declarationOrPosition: SourceSymbol | ProposedPosition, targetDoc?: SourceDocument
    ): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }
        const declaration = (declarationOrPosition instanceof SourceSymbol) ?
                declarationOrPosition : await this.getSymbol(declarationOrPosition);
        if (declaration?.uri.path !== this.uri.path || (!declaration?.parent && this.symbols.length === 0)) {
            return new ProposedPosition();
        }

        if (!targetDoc) {
            targetDoc = this;
        }
        if (!targetDoc.symbols) {
            targetDoc.symbols = await targetDoc.executeSourceSymbolProvider();
            if (targetDoc.symbols.length === 0) {
                return util.positionAfterLastNonEmptyLine(targetDoc);
            }
        }

        // Get the first 5 symbols that come before and after declaration.
        // We look for definitions of these symbols in targetDoc and return a position relative to the closest one.
        const siblingSymbols = declaration.parent ? declaration.parent.children : this.symbols;
        let relativeSymbolIndex = 0;
        for (const symbol of siblingSymbols) {
            if (symbol.range.isEqual(declaration.range)) {
                break;
            }
            ++relativeSymbolIndex;
        }
        const start = Math.max(relativeSymbolIndex - 5, 0);
        const end = Math.min(relativeSymbolIndex + 6, siblingSymbols.length);
        const before = siblingSymbols.slice(start, relativeSymbolIndex);
        const after = siblingSymbols.slice(relativeSymbolIndex + 1, end);
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

        // Find a definition of a sibling symbol in targetDoc.
        for (const symbol of before.reverse()) {
            const definitionLocation = await symbol.findDefinition();
            if (!definitionLocation || definitionLocation.uri.path !== targetDoc.uri.path) {
                continue;
            }

            const definition = await targetDoc.getSymbol(definitionLocation.range.start);
            if (definition) {
                const endPosition = targetDoc.getEndOfStatement(definition.range.end);
                return new ProposedPosition(endPosition, {
                    relativeTo: new vscode.Range(definition.range.start, endPosition),
                    after: true
                });
            }
        }
        for (const symbol of after) {
            const definitionLocation = await symbol.findDefinition();
            if (!definitionLocation || definitionLocation.uri.path !== targetDoc.uri.path) {
                continue;
            }

            const definition = await targetDoc.getSymbol(definitionLocation.range.start);
            if (definition) {
                const endPosition = targetDoc.getEndOfStatement(definition.range.end);
                return new ProposedPosition(definition.range.start, {
                    relativeTo: new vscode.Range(definition.range.start, endPosition),
                    before: true
                });
            }
        }

        // If a sibling definition couldn't be found in targetDoc, look for a cooresponding namespace block.
        for (const scope of declaration.scopes().reverse()) {
            if (scope.kind === vscode.SymbolKind.Namespace) {
                const targetNamespace = await targetDoc.findMatchingSymbol(scope);
                if (!targetNamespace) {
                    continue;
                }

                if (targetNamespace.children.length === 0) {
                    const bodyStart = targetDoc.offsetAt(targetNamespace.range.start)
                            + targetNamespace.text().indexOf('{') + 1;
                    return new ProposedPosition(targetDoc.positionAt(bodyStart), {
                        after: true,
                        nextTo: true,
                        emptyScope: true
                    });
                }
                const lastChild = targetNamespace.children[targetNamespace.children.length - 1];
                const endPosition = targetDoc.getEndOfStatement(lastChild.range.end);
                return new ProposedPosition(endPosition, {
                    relativeTo: new vscode.Range(lastChild.range.start, endPosition),
                    after: true
                });
            }
        }

        // If all else fails then return a position after the last symbol in the document.
        const lastSymbol = targetDoc.symbols[targetDoc.symbols.length - 1];
        const endPosition = targetDoc.getEndOfStatement(lastSymbol.range.end);
        return new ProposedPosition(endPosition, {
            relativeTo: new vscode.Range(lastSymbol.range.start, endPosition),
            after: true
        });
    }

    /**
     * Returns the best positions to place new includes (system and project includes).
     */
    findPositionForNewInclude(): { system: vscode.Position; project: vscode.Position }
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
        for (let i = 0; i < this.lineCount; ++i) {
            const line = this.lineAt(i);
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

        let position = this.positionAfterHeaderGuard();
        if (!position) {
            position = this.positionAfterHeaderComment();
        }

        return { system: position, project: position };
    }

    /**
     * Returns a position after the last symbol in this SourceDocument, or the last non-empty line.
     */
    async findPositionForNewSymbol(): Promise<ProposedPosition>
    {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }
        if (this.symbols.length > 0) {
            return new ProposedPosition(this.getEndOfStatement(this.symbols[this.symbols.length - 1].range.end), {
                after: true
            });
        }
        return util.positionAfterLastNonEmptyLine(this);
    }

    /**
     * DocumentSymbol ranges don't always include the final semi-colon.
     */
    private getEndOfStatement(position: vscode.Position): vscode.Position
    {
        let nextPosition = position.translate(0, 1);
        while (this.getText(new vscode.Range(position, nextPosition)) === ';') {
            position = nextPosition;
            nextPosition = position.translate(0, 1);
        }
        return position;
    }
}
