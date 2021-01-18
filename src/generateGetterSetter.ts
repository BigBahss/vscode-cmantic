import * as vscode from 'vscode';
import { CSymbol, ProposedPosition, SourceFile } from './cmantics';
import * as util from './utility';


export const title = {
    getterSetter: 'Generate \'get\' and \'set\' methods',
    getter: 'Generate \'get\' method',
    setter: 'Generate \'set\' method'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notHeaderFile: 'This file is not a header file.',
    noMemberVariable: 'No member variable detected.',
    positionNotFound: 'Could not find a position for new accessor method.',
    getterSetterExists: 'There already exists a \'get\' or \'set\' method.',
    getterExists: 'There already exists a \'get\' method.',
    setterExists: 'There already exists a \'set\' method.'
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

    const sourceFile = new SourceFile(editor.document);
    if (!sourceFile.isHeader()) {
        vscode.window.showErrorMessage(failure.notHeaderFile);
        return;
    }

    const symbol = await sourceFile.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        vscode.window.showErrorMessage(failure.noMemberVariable);
        return;
    }

    return callback(symbol);
}

export async function generateGetterSetterFor(symbol: CSymbol): Promise<void>
{
    return findPositionAndCall(symbol, AccessorType.Both, position => {
        const combinedAccessors = constructGetter(symbol) + util.endOfLine(symbol.document) + constructSetter(symbol);
        return util.insertSnippetAndReveal(combinedAccessors, position, symbol.document);
    });
}

export async function generateGetterFor(symbol: CSymbol): Promise<void>
{
    return findPositionAndCall(symbol, AccessorType.Getter, position => {
        return util.insertSnippetAndReveal(constructGetter(symbol), position, symbol.document);
    });
}

export async function generateSetterFor(symbol: CSymbol): Promise<void>
{
    return findPositionAndCall(symbol, AccessorType.Setter, position => {
        return util.insertSnippetAndReveal(constructSetter(symbol), position, symbol.document);
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
    const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');

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
