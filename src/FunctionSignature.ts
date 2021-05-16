import * as vscode from 'vscode';
import * as util from './utility';
import * as parse from './parsing';
import CSymbol from './CSymbol';


export default class FunctionSignature {
    readonly name: string = '';
    readonly returnType: string = '';
    readonly returnTypeRange?: vscode.Range;
    readonly parameterTypes: string[] = [];
    readonly isNoexcept: boolean = false;
    readonly isConst: boolean = false;
    readonly isVolatile: boolean = false;
    readonly isConstexpr: boolean = false;
    readonly isConsteval: boolean = false;

    private _normalizedReturnType: string | undefined;
    private _normalizedParameterTypes: string[] | undefined;

    get normalizedReturnType(): string {
        return this._normalizedReturnType
            ?? (this._normalizedReturnType = parse.normalize(this.returnType));
    }

    get normalizedParameterTypes(): string[] {
        return this._normalizedParameterTypes
            ?? (this._normalizedParameterTypes = this.parameterTypes.map(type => parse.normalize(type)));
    }

    constructor(functionSymbol: CSymbol) {
        if (!functionSymbol.isFunction()) {
            return;
        }

        const doc = functionSymbol.document;
        const declarationStart = functionSymbol.declarationStart();
        const declarationStartOffset = doc.offsetAt(declarationStart);
        const declaration = doc.getText(new vscode.Range(declarationStart, functionSymbol.declarationEnd()));
        const maskedDeclaration = parse.maskParentheses(parse.maskNonSourceText(declaration));

        const nameEndIndex = doc.offsetAt(functionSymbol.selectionRange.end) - declarationStartOffset;
        const paramStartIndex = maskedDeclaration.indexOf('(', nameEndIndex);
        const paramEndIndex = maskedDeclaration.indexOf(')', nameEndIndex);
        if (paramStartIndex === -1 || paramEndIndex === -1) {
            return;
        }

        this.name = functionSymbol.name;
        this.parameterTypes = parse.getParameterTypes(declaration.slice(paramStartIndex + 1, paramEndIndex));

        const trailingText = maskedDeclaration.slice(paramEndIndex);
        this.isNoexcept = /\bnoexcept\b/.test(trailingText);
        this.isConst = /\bconst\b/.test(trailingText);
        this.isVolatile = /\bvolatile\b/.test(trailingText);
        this.isConstexpr = functionSymbol.isConstexpr();
        this.isConsteval = functionSymbol.isConsteval();

        if (functionSymbol.isConstructor() || functionSymbol.isDestructor()) {
            return;
        }

        const trailingReturnMatch = trailingText.match(/(?<=->\s*).+(\s*$)/);
        if (trailingReturnMatch?.index !== undefined) {
            this.returnType = trailingReturnMatch[0];
            const returnStartOffset = declarationStartOffset + paramEndIndex + trailingReturnMatch.index;
            const returnStart = doc.positionAt(returnStartOffset);
            const returnEnd = doc.positionAt(returnStartOffset + trailingReturnMatch[0].length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        } else {
            const returnEnd = functionSymbol.scopeStringStart();
            const returnEndOffset = doc.offsetAt(returnEnd);
            const returnEndIndex = returnEndOffset - declarationStartOffset;
            this.returnType = parse.getLeadingReturnType(declaration.slice(0, returnEndIndex));
            const returnStart = doc.positionAt(returnEndOffset - this.returnType.length);
            this.returnTypeRange = new vscode.Range(returnStart, returnEnd);
        }
    }

    equals(other: FunctionSignature): boolean {
        return util.arraysAreEqual(this.normalizedParameterTypes, other.normalizedParameterTypes)
            && this.normalizedReturnType === other.normalizedReturnType
            && this.isNoexcept === other.isNoexcept
            && this.isConst === other.isConst
            && this.isVolatile === other.isVolatile
            && this.isConstexpr === other.isConstexpr
            && this.isConsteval === other.isConsteval;
    }
}
