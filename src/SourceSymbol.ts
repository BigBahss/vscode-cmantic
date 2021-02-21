import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceFile } from './SourceFile';


/**
 * Extends DocumentSymbol by adding a parent property and making sure that children are sorted by range.
 * Additionally, some properties are normalized for different language servers.
 */
export class SourceSymbol extends vscode.DocumentSymbol {
    readonly uri: vscode.Uri;
    signature: string;
    parent?: SourceSymbol;
    children: SourceSymbol[];

    get location(): vscode.Location { return new vscode.Location(this.uri, this.range); }

    constructor(docSymbol: vscode.DocumentSymbol, uri: vscode.Uri, parent?: SourceSymbol) {
        super(docSymbol.name, docSymbol.detail, docSymbol.kind, docSymbol.range, docSymbol.selectionRange);
        this.uri = uri;
        this.signature = docSymbol.name;
        this.parent = parent;

        // ms-vscode.cpptools puts function signatures in name, so we want to store the actual function name in name.
        let name = docSymbol.name;
        if (name.includes('(')) {
            name = name.substring(0, name.indexOf('('));
        }
        if (name.endsWith('>') && name.includes('<')) {
            name = name.substring(0, name.indexOf('<'));
        }
        if (name.includes('::')) {
            name = name.substring(name.lastIndexOf('::') + 2);
        }
        this.name = name;

        // ccls puts function signatures in the detail property.
        if (docSymbol.detail.includes(docSymbol.name + '(')) {
            this.signature = docSymbol.detail;
            // ccls recognizes static member functions as properties, so we give it a more appropriate SymbolKind.
            if (docSymbol.kind === vscode.SymbolKind.Property) {
                this.kind = vscode.SymbolKind.Method;
            }
        }

        // Sort docSymbol.children based on their relative position to eachother.
        docSymbol.children.sort((a: vscode.DocumentSymbol, b: vscode.DocumentSymbol) => {
            return a.range.end.isAfter(b.range.end) ? 1 : -1;
        });

        // Convert docSymbol.children to SourceSymbols to set the children property.
        const convertedChildren: SourceSymbol[] = [];
        docSymbol.children.forEach(child => {
            convertedChildren.push(new SourceSymbol(child, uri, this));
        });

        this.children = convertedChildren;
    }

    /**
     * Finds the most likely definition of this SourceSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely definition is this SourceSymbol.
     */
    async findDefinition(): Promise<vscode.Location | undefined> {
        const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider', this.uri, this.selectionRange.start);
        return this.findMostLikelyResult(definitionResults);
    }

    /**
     * Finds the most likely declaration of this SourceSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely declaration is this SourceSymbol.
     */
    async findDeclaration(): Promise<vscode.Location | undefined> {
        const declarationResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDeclarationProvider', this.uri, this.selectionRange.start);
        return this.findMostLikelyResult(declarationResults);
    }

    private findMostLikelyResult(results?: vscode.Location[] | vscode.LocationLink[]): vscode.Location | undefined {
        const thisFileNameBase = util.fileNameBase(this.uri.fsPath);
        for (const location of util.makeLocationArray(results)) {
            if (!util.existsInWorkspace(location)) {
                continue;
            }

            if (util.fileNameBase(location.uri.fsPath) === thisFileNameBase
                    && !(location.uri.fsPath === this.uri.fsPath && this.range.contains(location.range))) {
                return location;
            }
        }
    }

    /**
     * Returns an array of SourceSymbol's starting with the top-most ancestor and ending with this.parent.
     * Returns an empty array if this is a top-level symbol (parent is undefined).
     */
    scopes(): SourceSymbol[] {
        const scopes: SourceSymbol[] = [];
        let symbol: SourceSymbol = this;
        while (symbol.parent) {
            scopes.push(symbol.parent);
            symbol = symbol.parent;
        }
        return scopes.reverse();
    }

    async scopeString(target: SourceFile, position: vscode.Position): Promise<string> {
        let scopeString = '';
        for (const scope of this.scopes()) {
            const targetScope = await target.findMatchingSymbol(scope);
            // Check if position exists inside of a corresponding scope block. If so, omit that scope.name.
            if (!targetScope || targetScope.range.start.isAfterOrEqual(position)
                    || targetScope.range.end.isBeforeOrEqual(position)) {
                scopeString += scope.name + '::';
            }
        }
        return scopeString;
    }

    isMemberVariable(): boolean {
        return this.parent?.isClassOrStruct() === true
                && (this.kind === vscode.SymbolKind.Field || this.kind === vscode.SymbolKind.Property);
    }

    isVariable(): boolean {
        return this.kind === vscode.SymbolKind.Variable || this.isMemberVariable();
    }

    isFunction(): boolean {
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

    isConstructor(): boolean {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
            return true;
        case vscode.SymbolKind.Method:
            return this.name === this.parent?.name;
        default:
            return false;
        }
    }

    isDestructor(): boolean {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
            return this.name === '~' + this.parent?.name;
        default:
            return false;
        }
    }

    isClassOrStruct(): boolean {
        return this.kind === vscode.SymbolKind.Class || this.kind === vscode.SymbolKind.Struct;
    }

    /**
     * This is a fuzzy test to see if the symbol might be a typedef or type-alias. This tells us that it
     * is worth it to open the document cooresponding to this.uri to resolve the typedef/type-alias.
     */
    mightBeTypedefOrTypeAlias(): boolean {
        return this.kind === vscode.SymbolKind.Interface    // cpptools
            || this.kind === vscode.SymbolKind.Class        // clangd
            || this.kind === vscode.SymbolKind.Property;    // ccls
    }

    /**
     * Checks for common naming schemes of private members and returns the base name.
     */
    baseName(): string {
        if (/^_+|_+$/.test(this.name)) {
            return this.name.replace(/^_+|_+$/g, '');
        }
        if (/^m_[\w_][\w\d_]*$/.test(this.name)) {
            return this.name.replace(/^m_/, '');
        }
        if (/^s_[\w_][\w\d_]*$/.test(this.name)) {
            return this.name.replace(/^s_/, '');
        }

        return this.name;
    }

    getterName(): string {
        if (!this.isMemberVariable()) {
            return '';
        }

        const formattedBaseName = cfg.formatToCaseStyle(this.baseName());
        if (formattedBaseName !== this.name) {
            return formattedBaseName;
        }

        return cfg.formatToCaseStyle('get_' + formattedBaseName);
    }

    setterName(): string {
        if (!this.isMemberVariable()) {
            return '';
        }

        return cfg.formatToCaseStyle('set_' + this.baseName());
    }

    findGetterFor(memberVariable: SourceSymbol): SourceSymbol | undefined {
        if (memberVariable.parent !== this || !memberVariable.isMemberVariable()) {
            return;
        }

        const getterName = memberVariable.getterName();

        return this.children.find(child => child.name === getterName);
    }

    findSetterFor(memberVariable: SourceSymbol): SourceSymbol | undefined {
        if (memberVariable.parent !== this || !memberVariable.isMemberVariable()) {
            return;
        }

        const setterName = memberVariable.setterName();

        return this.children.find(child => child.name === setterName);
    }
}
