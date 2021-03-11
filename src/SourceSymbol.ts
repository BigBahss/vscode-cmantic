import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';


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

    constructor(symbol: vscode.DocumentSymbol, uri: vscode.Uri, parent?: SourceSymbol) {
        super(symbol.name, symbol.detail, symbol.kind, symbol.range, symbol.selectionRange);
        this.uri = uri;

        if (symbol instanceof SourceSymbol) {
            // This was called from CSymbol's constructor, so short-circuit.
            this.signature = symbol.signature;
            this.parent = symbol.parent;
            this.children = symbol.children;
            return;
        }

        this.signature = symbol.name;
        this.parent = parent;

        // ms-vscode.cpptools puts function signatures in name, so we want to store the actual function name in name.
        let name = symbol.name;
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
        if (symbol.detail.includes(symbol.name + '(')) {
            this.signature = symbol.detail;
            // ccls recognizes static member functions as properties, so we give it a more appropriate SymbolKind.
            if (symbol.kind === vscode.SymbolKind.Property) {
                this.kind = vscode.SymbolKind.Method;
            }
        } else if (parent?.isClassOrStruct()) {
            this.signature = parent.name + '::' + this.signature;
        }

        // Sort docSymbol.children based on their relative position to eachother.
        symbol.children.sort(util.sortByRange);

        // Convert docSymbol.children to SourceSymbols to set the children property.
        this.children = [];
        symbol.children.forEach(child => this.children.push(new SourceSymbol(child, uri, this)));
    }

    /**
     * Finds the most likely definition of this SourceSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely definition is this SourceSymbol.
     */
    async findDefinition(): Promise<vscode.Location | undefined> {
        return util.findDefinition(this);
    }

    /**
     * Finds the most likely declaration of this SourceSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely declaration is this SourceSymbol.
     */
    async findDeclaration(): Promise<vscode.Location | undefined> {
        return util.findDeclaration(this);
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

    matches(other: SourceSymbol): boolean {
        if (this.kind !== vscode.SymbolKind.Namespace && this.uri.fsPath === other.uri.fsPath) {
            return this.selectionRange.isEqual(other.selectionRange);
        }
        return this.signature === other.signature
            && (this.kind === other.kind || (this.isFunction() && other.isFunction()));
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
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Function:
            return this.name === this.parent?.name || /^(?<name>[\w_][\w\d_]*)::\k<name>/.test(this.signature);
        default:
            return false;
        }
    }

    isDestructor(): boolean {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Function:
            return this.name === '~' + this.parent?.name || /^(?<name>[\w_][\w\d_]*)::~\k<name>/.test(this.signature);
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

    memberVariables(): SourceSymbol[] {
        if (!this.isClassOrStruct()) {
            return [];
        }

        return this.children.filter(child => child.isMemberVariable());
    }

    constructors(): SourceSymbol[] {
        if (!this.isClassOrStruct()) {
            return [];
        }

        return this.children.filter(child => child.isConstructor());
    }
}
