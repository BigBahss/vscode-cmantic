import * as vscode from 'vscode';
import * as util from './utility';
import { ProposedPosition } from "./ProposedPosition";
import { SourceDocument } from "./SourceDocument";
import { CSymbol } from "./CSymbol";


export const title = {
    getterSetter: 'Generate \'get\' and \'set\' methods',
    getter: 'Generate \'get\' method',
    setter: 'Generate \'set\' method'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notCpp: 'Detected language is not C++, cannot create a member function.',
    notHeaderFile: 'This file is not a header file.',
    noMemberVariable: 'No member variable detected.',
    positionNotFound: 'Could not find a position for new accessor method.',
    getterSetterExists: 'There already exists a \'get\' or \'set\' method.',
    getterExists: 'There already exists a \'get\' method.',
    setterExists: 'There already exists a \'set\' method.',
    isConst: 'Const variables cannot be assigned after initialization.'
};

enum AccessorType {
    Getter,
    Setter,
    Both
}


export async function generateGetterSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterSetterFor);
}

export async function generateGetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterFor);
}

export async function generateSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateSetterFor);
}

async function getCurrentSymbolAndCall(callback: (symbol: CSymbol) => Promise<void>): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    if (editor.document.languageId !== 'cpp') {
        vscode.window.showErrorMessage(failure.notCpp);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);
    if (!sourceDoc.isHeader()) {
        vscode.window.showErrorMessage(failure.notHeaderFile);
        return;
    }

    const symbol = await sourceDoc.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        vscode.window.showErrorMessage(failure.noMemberVariable);
        return;
    }

    return callback(symbol);
}

export async function generateGetterSetterFor(symbol: CSymbol): Promise<void>
{
    if (symbol.isConst()) {
        vscode.window.showInformationMessage(failure.isConst + ' Only generating \'get\' method.');
        return generateGetterFor(symbol);
    }

    return findPositionAndCall(symbol, AccessorType.Both, position => {
        const combinedAccessors = constructGetter(symbol) + util.endOfLine(symbol.document) + constructSetter(symbol);
        return util.insertSnippetAndReveal(combinedAccessors, position, symbol.uri);
    });
}

export async function generateGetterFor(symbol: CSymbol): Promise<void>
{
    return findPositionAndCall(symbol, AccessorType.Getter, position => {
        return util.insertSnippetAndReveal(constructGetter(symbol), position, symbol.uri);
    });
}

export async function generateSetterFor(symbol: CSymbol): Promise<void>
{
    if (symbol.isConst()) {
        vscode.window.showErrorMessage(failure.isConst);
        return;
    }

    return findPositionAndCall(symbol, AccessorType.Setter, position => {
        return util.insertSnippetAndReveal(constructSetter(symbol), position, symbol.uri);
    });
}

async function findPositionAndCall(
    symbol: CSymbol,
    type: AccessorType,
    callback: (position: ProposedPosition) => Promise<void>
): Promise<void> {
    // If the new method is a getter, then we want to place it relative to the setter, and vice-versa.
    let position: ProposedPosition | undefined;
    switch (type) {
    case AccessorType.Getter:
        position = symbol.parent?.findPositionForNewMethod(symbol.setterName(), symbol);
        break;
    case AccessorType.Setter:
        position = symbol.parent?.findPositionForNewMethod(symbol.getterName(), symbol);
        break;
    case AccessorType.Both:
        position = symbol.parent?.findPositionForNewMethod();
        break;
    }

    if (!position) {
        vscode.window.showErrorMessage(failure.positionNotFound);
        return;
    }

    return callback(position);
}

function constructGetter(symbol: CSymbol): string
{
    const leadingText = symbol.leading();
    const staticness = leadingText.match(/\bstatic\b/) ? 'static ' : '';
    const constness = staticness ? '' : ' const';
    const type = leadingText.replace(/\b(static|const|mutable)\b\s*/g, '');

    return staticness + type + symbol.getterName() + '()' + constness + ' { return ' + symbol.name + '; }';
}

function constructSetter(symbol: CSymbol): string
{
    const leadingText = symbol.leading();
    const staticness = leadingText.match(/\bstatic\b/) ? 'static ' : '';
    const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');

    // Pass 'set' parameter by const-reference for non-primitive, non-pointer types.
    const paramType = (!symbol.isPrimitive() && !symbol.isPointer()) ? 'const ' + type + '&' : type;

    return staticness + 'void ' + symbol.setterName() + '(' + paramType + 'value) { ' + symbol.name + ' = value; }';
}
