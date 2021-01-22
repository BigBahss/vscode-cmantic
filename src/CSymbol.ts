import * as vscode from 'vscode';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from "./ProposedPosition";
import { SourceFile } from "./SourceFile";

const re_primitiveType = /\b(void|bool|char|wchar_t|char8_t|char16_t|char32_t|int|short|long|signed|unsigned|float|double)\b/g;


// Extends SourceSymbol by adding a document property that gives more semantic-awareness vs SourceSymbol.
export class CSymbol extends SourceSymbol
{
    readonly document: vscode.TextDocument;
    parent?: CSymbol;
    children: CSymbol[];

    // When constructing with a SourceSymbol that has a parent, the parent parameter may be omitted.
    constructor(symbol: vscode.DocumentSymbol | SourceSymbol, document: vscode.TextDocument, parent?: CSymbol)
    {
        super(symbol, document.uri, parent);
        this.document = document;

        if (symbol instanceof SourceSymbol && symbol.parent && !parent) {
            this.parent = new CSymbol(symbol.parent, document);
        } else {
            this.parent = parent;
        }

        symbol = (symbol instanceof SourceSymbol) ? symbol : new SourceSymbol(symbol, document.uri, parent);

        // Convert symbol.children to CSymbols to set the children property.
        let convertedChildren: CSymbol[] = [];
        symbol.children.forEach(child => {
            convertedChildren.push(new CSymbol(child, document, this));
        });

        this.children = convertedChildren;
    }

    findChild(compareFn: (child: CSymbol) => boolean): CSymbol | undefined
    {
        for (const child of this.children) {
            if (compareFn(child)) {
                return child;
            }
        }
    }

    // Returns all the text contained in this symbol.
    text(): string { return this.document.getText(this.range); }

    // Returns the identifier of this symbol, such as a function name. this.id() != this.name for functions.
    id(): string { return this.document.getText(this.selectionRange); }

    // Checks for common naming schemes of private members and return the base name.
    baseName(): string
    {
        const memberName = this.id();
        let baseMemberName: string | undefined;
        let match = /^_+[\w_][\w\d_]*_*$/.exec(memberName);
        if (match && !baseMemberName) {
            baseMemberName = memberName.replace(/^_+|_*$/g, '');
        }
        match = /^_*[\w_][\w\d_]*_+$/.exec(memberName);
        if (match && !baseMemberName) {
            baseMemberName = memberName.replace(/^_*|_+$/g, '');
        }
        match = /^m_[\w_][\w\d_]*$/.exec(memberName);
        if (match && !baseMemberName) {
            baseMemberName = memberName.replace(/^m_/, '');
        }

        return baseMemberName ? baseMemberName : memberName;
    }

    getterName(memberBaseName?: string): string
    {
        if (!this.isMemberVariable()) {
            return '';
        }

        memberBaseName = memberBaseName ? memberBaseName : this.baseName();
        if (memberBaseName === this.id()) {
            return 'get' + util.firstCharToUpper(memberBaseName);
        }
        return memberBaseName;
    }

    setterName(memberBaseName?: string): string
    {
        if (!this.isMemberVariable()) {
            return '';
        }

        memberBaseName = memberBaseName ? memberBaseName : this.baseName();
        return 'set' + util.firstCharToUpper(memberBaseName);
    }

    findGetterFor(memberVariable: CSymbol): CSymbol | undefined
    {
        if (memberVariable.parent !== this || !memberVariable.isMemberVariable()) {
            return;
        }

        const getterName = memberVariable.getterName();

        return this.findChild(child => child.id() === getterName);
    }

    findSetterFor(memberVariable: CSymbol): CSymbol | undefined
    {
        if (memberVariable.parent !== this || !memberVariable.isMemberVariable()) {
            return;
        }

        const setterName = memberVariable.setterName();

        return this.findChild(child => child.id() === setterName);
    }

    isBefore(offset: number): boolean { return this.document.offsetAt(this.range.end) < offset; }

    isAfter(offset: number): boolean { return this.document.offsetAt(this.range.start) > offset; }

    // Returns the text contained in this symbol that comes before this.id().
    leading(): string
    {
        return this.document.getText(new vscode.Range(this.range.start, this.selectionRange.start));
    }

