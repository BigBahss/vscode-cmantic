import * as vscode from 'vscode';
import * as util from './utility';
import * as parse from './parsing';
import { activeLanguageServer, LanguageServer } from './extension';


/**
 * Extends DocumentSymbol by adding a parent property and making sure that children are sorted by range.
 * Additionally, some properties are normalized since they vary for different language servers.
 */
export default class SourceSymbol extends vscode.DocumentSymbol {
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
            this.detail = symbol.detail;
            this.signature = symbol.signature;
            this.parent = symbol.parent;
            this.children = symbol.children;
            return;
        }

        this.detail = symbol.name;
        this.parent = parent;

        this.name = symbol.name;
        if (activeLanguageServer() === LanguageServer.cpptools) {
            // cpptools puts function signatures and template arguments in the name property.
            this.signature = symbol.name;
            let maskedText = parse.maskAngleBrackets(this.name);
            if (this.isFunction()) {
                maskedText = parse.maskParentheses(maskedText);
                const lastIndexOfParen = maskedText.lastIndexOf('(');
                if (lastIndexOfParen !== -1) {
                    this.name = this.name.slice(0, lastIndexOfParen);
                }
            }

            if (this.name.endsWith('>') && !this.name.endsWith('<=>')) {
                const lastIndexOfAngleBracket = maskedText.lastIndexOf('<');
                if (lastIndexOfAngleBracket !== -1) {
                    this.name = this.name.slice(0, lastIndexOfAngleBracket);
                }
            }
            this.detail = this.name;
        } else {
            this.signature = symbol.detail;
        }

        const lastIndexOfScopeResolution = this.name.lastIndexOf('::');
        if (lastIndexOfScopeResolution !== -1 && !this.name.endsWith('::')) {
            this.name = this.name.slice(lastIndexOfScopeResolution + 2);
        }

        if (activeLanguageServer() === LanguageServer.ccls) {
            if (symbol.detail.includes(this.name + '::' + this.name)) {
                this.detail = this.name + '::' + this.name;
            }

            if (symbol.kind === vscode.SymbolKind.Property) {
                // ccls recognizes static member functions as properties, so we give it a more appropriate SymbolKind.
                this.kind = vscode.SymbolKind.Method;
            }
        }

        symbol.children.sort(util.sortByRange);
        this.children = symbol.children.map(child => new SourceSymbol(child, uri, this));
    }

    async findDefinition(): Promise<vscode.Location | undefined> {
        return util.findDefinition(this);
    }

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
        return this.name === other.name
            && (this.kind === other.kind || (this.isFunction() && other.isFunction()));
    }

    isMemberVariable(): boolean {
        return !!this.parent?.isClassType()
            && (this.kind === vscode.SymbolKind.Field || this.kind === vscode.SymbolKind.Property);
    }

    isVariable(): boolean {
        return this.kind === vscode.SymbolKind.Variable || this.isMemberVariable();
    }

    isFunction(): boolean {
        return this.kind === vscode.SymbolKind.Function
            || this.kind === vscode.SymbolKind.Method
            || this.kind === vscode.SymbolKind.Constructor
            || this.kind === vscode.SymbolKind.Operator;
    }

    isConstructor(): boolean {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Function:
            return (this.parent?.isClassType() && this.name === this.parent.name)
                || this.detail === this.name + '::' + this.name;
        default:
            return false;
        }
    }

    isDestructor(): boolean {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Function:
            return this.name.startsWith('~');
        default:
            return false;
        }
    }

    isClass(): boolean {
        return this.kind === vscode.SymbolKind.Class;
    }

    isStruct(): boolean {
        return this.kind === vscode.SymbolKind.Struct;
    }

    /**
     * Tests if this symbol is a class, struct, or union. Note that the LSP does not have a SymbolKind
     * for unions, so it is up to the language server to provide them as classes or structs. Also note
     * that clangd provides typedefs and type-aliases as classes, so this test is not perfect.
     */
    isClassType(): boolean {
        return this.kind === vscode.SymbolKind.Class || this.kind === vscode.SymbolKind.Struct;
    }

    isNamespace(): boolean {
        return this.kind === vscode.SymbolKind.Namespace;
    }

    isEnum(): boolean {
        return this.kind === vscode.SymbolKind.Enum;
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

    memberVariables(): SourceSymbol[] {
        if (!this.isClassType()) {
            return [];
        }

        return this.children.filter(child => child.isMemberVariable());
    }

    constructors(): SourceSymbol[] {
        if (!this.isClassType()) {
            return [];
        }

        return this.children.filter(child => child.isConstructor());
    }
}
