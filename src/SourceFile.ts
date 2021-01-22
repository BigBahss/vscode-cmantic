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
        return SourceFile.isHeader(this.uri.path);
    }

    static isHeader(fileName: string): boolean
    {
        return cfg.headerExtensions().includes(util.fileExtension(fileName));
    }

    async findMatchingSourceFile(): Promise<vscode.Uri | undefined>
    {
        return SourceFile.findMatchingSourceFile(this.uri.path);
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
            if (typeof smallestDiff === 'undefined' || diff < smallestDiff) {
                smallestDiff = diff;
                bestMatch = uri;
            }
        }

        return bestMatch;
    }
}
