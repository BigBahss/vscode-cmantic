import * as vscode from 'vscode';
import { CSymbol, ProposedPosition, SourceFile } from './cmantics';
import * as util from './utility';


export async function generateGetterSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterSetterFor, 'Could not find a position for \'get\' and \'set\' methods.');
}

export async function generateGetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterFor, 'Could not find a position for \'get\' method.');
}

export async function generateSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateSetterFor, 'Could not find a position for \'set\' method.');
}

async function getCurrentSymbolAndCall(
    callback: (symbol: CSymbol, errorMsg: string) => Promise<void>,
    errorMsg: string
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const sourceFile = new SourceFile(editor.document);
    if (!sourceFile.isHeader()) {
        vscode.window.showErrorMessage('This file is not a header file.');
        return;
    }

    const symbol = await sourceFile.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        vscode.window.showErrorMessage('No member variable detected.');
        return;
    }

    return callback(symbol, errorMsg);
}


enum AccessorType {
    Getter,
    Setter,
    Both
}


export async function generateGetterSetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const position = findPositionForNewAccessor(symbol, AccessorType.Both);
    if (!position) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    const combinedAccessors = constructGetter(symbol) + util.endOfLine(symbol.document) + constructSetter(symbol);

    return util.insertSnippetAndReveal(combinedAccessors, position, symbol.document);
}

export async function generateGetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const position = findPositionForNewAccessor(symbol, AccessorType.Getter);
    if (!position) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    return util.insertSnippetAndReveal(constructGetter(symbol), position, symbol.document);
}

export async function generateSetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const position = findPositionForNewAccessor(symbol, AccessorType.Setter);
    if (!position) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    return util.insertSnippetAndReveal(constructSetter(symbol), position, symbol.document);
}

function findPositionForNewAccessor(symbol: CSymbol, type: AccessorType): ProposedPosition | undefined
{
    // If the new method is a getter, then we want to place it relative to the setter, and vice-versa.
    let relativeMethodName: string | undefined;
    switch (type) {
    case AccessorType.Getter:
        relativeMethodName = symbol.setterName();
        break;
    case AccessorType.Setter:
        relativeMethodName = symbol.getterName();
        break;
    }

    return symbol.parent?.findPositionForNewMethod(relativeMethodName, symbol);
}

function constructGetter(symbol: CSymbol) {
    const leadingText = symbol.leading();
    const staticness = leadingText.match(/\bstatic\b/) ? 'static ' : '';
    const constness = staticness ? '' : ' const';
    const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');

    return staticness + type + symbol.getterName() + '()' + constness + ' { return ' + symbol.name + '; }';
}

function constructSetter(symbol: CSymbol) {
    const leadingText = symbol.leading();
    const staticness = leadingText.match(/\bstatic\b/) ? 'static ' : '';
    const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');

    // Pass 'set' parameter by const-reference for non-primitive, non-pointer types.
    const paramType = (!symbol.isPrimitive() && !symbol.isPointer()) ? 'const ' + type + '&' : type;

    return staticness + 'void ' + symbol.setterName() + '(' + paramType + 'value) { ' + symbol.name + ' = value; }';
}
