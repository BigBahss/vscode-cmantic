import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import { ProposedPosition, TargetLocation } from './ProposedPosition';
import { Accessor, Getter, Setter } from './Accessor';
import { getMatchingHeaderSource, logger } from './extension';


export const title = {
    getterSetter: 'Generate Getter and Setter',
    getter: 'Generate Getter',
    setter: 'Generate Setter'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notCpp: 'Detected language is not C++, cannot create a member function.',
    notHeaderFile: 'This file is not a header file.',
    noMemberVariable: 'No member variable detected.',
    positionNotFound: 'Could not find a position for a new public member function.',
    getterOrSetterExists: 'There already exists a getter or setter.',
    getterAndSetterExists: 'There already exists a getter and setter.',
    getterExists: 'There already exists a getter.',
    setterExists: 'There already exists a setter.',
    isConst: 'Const variables cannot be assigned after initialization.'
};

enum AccessorType {
    Getter,
    Setter,
    Both
}

export async function generateGetterSetter(): Promise<boolean | undefined> {
    return getCurrentSymbolAndCall(generateGetterSetterFor);
}

export async function generateGetter(): Promise<boolean | undefined> {
    return getCurrentSymbolAndCall(generateGetterFor);
}

export async function generateSetter(): Promise<boolean | undefined> {
    return getCurrentSymbolAndCall(generateSetterFor);
}

async function getCurrentSymbolAndCall(
    callback: (symbol: CSymbol, classDoc: SourceDocument) => Promise<boolean | undefined>
): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);
    if (sourceDoc.languageId !== 'cpp') {
        logger.alertWarning(failure.notCpp);
        return;
    } else if (!sourceDoc.isHeader()) {
        logger.alertWarning(failure.notHeaderFile);
        return;
    }

    const symbol = await sourceDoc.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        logger.alertWarning(failure.noMemberVariable);
        return;
    }

    return callback(symbol, sourceDoc);
}

export async function generateGetterSetterFor(
    symbol: CSymbol, classDoc: SourceDocument
): Promise<boolean | undefined> {
    const getter = symbol.parent?.findGetterFor(symbol);
    const setter = symbol.parent?.findSetterFor(symbol);

    if (symbol.isConst()) {
        if (getter) {
            logger.alertInformation(failure.isConst + ' ' + failure.getterExists);
            return;
        }
        logger.alertInformation(failure.isConst + ' Only generating a getter.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && !setter) {
        logger.alertInformation(failure.getterExists + ' Only generating a setter.');
        await generateSetterFor(symbol, classDoc);
        return;
    } else if (!getter && setter) {
        logger.alertInformation(failure.setterExists + ' Only generating a getter.');
        await generateGetterFor(symbol, classDoc);
        return;
    } else if (getter && setter) {
        logger.alertInformation(failure.getterAndSetterExists);
        return;
    }

    const getterPosition = getPositionForNewAccessorDeclaration(symbol, AccessorType.Both);
    if (!getterPosition) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const setterPosition = new ProposedPosition(getterPosition, {
        relativeTo: getterPosition.options.relativeTo,
        after: true,
        nextTo: true,
        indent: getterPosition.options.indent
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), getterPosition, classDoc, workspaceEdit);
    await addNewAccessorToWorkspaceEdit(await Setter.create(symbol), setterPosition, classDoc, workspaceEdit, true);
    return vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateGetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<boolean | undefined> {
    const getter = symbol.parent?.findGetterFor(symbol);
    if (getter) {
        logger.alertInformation(failure.getterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Getter);
    if (!position) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(new Getter(symbol), position, classDoc, workspaceEdit);
    await vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateSetterFor(symbol: CSymbol, classDoc: SourceDocument): Promise<boolean | undefined> {
    if (symbol.isConst()) {
        logger.alertInformation(failure.isConst);
        return;
    }

    const setter = symbol.parent?.findSetterFor(symbol);
    if (setter) {
        logger.alertInformation(failure.setterExists);
        return;
    }

    const position = getPositionForNewAccessorDeclaration(symbol, AccessorType.Setter);
    if (!position) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewAccessorToWorkspaceEdit(await Setter.create(symbol), position, classDoc, workspaceEdit);
    return vscode.workspace.applyEdit(workspaceEdit);
}

function getPositionForNewAccessorDeclaration(
    symbol: CSymbol,
    type: AccessorType
): ProposedPosition | undefined {
    // If the new accessor is a getter, then we want to place it relative to the setter, and vice-versa.
    switch (type) {
    case AccessorType.Getter:
        return symbol.parent?.findPositionForNewMemberFunction(util.AccessLevel.public, symbol.setterName(), symbol);
    case AccessorType.Setter:
        return symbol.parent?.findPositionForNewMemberFunction(util.AccessLevel.public, symbol.getterName(), symbol);
    case AccessorType.Both:
        return symbol.parent?.findPositionForNewMemberFunction(util.AccessLevel.public);
    }
}

async function addNewAccessorToWorkspaceEdit(
    newAccessor: Accessor,
    declarationPos: ProposedPosition,
    classDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit,
    skipAccessSpecifierCheck?: boolean
): Promise<void> {
    const target = await getTargetForAccessorDefinition(newAccessor, declarationPos, classDoc);

    if (target.sourceDoc.fileName === classDoc.fileName && target.position.isEqual(declarationPos)) {
        let formattedInlineDefinition = newAccessor.declaration + ' { ' + newAccessor.body + ' }';
        if (!skipAccessSpecifierCheck
                && !newAccessor.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedInlineDefinition = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedInlineDefinition;
        }
        formattedInlineDefinition = declarationPos.formatTextToInsert(formattedInlineDefinition, classDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedInlineDefinition);
    } else {
        const curlySeparator = (cfg.functionCurlyBraceFormat('cpp', target.sourceDoc) === cfg.CurlyBraceFormat.NewLine)
                ? target.sourceDoc.endOfLine
                : ' ';

        let formattedDeclaration = newAccessor.declaration + ';';
        if (!skipAccessSpecifierCheck
                && !newAccessor.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedDeclaration = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedDeclaration;
        }
        formattedDeclaration = declarationPos.formatTextToInsert(formattedDeclaration, classDoc);

        const definition = await newAccessor.definition(target.sourceDoc, target.position, curlySeparator);
        const formattedDefinition = target.formatTextToInsert(definition);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
}

async function getTargetForAccessorDefinition(
    accessor: Accessor,
    declarationPos: ProposedPosition,
    classDoc: SourceDocument
): Promise<TargetLocation> {
    const accessorDefinitionLocation = (accessor instanceof Getter)
            ? cfg.getterDefinitionLocation(classDoc)
            : cfg.setterDefinitionLocation(classDoc);

    switch (accessorDefinitionLocation) {
    case cfg.DefinitionLocation.Inline:
        return new TargetLocation(declarationPos, classDoc);
    case cfg.DefinitionLocation.SourceFile:
        if (classDoc.isHeader()) {
            const matchingUri = await getMatchingHeaderSource(classDoc.uri);
            if (matchingUri && !accessor.memberVariable.hasUnspecializedTemplate()) {
                const targetDoc = await SourceDocument.open(matchingUri);
                return new TargetLocation(
                        await classDoc.findSmartPositionForFunctionDefinition(declarationPos, targetDoc), targetDoc);
            }
        }
        // fallthrough
    case cfg.DefinitionLocation.CurrentFile:
        return new TargetLocation(
                await classDoc.findSmartPositionForFunctionDefinition(declarationPos, classDoc), classDoc);
    }
}
