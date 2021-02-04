import * as vscode from 'vscode';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from "./ProposedPosition";
import { SourceFile } from "./SourceFile";
import { SourceDocument } from './SourceDocument';

const re_primitiveType = /\b(void|bool|char|wchar_t|char8_t|char16_t|char32_t|int|short|long|signed|unsigned|float|double)\b/g;


/**
 * Extends SourceSymbol by adding a document property that gives more semantic-awareness vs SourceSymbol.
 */
export class CSymbol extends SourceSymbol
{
    readonly document: vscode.TextDocument;
    parent?: CSymbol;

    /**
     * When constructing with a SourceSymbol that has a parent, the parent parameter may be omitted.
     */
    constructor(symbol: vscode.DocumentSymbol | SourceSymbol, document: vscode.TextDocument, parent?: CSymbol)
    {
        super(symbol, document.uri, parent);
        this.document = document;

        if (symbol instanceof SourceSymbol && symbol.parent && !parent) {
            this.parent = new CSymbol(symbol.parent, document);
        } else {
            this.parent = parent;
        }
    }

    findChild(compareFn: (child: CSymbol) => boolean): CSymbol | undefined
    {
        for (const symbol of this.children) {
            const child = new CSymbol(symbol, this.document);
            if (compareFn(child)) {
                return child;
            }
        }
    }

    /**
     * Returns the text contained in this symbol.
     */
    text(): string { return this.document.getText(this.range); }

    /**
     * Returns the range of this symbol including potential template statement.
     */
    getFullRange(): vscode.Range
    {
        return new vscode.Range(this.getTrueStart(), this.range.end);
    }

    /**
     * Returns the text of this symbol including potential template statement.
     */
    getFullText(): string
    {
        return this.document.getText(this.getFullRange());
    }

    /**
     * Returns the text contained in this symbol that comes before this.selectionRange.
     */
    leadingText(): string
    {
        return this.document.getText(new vscode.Range(this.range.start, this.selectionRange.start));
    }

    /**
     * Returns the text contained in this symbol that comes before this.selectionRange,
     * including potential template statement.
     */
    getFullLeadingText(): string
    {
        return this.document.getText(new vscode.Range(this.getTrueStart(), this.selectionRange.start));
    }

    isBefore(offset: number): boolean { return this.document.offsetAt(this.range.end) < offset; }

    isAfter(offset: number): boolean { return this.document.offsetAt(this.range.start) > offset; }

    async scopeString(target: SourceFile, position?: vscode.Position): Promise<string>
    {
        let scopeString = '';
        for (const scope of this.scopes()) {
            const targetScope = await target.findMatchingSymbol(scope);
            // Check if position exists inside of a namespace block. If so, omit that scope.id().
            if (!targetScope || (position && !targetScope.range.contains(position))) {
                scopeString += scope.name + '::';
            }
        }
        return scopeString;
    }

