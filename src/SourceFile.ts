import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';


/**
 * Represents a C/C++ source file.
 */
export class SourceFile
{
    readonly uri: vscode.Uri;
    symbols?: SourceSymbol[];

    constructor(uri: vscode.Uri)
    {
        this.uri = uri;
    }

    /**
     * Effectively promotes this SourceFile to a SourceDocument by opening the cooresponding TextDocument.
     */
    async openDocument(): Promise<SourceDocument>
    {
        const document = await vscode.workspace.openTextDocument(this.uri);
        return new SourceDocument(document, this);
    }

    get fileName(): string { return this.uri.fsPath; }

    /**
     * Executes the 'vscode.executeDocumentSymbolProvider' command and converts them to
     * SourceSymbols to update the symbols property. Returns a reference to the new symbols.
     * Methods that use the symbols property will call this automatically if needed.
     */
    async executeSourceSymbolProvider(): Promise<SourceSymbol[]>
    {
        const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', this.uri);
        if (!documentSymbols) {
            return [];
        }

        documentSymbols.sort((a: vscode.DocumentSymbol, b: vscode.DocumentSymbol) => {
            return a.range.end.isAfter(b.range.end) ? 1 : -1;
        });

        this.symbols = [];
        documentSymbols.forEach(newSymbol => {
            this.symbols?.push(new SourceSymbol(newSymbol, this.uri));
        });

        return this.symbols;
    }

    async getSymbol(position: vscode.Position): Promise<SourceSymbol | undefined>
    {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const searchSymbolTree = (sourceSymbols: SourceSymbol[]): SourceSymbol | undefined => {
            for (const sourceSymbol of sourceSymbols) {
                if (!sourceSymbol.range.contains(position)) {
                    continue;
                }

                if (sourceSymbol.children.length === 0) {
                    return sourceSymbol;
                } else {
                    return searchSymbolTree(sourceSymbol.children);
                }
            }
        };

        return searchSymbolTree(this.symbols);
    }

    async findDefintions(position: vscode.Position): Promise<vscode.Location[]>
    {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider', this.uri, position);

        return this.makeLocationArray(definitionResults);
    }

    async findDeclarations(position: vscode.Position): Promise<vscode.Location[]>
    {
        const declarationResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDeclarationProvider', this.uri, position);

        return this.makeLocationArray(declarationResults);
    }

    async findMatchingSymbol(target: SourceSymbol): Promise<SourceSymbol | undefined>
    {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const searchSymbolTree = (sourceSymbols: SourceSymbol[]): SourceSymbol | undefined => {
            for (const sourceSymbol of sourceSymbols) {
                if (sourceSymbol.name === target.name) {
                    return sourceSymbol;
                } else {
                    return searchSymbolTree(sourceSymbol.children);
                }
            }
        };

        return searchSymbolTree(this.symbols);
    }

    isHeader(): boolean
    {
        return cfg.headerExtensions().includes(util.fileExtension(this.uri.path));
    }

    /**
     * Returns a SourceSymbol tree of just the namespaces in this SourceFile.
     */
    async namespaces(): Promise<SourceSymbol[]>
    {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        const searchSymbolTree = (sourceSymbols: SourceSymbol[]): SourceSymbol[] => {
            let namespaces: SourceSymbol[] = [];
            for (const sourceSymbol of sourceSymbols) {
                if (sourceSymbol.kind === vscode.SymbolKind.Namespace) {
                    const namespace = new SourceSymbol(sourceSymbol, this.uri, sourceSymbol.parent);
                    namespace.children = searchSymbolTree(sourceSymbol.children);
                    namespaces.push(namespace);
                }
            }
            return namespaces;
        };

        return searchSymbolTree(this.symbols);
    }

    async isNamespaceBodyIndented(): Promise<boolean>
    {
        if (!this.symbols) {
            this.symbols = await this.executeSourceSymbolProvider();
        }

        for (const symbol of this.symbols) {
            if (symbol.kind === vscode.SymbolKind.Namespace) {
                for (const child of symbol.children) {
                    return (child.range.start.character > 0) ? true : false;
                }
            }
        }

        return false;
    }

    private makeLocationArray(input?: vscode.Location[] | vscode.LocationLink[]): vscode.Location[]
    {
        if (!input) {
            return [];
        }

        let locations: vscode.Location[] = [];
        for (const element of input) {
            const location = (element instanceof vscode.Location) ?
                    element : new vscode.Location(element.targetUri, element.targetRange);
            locations.push(location);
        }

        return locations;
    }
}
