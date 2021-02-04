import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { ProposedPosition } from "./ProposedPosition";
import { SourceDocument } from "./SourceDocument";
import { Accessor, CSymbol, Getter, Setter } from "./CSymbol";
import { getMatchingSourceFile } from './extension';


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
    callback: (symbol: CSymbol, classDoc: SourceDocument) => Promise<void>
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);
    if (sourceDoc.languageId !== 'cpp') {
        vscode.window.showErrorMessage(failure.notCpp);
        return;
    } else if (!sourceDoc.isHeader()) {
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

export async function generateGetterSetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<void>
{
    const getter = symbol.parent?.findGetterFor(symbol);
    const setter = symbol.parent?.findSetterFor(symbol);

    if (symbol.isConst()) {
        if (getter) {
            vscode.window.showInformationMessage(failure.isConst + ' ' + failure.getterExists);
            return;
        }
        vscode.window.showInformationMessage(failure.isConst + ' Only generating \'get\' method.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && !setter) {
        vscode.window.showInformationMessage(failure.getterExists + ' Only generating \'set\' method.');
        await generateSetterFor(symbol, classDoc);
        return;
    } else if (!getter && setter) {
        vscode.window.showInformationMessage(failure.setterExists + ' Only generating \'get\' method.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && setter) {
        vscode.window.showInformationMessage(failure.getterAndSetterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Both);
    if (!position) {
        vscode.window.showErrorMessage(failure.positionNotFound);
        return;
    }

    const setterPosition = new ProposedPosition(position, {
        relativeTo: position.options.relativeTo,
        after: true,
        nextTo: true
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), position, classDoc, workspaceEdit);
    await addNewAccessorToWorkspaceEdit(new Setter(symbol), setterPosition, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateGetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<void>
{
    const getter = symbol.parent?.findGetterFor(symbol);
    if (getter) {
        vscode.window.showInformationMessage(failure.getterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Getter);
    if (!position) {
        vscode.window.showErrorMessage(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), position, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateSetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<void>
{
    if (symbol.isConst()) {
        vscode.window.showInformationMessage(failure.isConst);
        return;
    }

    const setter = symbol.parent?.findSetterFor(symbol);
    if (setter) {
        vscode.window.showInformationMessage(failure.setterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Setter);
    if (!position) {
        vscode.window.showErrorMessage(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Setter(symbol), position, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

function getPositionForNewAccessorDeclaration(
    symbol: CSymbol,
    type: AccessorType
): ProposedPosition | undefined {
    // If the new method is a getter, then we want to place it relative to the setter, and vice-versa.
    switch (type) {
    case AccessorType.Getter:
        return symbol.parent?.findPositionForNewMethod(symbol.setterName(), symbol);
    case AccessorType.Setter:
        return symbol.parent?.findPositionForNewMethod(symbol.getterName(), symbol);
    case AccessorType.Both:
        return symbol.parent?.findPositionForNewMethod();
    }
}

async function addNewAccessorToWorkspaceEdit(
    newAccessor: Accessor,
    methodPosition: ProposedPosition,
    classDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): Promise<void> {
    const target = await getTargetForAccessorDefinition(newAccessor, methodPosition, classDoc);

    if (target.position === methodPosition && target.sourceDoc === classDoc) {
        const inlineDefinition = newAccessor.declaration + ' { ' + newAccessor.body + ' }';
        const formattedInlineDefinition = methodPosition.formatTextToInsert(inlineDefinition, classDoc.document);

        workspaceEdit.insert(classDoc.uri, methodPosition, formattedInlineDefinition);
    } else {
        const formattedDeclaration = methodPosition.formatTextToInsert(newAccessor.declaration + ';', classDoc.document);
        const definition = await newAccessor.definition(
                target.sourceDoc,
                target.position,
                cfg.functionCurlyBraceFormat(target.sourceDoc.languageId) === cfg.CurlyBraceFormat.NewLine);
        const formattedDefinition = target.position.formatTextToInsert(definition, target.sourceDoc.document);

        workspaceEdit.insert(classDoc.uri, methodPosition, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
}

async function getTargetForAccessorDefinition(
    accessor: Accessor,
    declarationPosition: ProposedPosition,
    classDoc: SourceDocument
): Promise<{ position: ProposedPosition; sourceDoc: SourceDocument }> {
    const accessorDefinitionLocation = (accessor instanceof Getter) ?
            cfg.getterDefinitionLocation() : cfg.setterDefinitionLocation();

    switch (accessorDefinitionLocation) {
    case cfg.AccessorDefinitionLocation.Inline:
        return { position: declarationPosition, sourceDoc: classDoc };
    case cfg.AccessorDefinitionLocation.SourceFile:
        // If the class is not in a header file then control will pass down to BelowClass.
        if (cfg.headerExtensions().includes((util.fileExtension(classDoc.uri.path)))) {
            const matchingUri = await getMatchingSourceFile(classDoc.uri);
            const targetDoc = matchingUri ? await SourceDocument.open(matchingUri) : classDoc;
            return {
                position: await classDoc.findPositionForFunctionDefinition(declarationPosition, targetDoc),
                sourceDoc: targetDoc
            };
        }
    case cfg.AccessorDefinitionLocation.BelowClass:
        return {
            position: await classDoc.findPositionForFunctionDefinition(declarationPosition, classDoc),
            sourceDoc: classDoc
        };
    }
}