    // Shadows scopes() in SourceSymbol but returns them as CSymbols.
    scopes(): CSymbol[]
    {
        let scopes: CSymbol[] = [];
        let symbol: CSymbol = this;
        while (symbol.parent) {
            scopes.push(symbol.parent);
            symbol = symbol.parent;
        }
        return scopes.reverse();
    }

    // Finds a position for a new public method within this class or struct.
    // Optionally provide a relativeName to look for a position next to.
    // Optionally provide a memberVariable if the new method is an accessor.
    // Returns undefined if this is not a class or struct, or when this.children.length === 0.
    findPositionForNewMethod(relativeName?: string, memberVariable?: CSymbol): ProposedPosition | undefined
    {
        const lastChildPositionOrUndefined = (): ProposedPosition | undefined => {
            if (this.children.length === 0) {
                return undefined;
            }
            return { value: this.children[this.children.length - 1].range.end, after: true };
        };

        const symbolIsBetween = (symbol: CSymbol, afterOffset: number, beforeOffset: number): boolean => {
            if (symbol.isFunction() && symbol.isAfter(afterOffset) && symbol.isBefore(beforeOffset)) {
                return true;
            }
            return false;
        };

        if (this.kind !== vscode.SymbolKind.Class && this.kind !== vscode.SymbolKind.Struct) {
            return lastChildPositionOrUndefined();
        }

        const text = this.text();
        const startOffset = this.document.offsetAt(this.range.start);
        let publicSpecifierOffset = /\bpublic\s*:/g.exec(text)?.index;

        if (!publicSpecifierOffset) {
            return lastChildPositionOrUndefined();
        }
        publicSpecifierOffset += startOffset;

        let nextAccessSpecifierOffset: number | undefined;
        for (const match of text.matchAll(/\w[\w\d]*\s*:(?!:)/g)) {
            if (!match.index) {
                continue;
            }
            if (match.index > publicSpecifierOffset) {
                nextAccessSpecifierOffset = match.index;
                break;
            }
        }

        if (!nextAccessSpecifierOffset) {
            nextAccessSpecifierOffset = this.document.offsetAt(this.range.end);
        } else {
            nextAccessSpecifierOffset += startOffset;
        }

        let fallbackPosition: ProposedPosition | undefined;
        let fallbackIndex = 0;
        for (let i = this.children.length - 1; i >= 0; --i) {
            const symbol = new CSymbol(this.children[i], this.document, this);
            if (symbolIsBetween(symbol, publicSpecifierOffset, nextAccessSpecifierOffset)) {
                fallbackPosition = { value: symbol.range.end, after: true };
                fallbackIndex = i;
                break;
            }
        }

        if (!fallbackPosition || !fallbackIndex) {
            return lastChildPositionOrUndefined();
        } else if (!relativeName) {
            return fallbackPosition;
        }

        // If relativeName is a setterName, then ProposedPosition should be before, since the new method is a getter.
        // This is to match the positioning of these methods when both are generated at the same time.
        const isGetter = memberVariable ? relativeName === memberVariable.setterName() : false;

        for (let i = fallbackIndex; i >= 0; --i) {
            const symbol = new CSymbol(this.children[i], this.document, this);
            if (symbolIsBetween(symbol, publicSpecifierOffset, nextAccessSpecifierOffset) && symbol.id() === relativeName) {
                if (isGetter) {
                    return { value: symbol.range.start, before: true, nextTo: true };
                } else {
                    return { value: symbol.range.end, after: true, nextTo: true };
                }
            }
        }

        return fallbackPosition;
    }

    isMemberVariable(): boolean
    {
        return this.kind === vscode.SymbolKind.Field;
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

    isFunctionDeclaration(): boolean
    {
        return this.isFunction() && (this.detail === 'declaration' || !this.text().endsWith('}'));
    }

    isConstructor(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
            return true;
        case vscode.SymbolKind.Method:
            return this.id() === this.parent?.id();
        default:
            return false;
        }
    }

    isDestructor(): boolean
    {
        switch (this.kind) {
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Method:
            return this.id() === '~' + this.parent?.id();
        default:
            return false;
        }
    }

    isConstexpr(): boolean
    {
        if (this.leading().match(/\bconstexpr\b/)) {
            return true;
        }
        return false;
    }