    /**
     * Finds a position for a new public method within this class or struct. Optionally provide a relativeName
     * to look for a position next to. Optionally provide a memberVariable if the new method is an accessor.
     * Returns undefined if this is not a class or struct, or when this.children.length === 0.
     */
    findPositionForNewMethod(relativeName?: string, memberVariable?: SourceSymbol): ProposedPosition | undefined
    {
        const lastChildPositionOrUndefined = (): ProposedPosition | undefined => {
            if (this.children.length === 0) {
                return undefined;
            }
            return new ProposedPosition(this.children[this.children.length - 1].range.end, {
                relativeTo: this.children[this.children.length - 1].range,
                after: true
            });
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
        let fallbackIndex: number | undefined;
        for (let i = this.children.length - 1; i >= 0; --i) {
            const symbol = new CSymbol(this.children[i], this.document, this);
            if (this.isChildFunctionBetween(symbol, publicSpecifierOffset, nextAccessSpecifierOffset)) {
                fallbackPosition = new ProposedPosition(symbol.range.end, {
                    relativeTo: symbol.range,
                    after: true
                });
                fallbackIndex = i;
                break;
            }
        }

        if (!fallbackPosition || fallbackIndex === undefined) {
            return lastChildPositionOrUndefined();
        } else if (!relativeName) {
            return fallbackPosition;
        }

        // If relativeName is a setterName, then ProposedPosition should be before, since the new method is a getter.
        // This is to match the positioning of these methods when both are generated at the same time.
        const isGetter = memberVariable ? relativeName === memberVariable.setterName() : false;

        for (let i = fallbackIndex; i >= 0; --i) {
            const symbol = new CSymbol(this.children[i], this.document, this);
            if (this.isChildFunctionBetween(symbol, publicSpecifierOffset, nextAccessSpecifierOffset)
                    && symbol.name === relativeName) {
                if (isGetter) {
                    return new ProposedPosition(symbol.range.start, {
                        relativeTo: symbol.range,
                        before: true,
                        nextTo: true
                    });
                }
                return new ProposedPosition(symbol.range.end, {
                    relativeTo: symbol.range,
                    after: true,
                    nextTo: true
                });
            }
        }

        return fallbackPosition;
    }

    isFunctionDeclaration(): boolean
    {
        return this.isFunction() && (this.detail === 'declaration' || !this.text().endsWith('}'));
    }

    isFunctionDefinition(): boolean
    {
        return this.isFunction() && !this.isFunctionDeclaration();
    }

    isConstexpr(): boolean
    {
        if (this.leadingText().match(/\bconstexpr\b/)) {
            return true;
        }
        return false;
    }

    isInline(): boolean
    {
        if (this.leadingText().match(/\binline\b/)) {
            return true;
        }
        return false;
    }

    isPointer(): boolean
    {
        return this.leadingText().includes('*');
    }

    isConst(): boolean
    {
        if (this.leadingText().match(/\bconst\b/)) {
            return true;
        }
        return false;
    }

    isPrimitive(): boolean
    {
        // TODO: Resolve typedefs and using-declarations.
        const leading = this.leadingText();
        if (leading.match(re_primitiveType) && !leading.match(/[<>]/g)) {
            return true;
        }
        return false;
    }

    /**
     * Formats this function declaration for use as a definition (without curly braces).
     */
    async newFunctionDefinition(target: SourceDocument, position?: vscode.Position): Promise<string>
    {
        if (!this.isFunctionDeclaration()) {
            return '';
        }

        const scopeString = await this.scopeString(target, position);

        const declaration = this.getFullText().replace(/;$/, '');
        const maskedDeclaration = this.maskUnimportantText(declaration);

        const paramStart = maskedDeclaration.indexOf('(', maskedDeclaration.indexOf(this.name) + this.name.length) + 1;
        const lastParen = maskedDeclaration.lastIndexOf(')');
        const trailingReturnOperator = maskedDeclaration.substring(paramStart, lastParen).indexOf('->');
        const paramEnd = (trailingReturnOperator === -1) ?
                lastParen : maskedDeclaration.substring(paramStart, trailingReturnOperator).lastIndexOf(')');
        const parameters = this.stripDefaultValues(declaration.substring(paramStart, paramEnd));

        // Intelligently align the definition in the case of a multi-line declaration.
        let leadingText = this.getFullLeadingText();
        const l = this.document.lineAt(this.range.start);
        const leadingIndent = l.text.substring(0, l.firstNonWhitespaceCharacterIndex).length;
        const leadingLines = leadingText.split(util.endOfLine(target.document));
        const alignLength = leadingLines[leadingLines.length - 1].length;
        const re_newLineAlignment = new RegExp('^' + ' '.repeat(leadingIndent + alignLength), 'gm');
        leadingText = leadingText.replace(/\b(virtual|static|explicit|friend)\b\s*/g, '');
        leadingText = leadingText.replace(/^\s+/gm, '');
        let definition = this.name + '(' + parameters + ')' + declaration.substring(paramEnd + 1);
        definition = definition.replace(re_newLineAlignment, ' '.repeat(alignLength + scopeString.length));

        definition = leadingText + scopeString + definition;
        definition = definition.replace(/\s*\b(override|final)\b/g, '');

        return definition;
    }

    /**
     * Masks comments, strings/chars, and template parameters in order to make parsing easier.
     */
    private maskUnimportantText(sourceText: string, keepEnclosingChars: boolean = true): string
    {
        sourceText = util.maskComments(sourceText, keepEnclosingChars);
        sourceText = util.maskStringLiterals(sourceText, keepEnclosingChars);
        sourceText = util.maskTemplateParameters(sourceText, keepEnclosingChars);

        return sourceText;
    }

    private stripDefaultValues(parameters: string): string
    {
        let maskedParameters = this.maskUnimportantText(parameters, false);
        maskedParameters = maskedParameters.replace(/[^\w\s]=/g, match => ' '.repeat(match.length));

        let splitParameters = maskedParameters.split(',');
        let strippedParameters = '';
        let charPos = 0;
        for (const parameter of splitParameters) {
            if (parameter.includes('=')) {
                strippedParameters += parameters.substring(charPos, charPos + parameter.indexOf('=')).trimEnd() + ',';
            } else {
                strippedParameters += parameters.substring(charPos, charPos + parameter.length) + ',';
            }
            charPos += parameter.length + 1;
        }

        return strippedParameters.substring(0, strippedParameters.length - 1);
    }

    /**
     * clangd and ccls don't include template statements in provided DocumentSymbols.
     */
    private getTrueStart(): vscode.Position
    {
        const before = new vscode.Range(new vscode.Position(0, 0), this.range.start);
        let maskedText = util.maskComments(this.document.getText(before), false);
        maskedText = util.maskStringLiterals(maskedText, false);
        maskedText = util.maskTemplateParameters(maskedText, true).trimEnd();
        if (!maskedText.endsWith('>')) {
            return this.range.start;
        }

        let lastMatch: RegExpMatchArray | undefined;
        for (const match of maskedText.matchAll(/\btemplate\s*<.+>/g)) {
            lastMatch = match;
        }
        if (!lastMatch?.index) {
            return this.range.start;
        }

        return this.document.positionAt(lastMatch.index);
    }

    private isChildFunctionBetween(child: CSymbol, afterOffset: number, beforeOffset: number): boolean
    {
        if (child.isFunction() && child.isAfter(afterOffset) && child.isBefore(beforeOffset)) {
            return true;
        }
        return false;
    };
}


/**
 * Represents a new accessor method for a member variable.
 */
export interface Accessor {
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;
    declaration: string;
    definition(target: SourceDocument, position: vscode.Position, newLineCurlyBrace: boolean): Promise<string>;
}

/**
 * Represents a new 'get' method for a member variable.
 */
export class Getter implements Accessor
{
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;

