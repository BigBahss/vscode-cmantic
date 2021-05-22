import * as vscode from 'vscode';
import * as parse from './parsing';
import CSymbol from './CSymbol';
import { ParameterList, Parameter, parseParameterList } from './ParameterList';


export { ParameterList, Parameter };

export type RefQualifier = '' | '&' | '&&';

export default class FunctionSignature {
    readonly name: string;
    readonly isDefinition: boolean;
    readonly uri: vscode.Uri;
    readonly range: vscode.Range;
    readonly returnType: string;
    readonly returnTypeRange: vscode.Range;
    readonly parameters: ParameterList;
    readonly isConstexpr: boolean;
    readonly isConsteval: boolean;
    readonly isConst: boolean;
    readonly isVolatile: boolean;
    readonly refQualifier: RefQualifier;
    readonly noexcept: string;
    readonly trailingSpecifierRange: vscode.Range;

    private _normalizedReturnType?: string;
    private _normalizedNoexcept?: string;

    get normalizedReturnType(): string {
        return this._normalizedReturnType
            ?? (this._normalizedReturnType = parse.normalizeSourceText(this.returnType));
    }

    get normalizedNoexcept(): string {
        return this._normalizedNoexcept
            ?? (this._normalizedNoexcept = parse.normalizeSourceText(this.noexcept));
    }

    get hasTrailingReturnType(): boolean {
        return this.returnTypeRange.start.isAfter(this.parameters.range.end);
    }

    constructor(functionSymbol: CSymbol) {
        if (!functionSymbol.isFunction()) {
            throw new Error(`FunctionSignature: Cannot construct from non-function symbol "${functionSymbol.name}".`);
        }

        this.name = functionSymbol.name;
        this.isDefinition = functionSymbol.isFunctionDefinition();
        this.uri = functionSymbol.uri;

        const sourceDoc = functionSymbol.document;

        const declarationStart = functionSymbol.declarationStart();
        const declarationStartOffset = sourceDoc.offsetAt(declarationStart);
        const declarationEnd = functionSymbol.declarationEnd();
        this.range = new vscode.Range(declarationStart, declarationEnd);

        const declaration = sourceDoc.getText(this.range);
        const maskedDeclaration = parse.maskParentheses(parse.maskNonSourceText(declaration));

        const nameStartIndex = sourceDoc.offsetAt(functionSymbol.selectionRange.start) - declarationStartOffset;
        const paramStartIndex = maskedDeclaration.indexOf('(', nameStartIndex);
        const paramEndIndex = maskedDeclaration.indexOf(')', nameStartIndex);
        if (paramStartIndex === -1 || paramEndIndex === -1) {
            throw new Error(`FunctionSignature: Cannot find parameters for function "${functionSymbol.name}".`);
        }

        const parametersStart = sourceDoc.positionAt(declarationStartOffset + paramStartIndex + 1);
        const parametersEnd = sourceDoc.positionAt(declarationStartOffset + paramEndIndex);
        const parametersRange = new vscode.Range(parametersStart, parametersEnd);
        this.parameters = parseParameterList(sourceDoc, parametersRange);

        this.isConstexpr = functionSymbol.isConstexpr();
        this.isConsteval = functionSymbol.isConsteval();

        const trailingSpecifierStart = sourceDoc.positionAt(declarationStartOffset + paramEndIndex + 1);
        this.trailingSpecifierRange = new vscode.Range(trailingSpecifierStart, declarationEnd);

        const trailingText = declaration.slice(paramEndIndex + 1);
        const maskedTrailingText = maskedDeclaration.slice(paramEndIndex + 1);

        const noexceptMatch = maskedTrailingText.match(/\bnoexcept\b(\s*\(\s*\))?/);
        this.noexcept = noexceptMatch?.index !== undefined
                ? trailingText.slice(noexceptMatch.index, noexceptMatch.index + noexceptMatch[0].length)
                : '';

        if (functionSymbol.isConstructor() || functionSymbol.isDestructor()) {
            this.returnType = '';
            this.returnTypeRange = functionSymbol.selectionRange;
            this.isConst = false;
            this.isVolatile = false;
            this.refQualifier = '';
            return;
        }

        const trailingReturnMatch = maskedTrailingText.match(/(->\s*)(.+)(?=\s*$)/s);
        if (trailingReturnMatch?.index !== undefined) {
            const maskedTrailingSpecifiers = maskedTrailingText.slice(0, trailingReturnMatch.index);
            this.isConst = /\bconst\b/.test(maskedTrailingSpecifiers);
            this.isVolatile = /\bvolatile\b/.test(maskedTrailingSpecifiers);
            this.refQualifier = getRefQualifier(maskedTrailingSpecifiers);

            const trailingSpecifierEndOffset = declarationStartOffset + paramEndIndex + 1 + trailingReturnMatch.index;
            const trailingSpecifierEnd = sourceDoc.positionAt(trailingSpecifierEndOffset);
            this.trailingSpecifierRange = new vscode.Range(trailingSpecifierStart, trailingSpecifierEnd);

            const trailingReturnText = trailingText.slice(trailingReturnMatch.index + trailingReturnMatch[1].length);
            this.returnType = parse.getTrailingReturnType(trailingReturnText);
            const returnStartOffset = trailingSpecifierEndOffset + trailingReturnMatch[1].length;
            const returnStart = sourceDoc.positionAt(returnStartOffset);
            const returnEnd = sourceDoc.positionAt(returnStartOffset + this.returnType.length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        } else {
            this.isConst = /\bconst\b/.test(maskedTrailingText);
            this.isVolatile = /\bvolatile\b/.test(maskedTrailingText);
            this.refQualifier = getRefQualifier(maskedTrailingText);

            const returnEnd = functionSymbol.scopeStringStart();
            const returnEndOffset = sourceDoc.offsetAt(returnEnd);
            const returnEndIndex = returnEndOffset - declarationStartOffset;
            this.returnType = parse.getLeadingReturnType(declaration.slice(0, returnEndIndex));
            const returnStart = sourceDoc.positionAt(returnEndOffset - this.returnType.length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        }
    }

    isEqual(other: FunctionSignature): boolean {
        return this.parameters.typesAreEqual(other.parameters)
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
