import * as vscode from 'vscode';
import * as util from './utility';


// Extends DocumentSymbol by adding a parent property and making sure that children are sorted by range.
export class SourceSymbol extends vscode.DocumentSymbol
{
    readonly uri: vscode.Uri;
    parent?: SourceSymbol;
    children: SourceSymbol[];

    get location(): vscode.Location { return new vscode.Location(this.uri, this.range); }

    constructor(docSymbol: vscode.DocumentSymbol, uri: vscode.Uri, parent?: SourceSymbol)
    {
        super(docSymbol.name, docSymbol.detail, docSymbol.kind, docSymbol.range, docSymbol.selectionRange);
        this.uri = uri;
        this.parent = parent;

        // Sorts docSymbol.children based on their relative position to eachother.
        docSymbol.children.sort((a: vscode.DocumentSymbol, b: vscode.DocumentSymbol) => {
            return a.range.start.isAfter(b.range.start) ? 1 : -1;
        });

        // Convert docSymbol.children to SourceSymbols to set the children property.
        let convertedChildren: SourceSymbol[] = [];
        docSymbol.children.forEach(child => {
            convertedChildren.push(new SourceSymbol(child, uri, this));
        });

        this.children = convertedChildren;
    }

    findChild(compareFn: (child: SourceSymbol) => boolean): SourceSymbol | undefined
    {
        for (const child of this.children) {
            if (compareFn(child)) {
                return child;
            }
        }
    }

    // Finds the most likely definition of this SourceSymbol and only returns a result with the same base file name.
    async findDefinition(): Promise<vscode.Location | undefined> {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider', this.uri, this.selectionRange.start);
        if (!definitionResults) {
            return;
        }

        const thisFileNameBase = util.fileNameBase(this.uri.path);
        for (const result of definitionResults) {
            const location = (result instanceof vscode.Location) ?
                    result : new vscode.Location(result.targetUri, result.targetRange);

            if (util.fileNameBase(location.uri.path) === thisFileNameBase) {
                return location;
            }
        }
    }

    // Finds the most likely declaration of this SourceSymbol and only returns a result with the same base file name.
    async findDeclaration(): Promise<vscode.Location | undefined> {
        const declarationResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDeclarationProvider', this.uri, this.selectionRange.start);
        if (!declarationResults) {
            return;
        }

        const thisFileNameBase = util.fileNameBase(this.uri.path);
        for (const result of declarationResults) {
            const location = (result instanceof vscode.Location) ?
                    result : new vscode.Location(result.targetUri, result.targetRange);

            if (util.fileNameBase(location.uri.path) === thisFileNameBase && !location.range.isEqual(this.range)) {
                return location;
            }
        }
    }

    // Returns an array of SourceSymbol's starting with the top-most ancestor and ending with this.parent.
    // Returns an empty array if this is a top-level symbol (parent is undefined).
    scopes(): SourceSymbol[]
    {
        let scopes: SourceSymbol[] = [];
        let symbol: SourceSymbol = this;
        while (symbol.parent) {
            scopes.push(symbol.parent);
            symbol = symbol.parent;
        }
        return scopes.reverse();
    }

    isMemberVariable(): boolean
    {
        return this.kind === vscode.SymbolKind.Field
                && (this.parent?.kind === vscode.SymbolKind.Class || this.parent?.kind === vscode.SymbolKind.Struct);
    }

    isFunction(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Operator:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Function:
            return true;
        default:
            return false;
        }
    }
}
