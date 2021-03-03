import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';


/**
 * Represents a C/C++ source file.
 */
export class SourceFile {
    readonly uri: vscode.Uri;
    symbols?: SourceSymbol[];

    constructor(uri: vscode.Uri) {
        this.uri = uri;
    }

    /**
     * Effectively promotes this SourceFile to a SourceDocument by opening the cooresponding TextDocument.
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
        documentSymbols.forEach(newSymbol => this.symbols?.push(new SourceSymbol(newSymbol, this.uri)));

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
        return await sourceFile.getSymbol(location.range.start);
    }

    async findDefintions(position: vscode.Position): Promise<vscode.Location[]> {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider', this.uri, position);

        return util.makeLocationArray(definitionResults);
    }

    async findDeclarations(position: vscode.Position): Promise<vscode.Location[]> {
        const declarationResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDeclarationProvider', this.uri, position);

        return util.makeLocationArray(declarationResults);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<SourceSymbol | undefined> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        return function searchSymbolTree(sourceSymbols: SourceSymbol[]): SourceSymbol | undefined {
            for (const sourceSymbol of sourceSymbols) {
                if (sourceSymbol.equals(target)) {
                    return sourceSymbol;
                }

                const foundSymbol = searchSymbolTree(sourceSymbol.children);
                if (foundSymbol) {
                    return foundSymbol;
                }
            }
        } (this.symbols);
    }

    isHeader(): boolean { return SourceFile.isHeader(this.uri); }

    static isHeader(uri: vscode.Uri): boolean {
        return cfg.headerExtensions().includes(util.fileExtension(uri.fsPath));
    }

    /**
     * Returns a SourceSymbol tree of just the namespaces in this SourceFile.
     */
    async namespaces(): Promise<SourceSymbol[]> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const uri = this.uri;

        return function searchSymbolTree(sourceSymbols: SourceSymbol[]): SourceSymbol[] {
            const namespaces: SourceSymbol[] = [];
            for (const sourceSymbol of sourceSymbols) {
                if (sourceSymbol.kind === vscode.SymbolKind.Namespace) {
                    const namespace = new SourceSymbol(sourceSymbol, uri, sourceSymbol.parent);
                    namespace.children = searchSymbolTree(sourceSymbol.children);
                    namespaces.push(namespace);
                }
            }
            return namespaces;
        } (this.symbols);
    }

    async isNamespaceBodyIndented(): Promise<boolean> {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        for (const symbol of this.symbols) {
            if (symbol.kind === vscode.SymbolKind.Namespace) {
                for (const child of symbol.children) {
                    return child.range.start.character > symbol.range.start.character;
                }
            }
        }

        return false;
    }
}
