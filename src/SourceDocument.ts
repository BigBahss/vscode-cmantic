import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as parse from './parsing';
import * as path from 'path';
import { CSymbol } from './CSymbol';
import { SourceFile } from './SourceFile';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from './ProposedPosition';

/**
 * Represents a C/C++ source file.
 */
export class SourceDocument extends SourceFile implements vscode.TextDocument {
    private readonly doc: vscode.TextDocument;

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

    async getSymbol(position: vscode.Position): Promise<CSymbol | undefined> {
        const sourceSymbol = await super.getSymbol(position);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this);
    }

    static async getSymbol(location: vscode.Location): Promise<CSymbol | undefined> {
        const sourceDoc = await SourceDocument.open(location.uri);
        return await sourceDoc.getSymbol(location.range.start);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<CSymbol | undefined> {
        const sourceSymbol = await super.findMatchingSymbol(target);
        if (!sourceSymbol) {
            return;
        }

        return new CSymbol(sourceSymbol, this);
    }

    hasHeaderGuard(): boolean {
        return this.positionAfterHeaderGuard() !== undefined;
    }

    positionAfterHeaderGuard(): vscode.Position | undefined {
        let offset: number | undefined;
        let maskedText = parse.maskComments(this.getText());
        maskedText = parse.maskRawStringLiterals(maskedText);
        maskedText = parse.maskQuotes(maskedText);

        const pragmaOnceOffset = maskedText.search(/^\s*#\s*pragma\s+once\b/);
        if (pragmaOnceOffset !== -1) {
            offset = pragmaOnceOffset;
        }

        const headerGuardDefine = cfg.headerGuardDefine(path.basename(this.fileName));
        const re_headerGuardDefine = new RegExp(`^\\s*#\\s*define\\s+${headerGuardDefine}\\b`, 'm');
        const defineOffset = maskedText.search(re_headerGuardDefine);
        if (defineOffset !== -1) {
            offset = defineOffset;
        }

        if (offset !== undefined) {
            return new vscode.Position(this.positionAt(offset).line + 1, 0);
        }
    }

    positionAfterHeaderComment(): ProposedPosition {
        const maskedText = parse.maskComments(this.getText(), false);
        let offset = maskedText.search(/\S/);
        if (offset !== -1) {
            // Return position before first non-comment text.
            return new ProposedPosition(this.positionAt(offset), { before: true });
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
        declarationOrPosition: SourceSymbol | CSymbol | ProposedPosition, targetDoc?: SourceDocument
    ): Promise<ProposedPosition> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }
        let declaration: CSymbol | undefined;
        if (declarationOrPosition instanceof ProposedPosition) {
            declaration = declarationOrPosition.options.relativeTo !== undefined
                    ? await this.getSymbol(declarationOrPosition.options.relativeTo.start)
                    : await this.getSymbol(declarationOrPosition);
        } else {
            declaration = new CSymbol(declarationOrPosition, this);
        }

        if (declaration?.uri.fsPath !== this.uri.fsPath || (!declaration?.parent && this.symbols.length === 0)) {
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
        const siblingFunctions = SourceDocument.siblingFunctions(declaration, this.symbols);
        const declarationSelectionRange = declaration.selectionRange;
        const declarationIndex = siblingFunctions.findIndex(symbol => {
            return symbol.selectionRange.isEqual(declarationSelectionRange);
        });
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

        // Find a definition of a sibling symbol in targetDoc.
        let functionDeclarationCount = 0;
        for (const symbol of before) {
            if (functionDeclarationCount > 4) {
                break;
            }
            const functionSymbol = new CSymbol(symbol, this);
            if (functionSymbol.isFunctionDeclaration()) {
                ++functionDeclarationCount;
                const definitionLocation = await symbol.findDefinition();
                if (!definitionLocation || definitionLocation.uri.fsPath !== targetDoc.uri.fsPath) {
                    continue;
                }

                const definition = await targetDoc.getSymbol(definitionLocation.range.start);
                if (definition && !(declaration.uri.fsPath === definition.uri.fsPath
                        && declaration.parent?.range.contains(definition.selectionRange))) {
                    return new ProposedPosition(definition.range.end, {
                        relativeTo: definition.range,
                        after: true
                    });
                }
            }
        }
        functionDeclarationCount = 0;
        for (const symbol of after) {
            if (functionDeclarationCount > 4) {
                break;
            }
            const functionSymbol = new CSymbol(symbol, this);
            if (functionSymbol.isFunctionDeclaration()) {
                ++functionDeclarationCount;
                const definitionLocation = await symbol.findDefinition();
                if (!definitionLocation || definitionLocation.uri.fsPath !== targetDoc.uri.fsPath) {
                    continue;
                }

                const definition = await targetDoc.getSymbol(definitionLocation.range.start);
                if (definition && !(declaration.uri.fsPath === definition.uri.fsPath
                        && declaration.parent?.range.contains(definition.selectionRange))) {
                    const leadingCommentStart = definition.leadingCommentStart;
                    return new ProposedPosition(leadingCommentStart, {
                        relativeTo: new vscode.Range(leadingCommentStart, definition.range.end),
                        before: true
                    });
                }
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
                            + targetNamespace.parsableText.indexOf('{') + 1;
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
    findPositionForNewInclude(): { system: vscode.Position; project: vscode.Position } {
        // TODO: Clean up this mess.
        function largestBlock (
            line: vscode.TextLine, start: vscode.Position, largest: vscode.Range | undefined
        ): vscode.Range {
            const r = new vscode.Range(start, line.range.start);
            return (!largest || r > largest) ? r : largest;
        };

        let systemIncludeStart: vscode.Position | undefined;
        let projectIncludeStart: vscode.Position | undefined;
        let largestSystemIncludeBlock: vscode.Range | undefined;
        let largestProjectIncludeBlock: vscode.Range | undefined;
        for (let i = 0; i < this.lineCount; ++i) {
            const line = this.lineAt(i);
            if (!/^\s*#\s*include\s*(<.+>)|(".+")/.test(line.text)) {
                if (systemIncludeStart) {
                    largestSystemIncludeBlock = largestBlock(line, systemIncludeStart, largestSystemIncludeBlock);
                    systemIncludeStart = undefined;
                } else if (projectIncludeStart) {
                    largestProjectIncludeBlock = largestBlock(line, projectIncludeStart, largestProjectIncludeBlock);
                    projectIncludeStart = undefined;
                }
            } else if (/<.+>/.test(line.text)) {
                if (!systemIncludeStart) {
                    systemIncludeStart = line.range.start;
                }
                if (projectIncludeStart) {
                    largestProjectIncludeBlock = largestBlock(line, projectIncludeStart, largestProjectIncludeBlock);
                    projectIncludeStart = undefined;
                }
            } else if (/".+"/.test(line.text)) {
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
    async findPositionForNewSymbol(): Promise<ProposedPosition> {
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

    private getEndOfStatement(position: vscode.Position): vscode.Position {
        return parse.getEndOfStatement(this, position);
    }

    private static siblingFunctions(symbol: SourceSymbol, topLevelSymbols: SourceSymbol[]): SourceSymbol[] {
        return (symbol.parent ? symbol.parent.children : topLevelSymbols).filter(sibling => {
            return sibling.isFunction();
        });
    }
}
