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
export class SourceDocument extends SourceFile
{
    readonly document: vscode.TextDocument;

    constructor(document: vscode.TextDocument, sourceFile?: SourceFile)
    {
        super(document.uri);
        this.document = document;
        this.symbols = sourceFile?.symbols;
    }

    static async open(uri: vscode.Uri): Promise<SourceDocument>
    {
        const document = await vscode.workspace.openTextDocument(uri);
        return new SourceDocument(document);
    }

    text(): string { return this.document.getText(); }

    get languageId(): string { return this.document.languageId; }

    async getSymbol(position: vscode.Position): Promise<CSymbol | undefined>
    {
        const sourceSymbol = await super.getSymbol(position);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this.document);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<CSymbol | undefined>
    {
        const sourceSymbol = await super.findMatchingSymbol(target);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this.document);
    }

    hasHeaderGuard(): boolean
    {
        return this.positionAfterHeaderGuard() !== undefined;
    }

    positionAfterHeaderGuard(): vscode.Position | undefined
    {
        let offset: number | undefined;
        let maskedText = util.maskComments(this.text());
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
            const positionOfHeaderGuard = this.document.positionAt(offset);
            return new vscode.Position(positionOfHeaderGuard.line + 1, 0);
        }
    }

    positionAfterHeaderComment(): ProposedPosition
    {
        const maskedText = util.maskComments(this.text(), false);
        let match = maskedText.match(/\S/);
        if (match?.index !== undefined) {
            // Return position before first non-comment text.
            return new ProposedPosition(this.document.positionAt(match.index), { before: true });
        }

        // Return position after header comment when there is no non-comment text in the file.
        const endTrimmedTextLength = this.text().trimEnd().length;
        return new ProposedPosition(this.document.positionAt(endTrimmedTextLength), {
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
                return util.positionAfterLastNonEmptyLine(targetDoc.document);
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
                    const bodyStart = targetDoc.document.offsetAt(targetNamespace.range.start)
                            + targetNamespace.text().indexOf('{') + 1;
                    return new ProposedPosition(targetDoc.document.positionAt(bodyStart), {
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
        return util.positionAfterLastNonEmptyLine(this.document);
    }

    /**
     * DocumentSymbol ranges don't always include the final semi-colon.
     */
    private getEndOfStatement(position: vscode.Position): vscode.Position
    {
        let nextPosition = position.translate(0, 1);
        while (this.document.getText(new vscode.Range(position, nextPosition)) === ';') {
            position = nextPosition;
            nextPosition = position.translate(0, 1);
        }
        return position;
    }
}