    isInline(): boolean
    {
        if (this.leading().match(/\binline\b/)) {
            return true;
        }
        return false;
    }

    isPointer(): boolean
    {
        return this.leading().includes('*') ? true : false;
    }

    isConst(): boolean
    {
        if (this.leading().match(/\bconst\b/)) {
            return true;
        }
        return false;
    }

    isPrimitive(): boolean
    {
        // TODO: Resolve typedefs and using-declarations.
        const leading = this.leading();
        if (leading.match(re_primitiveType) && !leading.match(/[<>]/g)) {
            return true;
        }
        return false;
    }

    // Formats this function declaration for use as a definition (without curly braces).
    async newFunctionDefinition(target: SourceFile, position?: vscode.Position): Promise<string>
    {
        if (!this.isFunctionDeclaration()) {
            return '';
        }

        // Build scope string to prepend to function name.
        // Check if position exists inside of namespace block. If so, omit that scope.id().
        let scopeString = '';
        for (const scope of this.scopes()) {
            const targetScope = await target.findMatchingSymbol(scope);
            if (!targetScope || (position && !targetScope.range.contains(position))) {
                scopeString += scope.id() + '::';
            }
        }

        const funcName = this.id();
        const declaration = this.text();
        const maskedDeclaration = this.maskUnimportantText(declaration);

        const paramStart = maskedDeclaration.indexOf('(', maskedDeclaration.indexOf(funcName) + funcName.length) + 1;
        const lastParen = maskedDeclaration.lastIndexOf(')');
        const trailingReturnOperator = maskedDeclaration.substring(paramStart, lastParen).indexOf('->');
        const paramEnd = (trailingReturnOperator === -1) ?
                lastParen : maskedDeclaration.substring(paramStart, trailingReturnOperator).lastIndexOf(')');
        const parameters = this.stripDefaultValues(declaration.substring(paramStart, paramEnd));

        // Intelligently align the definition in the case of a multi-line declaration.
        let leadingText = this.leading();
        const l = this.document.lineAt(this.range.start);
        const leadingIndent = l.text.substring(0, l.firstNonWhitespaceCharacterIndex).length;
        const re_newLineAlignment = new RegExp('^' + ' '.repeat(leadingIndent + leadingText.length), 'gm');
        leadingText = leadingText.replace(/\b(virtual|static|explicit|friend)\b\s*/g, '');
        let definition = funcName + '(' + parameters + ')'
                + declaration.substring(paramEnd + 1, declaration.length - 1);
        definition = definition.replace(re_newLineAlignment, ' '.repeat(leadingText.length + scopeString.length));

        definition = leadingText + scopeString + definition;
        definition = definition.replace(/\s*\b(override|final)\b/g, '');

        return definition;
    }

    private maskUnimportantText(source: string, maskChar: string = ' '): string
    {
        const replacer = (match: string) => maskChar.repeat(match.length);
        // Mask comments
        source = source.replace(/(?<=\/\*)(\*(?=\/)|[^*])*(?=\*\/)/g, replacer);
        source = source.replace(/(?<=\/\/).*/g, replacer);
        // Mask quoted characters
        source = source.replace(/(?<=").*(?=")(?<!\\)/g, replacer);
        source = source.replace(/(?<=').*(?=')(?<!\\)/g, replacer);
        // Mask template arguments
        source = source.replace(/(?<=<)(>(?=>)|[^>])*(?=>)/g, replacer);

        return source;
    }

    private stripDefaultValues(parameters: string): string
    {
        parameters = parameters.replace(/[^\w\s]=/g, '');
        parameters = parameters.replace(/\b\s*=\s*\b/g, '=');
        parameters = parameters.replace(/\(\)/g, '');

        let maskedParameters = this.maskUnimportantText(parameters).split(',');
        let strippedParameters = '';
        let charPos = 0;
        for (const maskedParameter of maskedParameters) {
            if (maskedParameter.includes('=')) {
                strippedParameters += parameters.substring(charPos, charPos + maskedParameter.indexOf('=')) + ',';
            } else {
                strippedParameters += parameters.substring(charPos, charPos + maskedParameter.length) + ',';
            }
            charPos += maskedParameter.length + 1;
        }

        return strippedParameters.substring(0, strippedParameters.length - 1);
    }
}
