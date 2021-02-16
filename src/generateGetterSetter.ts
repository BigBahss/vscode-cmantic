import * as vscode from 'vscode';
import * as cfg from './configuration';
import { ProposedPosition } from './ProposedPosition';
import { SourceDocument } from './SourceDocument';
import { Accessor, CSymbol, Getter, Setter } from './CSymbol';
import { getMatchingSourceFile } from './extension';
import { logger } from './logger';


export const title = {
    getterSetter: 'Generate Getter and Setter Member Functions',
    getter: 'Generate Getter Member Function',
    setter: 'Generate Setter Member Function'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notCpp: 'Detected language is not C++, cannot create a member function.',
    notHeaderFile: 'This file is not a header file.',
    noMemberVariable: 'No member variable detected.',
    positionNotFound: 'Could not find a position for a new accessor member function.',
    getterOrSetterExists: 'There already exists a getter or setter member function.',
    getterAndSetterExists: 'There already exists getter and setter member functions.',
    getterExists: 'There already exists a getter member function.',
    setterExists: 'There already exists a setter member function.',
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
        logger.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);
    if (sourceDoc.languageId !== 'cpp') {
        logger.showWarningMessage(failure.notCpp);
        return;
    } else if (!sourceDoc.isHeader()) {
        logger.showWarningMessage(failure.notHeaderFile);
        return;
    }

    const symbol = await sourceDoc.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        logger.showWarningMessage(failure.noMemberVariable);
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
            logger.showInformationMessage(failure.isConst + ' ' + failure.getterExists);
            return;
        }
        logger.showInformationMessage(failure.isConst + ' Only generating a getter member function.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && !setter) {
        logger.showInformationMessage(failure.getterExists + ' Only generating a setter member function.');
        await generateSetterFor(symbol, classDoc);
        return;
    } else if (!getter && setter) {
        logger.showInformationMessage(failure.setterExists + ' Only generating a getter member function.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && setter) {
        logger.showInformationMessage(failure.getterAndSetterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Both);
    if (!position) {
        logger.showErrorMessage(failure.positionNotFound);
        return;
    }

    const setterPosition = new ProposedPosition(position, {
        relativeTo: position.options.relativeTo,
        after: true,
        nextTo: true
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), position, classDoc, workspaceEdit);
    await addNewAccessorToWorkspaceEdit(await Setter.create(symbol), setterPosition, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateGetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<void>
{
    const getter = symbol.parent?.findGetterFor(symbol);
    if (getter) {
        logger.showInformationMessage(failure.getterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Getter);
    if (!position) {
        logger.showErrorMessage(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), position, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateSetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<void>
{
    if (symbol.isConst()) {
        logger.showInformationMessage(failure.isConst);
        return;
    }

    const setter = symbol.parent?.findSetterFor(symbol);
    if (setter) {
        logger.showInformationMessage(failure.setterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Setter);
    if (!position) {
        logger.showErrorMessage(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(await Setter.create(symbol), position, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

function getPositionForNewAccessorDeclaration(
    symbol: CSymbol,
    type: AccessorType
): ProposedPosition | undefined {
    // If the new accessor is a getter, then we want to place it relative to the setter, and vice-versa.
    switch (type) {
    case AccessorType.Getter:
        return symbol.parent?.findPositionForNewMemberFunction(symbol.setterName(), symbol);
    case AccessorType.Setter:
        return symbol.parent?.findPositionForNewMemberFunction(symbol.getterName(), symbol);
    case AccessorType.Both:
        return symbol.parent?.findPositionForNewMemberFunction();
    }
}

async function addNewAccessorToWorkspaceEdit(
    newAccessor: Accessor,
    memberFunctionPos: ProposedPosition,
    classDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): Promise<void> {
    const target = await getTargetForAccessorDefinition(newAccessor, memberFunctionPos, classDoc);

    if (target.position === memberFunctionPos && target.sourceDoc === classDoc) {
        const inlineDefinition = newAccessor.declaration + ' { ' + newAccessor.body + ' }';
        const formattedInlineDefinition = memberFunctionPos.formatTextToInsert(inlineDefinition, classDoc);

        workspaceEdit.insert(classDoc.uri, memberFunctionPos, formattedInlineDefinition);
    } else {
        const formattedDeclaration = memberFunctionPos.formatTextToInsert(newAccessor.declaration + ';', classDoc);
        const definition = await newAccessor.definition(
                target.sourceDoc,
                target.position,
                cfg.functionCurlyBraceFormat(target.sourceDoc.languageId) === cfg.CurlyBraceFormat.NewLine);
        const formattedDefinition = target.position.formatTextToInsert(definition, target.sourceDoc);

        workspaceEdit.insert(classDoc.uri, memberFunctionPos, formattedDeclaration);
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
        if (classDoc.isHeader()) {
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