    constructor(memberVariable: CSymbol)
    {
        const leadingText = memberVariable.leadingText();
        this.memberVariable = memberVariable;
        this.name = memberVariable.getterName();
        this.isStatic = leadingText.match(/\bstatic\b/) !== null;
        this.returnType = leadingText.replace(/\b(static|const|mutable)\b\s*/g, '');
        this.parameter = '';
        this.body = 'return ' + memberVariable.name + ';';
    }

    get declaration(): string
    {
        return (this.isStatic ? 'static ' : '') + this.returnType + this.name + '()' + (this.isStatic ? '' : ' const');
    }

    async definition(target: SourceDocument, position: vscode.Position, newLineCurlyBrace: boolean): Promise<string>
    {
        const eol = util.endOfLine(target.document);
        return this.returnType + await this.memberVariable.scopeString(target, position) + this.name + '()'
                + (this.isStatic ? '' : ' const') + (newLineCurlyBrace ? eol : ' ')
                + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}

/**
 * Represents a new 'set' method for a member variable.
 */
export class Setter implements Accessor
{
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;

    constructor(memberVariable: CSymbol)
    {
        const leadingText = memberVariable.leadingText();
        const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');
        this.memberVariable = memberVariable;
        this.name = memberVariable.setterName();
        this.isStatic = leadingText.match(/\bstatic\b/) !== null;
        this.returnType = 'void ';
        this.parameter = (!memberVariable.isPrimitive() && !memberVariable.isPointer() ?
            'const ' + type + '&' :
            type
        ) + 'value';
        this.body = memberVariable.name + ' = value;';
    }

    get declaration(): string
    {
        return (this.isStatic ? 'static ' : '') + 'void ' + this.name + '(' + this.parameter + ')';
    }

    async definition(target: SourceDocument, position: vscode.Position, newLineCurlyBrace: boolean): Promise<string>
    {
        const eol = util.endOfLine(target.document);
        return this.returnType + await this.memberVariable.scopeString(target, position) + this.name
                + '(' + this.parameter + ')' + (newLineCurlyBrace ? eol : ' ')
                + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}
