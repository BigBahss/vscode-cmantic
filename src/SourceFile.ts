import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import SourceSymbol from './SourceSymbol';
import CSymbol from './CSymbol';


/**
 * Represents a C/C++ source file.
 */
export default class SourceFile {
    readonly uri: vscode.Uri;
    symbols?: SourceSymbol[];

    constructor(uri: vscode.Uri) {
        this.uri = uri;
    }

    /**
     * Essentially promotes this SourceFile to a SourceDocument by opening the cooresponding TextDocument.
     */
    async openDocument(): Promise<SourceDocument> {
        const document = await vscode.workspace.openTextDocument(this.uri);
        return new SourceDocument(document, this);
    }

    get fileName(): string { return this.uri.fsPath; }

    /**
     * Executes the 'vscode.executeDocumentSymbolProvider' command and converts them to
     * SourceSymbols to update the symbols property. Returns a reference to the new symbols.
     * Methods that use the symbols property will call this automatically if needed.
     */
    async executeSourceSymbolProvider(): Promise<SourceSymbol[]> {
        const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', this.uri);
        if (!documentSymbols) {
            return [];
        }

        documentSymbols.sort(util.sortByRange);

        this.symbols = [];
        documentSymbols.forEach(symbol => this.symbols?.push(new SourceSymbol(symbol, this.uri)));

        return this.symbols;
    }

    async getSymbol(position: vscode.Position): Promise<SourceSymbol | undefined> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        return function searchSymbolTree(sourceSymbols: SourceSymbol[]): SourceSymbol | undefined {
            for (const sourceSymbol of sourceSymbols) {
                if (!sourceSymbol.range.contains(position)) {
                    continue;
                }

                if (sourceSymbol.children.length === 0 || sourceSymbol.selectionRange.contains(position)) {
                    return sourceSymbol;
                } else {
                    const child = searchSymbolTree(sourceSymbol.children);
                    return child ? child : sourceSymbol;
                }
            }
        } (this.symbols);
    }

    static async getSymbol(location: vscode.Location): Promise<SourceSymbol | undefined> {
        const sourceFile = new SourceFile(location.uri);
        return sourceFile.getSymbol(location.range.start);
    }

    async findDefintions(position: vscode.Position): Promise<vscode.Location[]> {
        const definitionResults = await vscode.commands.executeCommand<util.LocationType[]>(
                'vscode.executeDefinitionProvider', this.uri, position);
        return util.makeLocationArray(definitionResults);
    }

    async findDeclarations(position: vscode.Position): Promise<vscode.Location[]> {
        const declarationResults = await vscode.commands.executeCommand<util.LocationType[]>(
                'vscode.executeDeclarationProvider', this.uri, position);
        return util.makeLocationArray(declarationResults);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<SourceSymbol | undefined> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }
        return SourceFile.findMatchingSymbol(target, this.symbols);
    }

    isHeader(): boolean { return SourceFile.isHeader(this.uri); }

    static isHeader(uri: vscode.Uri): boolean {
        return cfg.headerExtensions().includes(util.fileExtension(uri.fsPath));
    }

    protected static findMatchingSymbol(
        target: SourceSymbol | CSymbol, symbols: SourceSymbol[], document?: SourceDocument
    ): SourceSymbol | CSymbol | undefined {
        for (const symbol of symbols) {
            if (document && target instanceof CSymbol) {
                const csymbol = new CSymbol(symbol, document);
                if (csymbol.matches(target)) {
                    return csymbol;
                }
            } else if (symbol.matches(target)) {
                return symbol;
            }

            const foundSymbol = SourceFile.findMatchingSymbol(target, symbol.children, document);
            if (foundSymbol) {
                return foundSymbol;
            }
        }
    }
}
