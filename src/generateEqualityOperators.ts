import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { ProposedPosition, TargetLocation } from './ProposedPosition';
import { Operator, OpEqual, OpNotEqual } from './Operator';
import { getMatchingSourceFile } from './extension';


export const title = 'Generate equality operators';

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noClassOrStruct: 'No class or struct detected.',
    operatorExists: 'An equality operator already exists.',
    positionNotFound: 'Could not find a position for a new public member function.'
};

export async function generateEqualityOperators(
    classOrStruct?: CSymbol,
    classDoc?: SourceDocument
): Promise<void> {
    if (!classOrStruct || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        classDoc = new SourceDocument(editor.document);

        const symbol = await classDoc.getSymbol(editor.selection.start);

        classOrStruct = symbol?.isClassOrStruct() ? symbol : symbol?.parent;

        if (!classOrStruct?.isClassOrStruct()) {
            logger.alertWarning(failure.noClassOrStruct);
            return;
        }
    }

    const p_memberVariables = promptUserForMemberVariables(classOrStruct);

    const position = classOrStruct.findPositionForNewMemberFunction();
    if (!position) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const memberVariables = await p_memberVariables;
    if (!memberVariables) {
        return;
    }

    const opEqual = new OpEqual(classOrStruct, memberVariables);
    const opNotEqual = new OpNotEqual(classOrStruct);

    const targets = await promptUserForDefinitionLocations(classDoc, position);
    if (!targets) {
        return;
    }

    const notEqualPosition = new ProposedPosition(position, {
        relativeTo: position.options.relativeTo,
        after: true,
        nextTo: true
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(opEqual, position, classDoc, targets.equal, workspaceEdit);
    if (targets.notEqual) {
        await addNewOperatorToWorkspaceEdit(opNotEqual, notEqualPosition, classDoc, targets.notEqual, workspaceEdit);
    }
    await vscode.workspace.applyEdit(workspaceEdit);
}

interface MemberVariableQuickPickItem extends vscode.QuickPickItem {
    memberVariable: CSymbol;
}

async function promptUserForMemberVariables(classOrStruct: CSymbol): Promise<CSymbol[] | undefined> {
    const memberVariables = classOrStruct.memberVariables();

    const memberVariablesItems: MemberVariableQuickPickItem[] = [];
    memberVariables.forEach(memberVariable => {
        const convertedMemberVariable = new CSymbol(memberVariable, classOrStruct.document);
        memberVariablesItems.push({
            label: '$(symbol-field) ' + convertedMemberVariable.name,
            description: convertedMemberVariable.text(),
            memberVariable: convertedMemberVariable,
            picked: true
        });
    });

    const selectedIems = await vscode.window.showQuickPick<MemberVariableQuickPickItem>(memberVariablesItems, {
        matchOnDescription: true,
        placeHolder: 'What member variables would you like to compare?',
        canPickMany: true
    });

    if (!selectedIems) {
        return;
    }

    const selectedMemberVariables: CSymbol[] = [];
    selectedIems.forEach(item => selectedMemberVariables.push(item.memberVariable));

    return selectedMemberVariables;
}

interface DefinitionLocationQuickPickItem extends vscode.QuickPickItem {
    location: cfg.DefinitionLocation;
}

class DefinitionLocationQuickPickItems extends Array<DefinitionLocationQuickPickItem> {
    constructor(sourceDoc: SourceDocument) {
        super({ label: 'Inline', location: cfg.DefinitionLocation.Inline },
              { label: 'Current File', location: cfg.DefinitionLocation.CurrentFile });

        if (sourceDoc.isHeader()) {
            this.push({ label: 'Source File', location: cfg.DefinitionLocation.SourceFile });
        }
    }
}

interface TargetLocations {
    equal: TargetLocation;
    notEqual?: TargetLocation;
}

async function promptUserForDefinitionLocations(
    classDoc: SourceDocument,
    declarationPos: ProposedPosition
): Promise<TargetLocations | undefined> {
    const equalityDefinitionItem = await vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(classDoc),
            { placeHolder: 'Select where the definition of operator== should be placed' });
    if (!equalityDefinitionItem) {
        return;
    }

    const p_inequalityDefinitionItem = vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(classDoc),
            { placeHolder: 'Select where the definition of operator!= should be placed' });

    const matchingUri = await getMatchingSourceFile(classDoc.uri);

    const equalityTargetDoc = (equalityDefinitionItem.location === cfg.DefinitionLocation.SourceFile && matchingUri)
            ? await SourceDocument.open(matchingUri)
            : classDoc;
    const equalityDefinitionPos = (equalityDefinitionItem.location === cfg.DefinitionLocation.Inline)
            ? declarationPos
            : await classDoc.findPositionForFunctionDefinition(declarationPos, equalityTargetDoc);
    const equalityTargetLocation = new TargetLocation(equalityDefinitionPos, equalityTargetDoc);

    const inequalityDefinitionItem = await p_inequalityDefinitionItem;
    if (!inequalityDefinitionItem) {
        return { equal: equalityTargetLocation };
    }

    let inequalityTargetLocation: TargetLocation | undefined;

    if (inequalityDefinitionItem.location === cfg.DefinitionLocation.SourceFile && matchingUri) {
        const inequalityTargetDoc = (equalityTargetDoc.uri.fsPath === matchingUri.fsPath)
                ? equalityTargetDoc
                : await SourceDocument.open(matchingUri);
        const inequalityDefinitionPos =
                await classDoc.findPositionForFunctionDefinition(declarationPos, inequalityTargetDoc);
        inequalityTargetLocation = new TargetLocation(inequalityDefinitionPos, inequalityTargetDoc);
    } else {
        const inequalityDefinitionPos = inequalityDefinitionItem.location === cfg.DefinitionLocation.Inline
                ? declarationPos
                : await classDoc.findPositionForFunctionDefinition(declarationPos);
        inequalityTargetLocation = new TargetLocation(inequalityDefinitionPos, classDoc);
    }

    return { equal: equalityTargetLocation, notEqual: inequalityTargetLocation };
}

async function addNewOperatorToWorkspaceEdit(
    newOperator: Operator,
    declarationPos: ProposedPosition,
    classDoc: SourceDocument,
    target: TargetLocation,
    workspaceEdit: vscode.WorkspaceEdit
): Promise<void> {
    const curlySeparator = (cfg.functionCurlyBraceFormat('cpp') === cfg.CurlyBraceFormat.NewLine)
            ? target.sourceDoc.endOfLine
            : ' ';

    if (target.sourceDoc.fileName === classDoc.fileName && target.position.isEqual(declarationPos)) {
        const inlineDefinition = (newOperator.body.includes('\n'))
                ? await newOperator.definition(target.sourceDoc, target.position, curlySeparator)
                : newOperator.declaration + ' { ' + newOperator.body + ' }';
        const formattedInlineDefinition = declarationPos.formatTextToInsert(inlineDefinition, classDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedInlineDefinition);
    } else {
        const formattedDeclaration = declarationPos.formatTextToInsert(newOperator.declaration + ';', classDoc);
        const definition = await newOperator.definition(target.sourceDoc, target.position, curlySeparator);
        const formattedDefinition = target.position.formatTextToInsert(definition, target.sourceDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
}
