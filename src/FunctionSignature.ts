import * as vscode from 'vscode';
import * as util from './utility';
import * as parse from './parsing';
import CSymbol from './CSymbol';
import { ParameterList, parseParameterList } from './ParameterList';


export type RefQualifier = '' | '&' | '&&';

export default class FunctionSignature {
    readonly uri: vscode.Uri;
    readonly range: vscode.Range;
    readonly name: string;
    readonly returnType: string;
    readonly returnTypeRange: vscode.Range;
    readonly parameters: ParameterList;
    readonly parametersRange: vscode.Range;
    readonly trailingSpecifierRange: vscode.Range;
    readonly isConstexpr: boolean;
    readonly isConsteval: boolean;
    readonly isConst: boolean;
    readonly isVolatile: boolean;
    readonly refQualifier: RefQualifier;
    readonly noexcept: string;

    private _normalizedReturnType: string | undefined;
    private _normalizedNoexcept: string | undefined;

    get normalizedReturnType(): string {
        return this._normalizedReturnType
            ?? (this._normalizedReturnType = parse.normalizeSourceText(this.returnType));
    }

    get normalizedNoexcept(): string {
        return this._normalizedNoexcept
            ?? (this._normalizedNoexcept = parse.normalizeSourceText(this.noexcept));
    }

    get hasTrailingReturnType(): boolean {
        return this.returnTypeRange.start.isAfter(this.parametersRange.end);
    }

    constructor(functionSymbol: CSymbol) {
        if (!functionSymbol.isFunction()) {
            throw new Error(`FunctionSignature: Cannot construct from non-function symbol "${functionSymbol.name}".`);
        }

        const doc = functionSymbol.document;
        this.uri = doc.uri;
        const declarationStart = functionSymbol.declarationStart();
        const declarationStartOffset = doc.offsetAt(declarationStart);
        const declarationEnd = functionSymbol.declarationEnd();
        this.range = new vscode.Range(declarationStart, declarationEnd);
        const declaration = doc.getText(this.range);
        const maskedDeclaration = parse.maskParentheses(parse.maskNonSourceText(declaration));

        const nameEndIndex = doc.offsetAt(functionSymbol.selectionRange.end) - declarationStartOffset;
        const paramStartIndex = maskedDeclaration.indexOf('(', nameEndIndex);
        const paramEndIndex = maskedDeclaration.indexOf(')', nameEndIndex);
        if (paramStartIndex === -1 || paramEndIndex === -1) {
            throw new Error(`FunctionSignature: Cannot find parameters for function "${functionSymbol.name}".`);
        }

        this.name = functionSymbol.name;
        const rawParameters = declaration.slice(paramStartIndex + 1, paramEndIndex);
        const paramStartOffset = declarationStartOffset + paramStartIndex + 1;
        this.parameters = parseParameterList(rawParameters, paramStartOffset, doc);
        const parametersStart = doc.positionAt(paramStartOffset);
        const parametersEnd = doc.positionAt(declarationStartOffset + paramEndIndex);
        this.parametersRange = new vscode.Range(parametersStart, parametersEnd);

        this.isConstexpr = functionSymbol.isConstexpr();
        this.isConsteval = functionSymbol.isConsteval();

        const trailingText = declaration.slice(paramEndIndex + 1);
        const maskedTrailingText = maskedDeclaration.slice(paramEndIndex + 1);
        const noexceptMatch = maskedTrailingText.match(/\bnoexcept\b(\s*\(\s*\))?/);
        this.noexcept = noexceptMatch?.index !== undefined
                ? trailingText.slice(noexceptMatch.index, noexceptMatch.index + noexceptMatch[0].length)
                : '';

        const trailingSpecifierStart = doc.positionAt(declarationStartOffset + paramEndIndex + 1);
        this.trailingSpecifierRange = new vscode.Range(trailingSpecifierStart, declarationEnd);

        if (functionSymbol.isConstructor() || functionSymbol.isDestructor()) {
            this.returnType = '';
            this.returnTypeRange = functionSymbol.selectionRange;
            this.isConst = false;
            this.isVolatile = false;
            this.refQualifier = '';
            return;
        }

        this.isConst = /\bconst\b/.test(maskedTrailingText);
        this.isVolatile = /\bvolatile\b/.test(maskedTrailingText);

        const trailingReturnMatch = maskedTrailingText.match(/(->\s*)(.+)(?=\s*$)/s);
        if (trailingReturnMatch?.index !== undefined) {
            this.refQualifier = getRefQualifier(maskedTrailingText.slice(0, trailingReturnMatch.index));
            const trailingSpecifierEndOffset = declarationStartOffset + paramEndIndex + 1 + trailingReturnMatch.index;
            const trailingSpecifierEnd = doc.positionAt(trailingSpecifierEndOffset);
            this.trailingSpecifierRange = new vscode.Range(trailingSpecifierStart, trailingSpecifierEnd);
            const trailingReturnText = trailingText.slice(trailingReturnMatch.index + trailingReturnMatch[1].length);
            this.returnType = parse.getTrailingReturnType(trailingReturnText);
            const returnStartOffset = trailingSpecifierEndOffset + trailingReturnMatch[1].length;
            const returnStart = doc.positionAt(returnStartOffset);
            const returnEnd = doc.positionAt(returnStartOffset + this.returnType.length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        } else {
            this.refQualifier = getRefQualifier(maskedTrailingText);
            const returnEnd = functionSymbol.scopeStringStart();
            const returnEndOffset = doc.offsetAt(returnEnd);
            const returnEndIndex = returnEndOffset - declarationStartOffset;
            this.returnType = parse.getLeadingReturnType(declaration.slice(0, returnEndIndex));
            const returnStart = doc.positionAt(returnEndOffset - this.returnType.length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        }
    }

    equals(other: FunctionSignature): boolean {
        return this.parameters.typesEquals(other.parameters)
            && this.normalizedReturnType === other.normalizedReturnType
            && this.isConstexpr === other.isConstexpr
            && this.isConsteval === other.isConsteval
            && this.isConst === other.isConst
            && this.isVolatile === other.isVolatile
            && this.refQualifier === other.refQualifier
            && this.normalizedNoexcept === other.normalizedNoexcept;
    }
}

function getRefQualifier(maskedTrailingSpecifiers: string): RefQualifier {
    if (maskedTrailingSpecifiers.includes('&&')) {
        return '&&';
    } else if (maskedTrailingSpecifiers.includes('&')) {
        return '&';
    } else {
        return '';
    }
}
