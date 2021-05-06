import * as vscode from 'vscode';
import * as util from './utility';
import * as parse from './parsing';
import CSymbol from './CSymbol';


export default class FunctionSignature {
    returnType: string = '';
    parameters: string[] = [];
    isNoexcept: boolean = false;
    isConst: boolean = false;
    isVolatile: boolean = false;
    isConstexpr: boolean = false;
    isConsteval: boolean = false;

    private constructor() { }

    static parse(symbol: CSymbol): FunctionSignature | undefined {
        if (!symbol.isFunction()) {
            return;
        }

        const doc = symbol.document;
        const declarationStart = symbol.declarationStart();
        const declarationStartOffset = doc.offsetAt(declarationStart);
        const declaration = doc.getText(new vscode.Range(declarationStart, symbol.declarationEnd()));
        const maskedDeclaration = parse.maskParentheses(parse.maskNonSourceText(declaration));

        const nameEndIndex = doc.offsetAt(symbol.selectionRange.end) - declarationStartOffset;
        const paramStartIndex = maskedDeclaration.indexOf('(', nameEndIndex) + 1;
        const paramEndIndex = maskedDeclaration.indexOf(')', nameEndIndex);
        if (paramStartIndex === -1 || paramEndIndex === -1) {
            return;
        }

        const signature = new FunctionSignature();

        signature.parameters = parse.parseParameterTypes(declaration.slice(paramStartIndex, paramEndIndex));

        const trailingText = maskedDeclaration.slice(paramEndIndex);
        signature.isNoexcept = /\bnoexcept\b/.test(trailingText);
        signature.isConst = /\bconst\b/.test(trailingText);
        signature.isVolatile = /\bvolatile\b/.test(trailingText);
        signature.isConstexpr = symbol.isConstexpr();
        signature.isConsteval = symbol.isConsteval();

        const trailingReturnMatch = trailingText.match(/(?<=->\s*).+(\s*$)/);
        if (trailingReturnMatch) {
            signature.returnType = trailingReturnMatch[0];
        } else {
            const returnEndIndex = doc.offsetAt(symbol.scopeStringStart()) - declarationStartOffset;
            const leadingText = declaration.slice(0, returnEndIndex);
            signature.returnType = leadingText.replace(
                    /\b(virtual|static|explicit|friend|inline|constexpr|consteval)\b\s*/g, '').trim();
        }

        return signature;
    }

    equals(other: FunctionSignature): boolean {
        return util.arraysAreEqual(this.parameters, other.parameters)
            && this.returnType === other.returnType
            && this.isNoexcept === other.isNoexcept
            && this.isConst === other.isConst
            && this.isVolatile === other.isVolatile;
    }
}
