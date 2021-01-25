import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';


// Represents a C/C++ source file.
export class SourceFile
{
    readonly uri: vscode.Uri;
    symbols?: SourceSymbol[];

    constructor(uri: vscode.Uri)
    {
        this.uri = uri;
    }

    /* Executes the 'vscode.executeDocumentSymbolProvider' command and converts them to
     * SourceSymbols to update the symbols property. Returns a reference to the new symbols.
     * Methods that use the symbols property will call this automatically if needed. */
    async executeSourceSymbolProvider(): Promise<SourceSymbol[]>
    {
        const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', this.uri);
        if (!documentSymbols) {
            return [];
        }

        documentSymbols.sort((a: vscode.DocumentSymbol, b: vscode.DocumentSymbol) => {
            return a.range.start.isAfter(b.range.start) ? 1 : -1;
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

    async findDefintions(position: vscode.Position): Promise<vscode.Location[] | undefined>
    {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider', this.uri, position);
        if (!definitionResults) {
            return;
        }

        let locations: vscode.Location[] = [];
        for (const result of definitionResults) {
            const location = (result instanceof vscode.Location) ?
                    result : new vscode.Location(result.targetUri, result.targetRange);
            locations.push(location);
        }

        return locations;
    }

    async findDeclarations(position: vscode.Position): Promise<vscode.Location[] | undefined>
    {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDeclarationProvider', this.uri, position);
        if (!definitionResults) {
            return;
        }

        let locations: vscode.Location[] = [];
        for (const result of definitionResults) {
            const location = (result instanceof vscode.Location) ?
                    result : new vscode.Location(result.targetUri, result.targetRange);
            locations.push(location);
        }

        return locations;
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

    // Returns a SourceSymbol tree of the namespaces in this SourceFile.
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

    async namespaceBodyIsIndented(): Promise<boolean>
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
}
