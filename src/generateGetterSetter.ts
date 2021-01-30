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
    getterOrSetterExists: 'There already exists a \'get\' or \'set\' method.',
    getterAndSetterExists: 'There already exists \'get\' and \'set\' methods.',
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
    await getCurrentSymbolAndCall(generateGetterSetterFor);
}

export async function generateGetter(): Promise<void>
{
    await getCurrentSymbolAndCall(generateGetterFor);
}

export async function generateSetter(): Promise<void>
{
    await getCurrentSymbolAndCall(generateSetterFor);
}

async function getCurrentSymbolAndCall(
    callback: (symbol: CSymbol, sourceDoc: SourceDocument) => Promise<void>
): Promise<void> {
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

    await callback(symbol, sourceDoc);
}

export async function generateGetterSetterFor(symbol: CSymbol, sourceDoc: SourceDocument): Promise<void>
{
    const getter = symbol.parent?.findGetterFor(symbol);
    const setter = symbol.parent?.findSetterFor(symbol);

    if (symbol.isConst()) {
        if (getter) {
            vscode.window.showErrorMessage(failure.isConst + ' ' + failure.getterExists);
            return;
        }
        vscode.window.showInformationMessage(failure.isConst + ' Only generating \'get\' method.');
        await generateGetterFor(symbol, sourceDoc);
        return;
    } else if (getter && !setter) {
        vscode.window.showInformationMessage(failure.getterExists + ' Only generating \'set\' method.');
        await generateSetterFor(symbol, sourceDoc);
        return;
    } else if (!getter && setter) {
        vscode.window.showInformationMessage(failure.setterExists + ' Only generating \'get\' method.');
        await generateGetterFor(symbol, sourceDoc);
        return;
    } else if (getter && setter) {
        vscode.window.showErrorMessage(failure.getterAndSetterExists);
        return;
    }

    await findPositionAndCall(symbol, AccessorType.Both, async (position) => {
        const newGetter = constructGetter(symbol);
        const getterDefinition = (newGetter.isStatic ? 'static ' : '') + newGetter.returnType
                + newGetter.name + '()' + (newGetter.isStatic ? '' : ' const') + ' { ' + newGetter.body + ' }';
        const newSetter = constructSetter(symbol);
        const setterDefinition = (newSetter.isStatic ? 'static ' : '') + 'void '
                + newSetter.name + '(' + newSetter.parameter + ') { ' + newSetter.body + ' }';
        const combinedAccessors = getterDefinition + util.endOfLine(symbol.document) + setterDefinition;
        await util.insertSnippetAndReveal(combinedAccessors, position, symbol.uri);
    });
}

export async function generateGetterFor(symbol: CSymbol, sourceDoc: SourceDocument): Promise<void>
{
    const getter = symbol.parent?.findGetterFor(symbol);
    if (getter) {
        vscode.window.showInformationMessage(failure.getterExists);
        return;
    }

    await findPositionAndCall(symbol, AccessorType.Getter, async (position) => {
        const newGetter = constructGetter(symbol);
        const getterDefinition = (newGetter.isStatic ? 'static ' : '') + newGetter.returnType
                + newGetter.name + '()' + (newGetter.isStatic ? '' : ' const') + ' { ' + newGetter.body + ' }';
        await util.insertSnippetAndReveal(getterDefinition, position, symbol.uri);
    });
}

export async function generateSetterFor(symbol: CSymbol, sourceDoc: SourceDocument): Promise<void>
{
    if (symbol.isConst()) {
        vscode.window.showErrorMessage(failure.isConst);
        return;
    }

    const setter = symbol.parent?.findSetterFor(symbol);
    if (setter) {
        vscode.window.showInformationMessage(failure.setterExists);
        return;
    }

    await findPositionAndCall(symbol, AccessorType.Setter, async (position) => {
        const newSetter = constructSetter(symbol);
        const setterDefinition = (newSetter.isStatic ? 'static ' : '') + 'void '
                + newSetter.name + '(' + newSetter.parameter + ') { ' + newSetter.body + ' }';
        await util.insertSnippetAndReveal(setterDefinition, position, symbol.uri);
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

    await callback(position);
}

interface NewGetter {
    member: CSymbol;
    name: string;
    isStatic: boolean;
    body: string;
    returnType: string;
}

function constructGetter(symbol: CSymbol): NewGetter
{
    const leadingText = symbol.leading();
    return {
        member: symbol,
        name: symbol.getterName(),
        isStatic: leadingText.match(/\bstatic\b/) !== null,
        body: 'return ' + symbol.name + ';',
        returnType: leadingText.replace(/\b(static|const|mutable)\b\s*/g, '')
    };
}

interface NewSetter {
    member: CSymbol;
    name: string;
    isStatic: boolean;
    body: string;
    parameter: string;
}

function constructSetter(symbol: CSymbol): NewSetter
{
    const leadingText = symbol.leading();
    const type = leadingText.replace(/\b(static|mutable)\b\s*/g, '');
    return {
        member: symbol,
        name: symbol.setterName(),
        isStatic: leadingText.match(/\bstatic\b/) !== null,
        body: symbol.name + ' = value;',
        parameter: ((!symbol.isPrimitive() && !symbol.isPointer()) ? 'const ' + type + '&' : type) + 'value'
    };
}

    return staticness + 'void ' + symbol.setterName() + '(' + paramType + 'value) { ' + symbol.name + ' = value; }';
}
