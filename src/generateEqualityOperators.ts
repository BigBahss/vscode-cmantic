import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { ProposedPosition, TargetLocation } from './ProposedPosition';
import { OpEqual, Operator, OpNotEqual } from './Operator';


export const title = 'Generate equality operators';

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noClassOrStruct: 'No class or struct detected.',
    operatorExists: 'An equality operator already exists.',
    positionNotFound: 'Could not find a position for a new public member function.'
};

export async function generateEqualityOperators(
    classOrStruct: CSymbol,
    classDoc: SourceDocument,
    matchingUri?: vscode.Uri
): Promise<void> {
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

    const targets = await promptUserForDefinitionLocations(classDoc, position, matchingUri);
    if (!targets) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(opEqual, position, classDoc, targets.equal, workspaceEdit);
    if (targets.notEqual) {
        await addNewOperatorToWorkspaceEdit(opNotEqual, position, classDoc, targets.notEqual, workspaceEdit);
    }
    await vscode.workspace.applyEdit(workspaceEdit);
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
        const formattedInlineDefinition = target.formatTextToInsert(inlineDefinition);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedInlineDefinition);
    } else {
        const formattedDeclaration = declarationPos.formatTextToInsert(newOperator.declaration + ';', classDoc);
        const definition = await newOperator.definition(target.sourceDoc, target.position, curlySeparator);
        const formattedDefinition = target.position.formatTextToInsert(definition, target.sourceDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
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

class DefinitionLocationQuickPickItems {
    inline: DefinitionLocationQuickPickItem;
    currentFile: DefinitionLocationQuickPickItem;
    sourceFile: DefinitionLocationQuickPickItem;

    constructor(defaultLocation: cfg.DefinitionLocation) {
        this.inline = { label: 'Inline', location: cfg.DefinitionLocation.Inline };
        this.currentFile = { label: 'Current File', location: cfg.DefinitionLocation.CurrentFile };
        this.sourceFile = { label: 'Source File', location: cfg.DefinitionLocation.SourceFile };

        switch (defaultLocation) {
        case cfg.DefinitionLocation.Inline:
            this.inline.picked = true;
        case cfg.DefinitionLocation.CurrentFile:
            this.currentFile.picked = true;
        case cfg.DefinitionLocation.SourceFile:
            this.sourceFile.picked = true;
        }
    }

    get items(): DefinitionLocationQuickPickItem[] { return [this.inline, this.currentFile, this.sourceFile]; }
}

interface TargetLocations {
    equal: TargetLocation;
    notEqual?: TargetLocation;
}

async function promptUserForDefinitionLocations(
    classDoc: SourceDocument,
    declarationPos: ProposedPosition,
    matchingUri?: vscode.Uri
): Promise<TargetLocations | undefined> {
    const equalityDefinitionItem = await vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(cfg.DefinitionLocation.SourceFile).items,
            { placeHolder: 'Choose where to place the definition of operator==' });
    if (!equalityDefinitionItem) {
        return;
    }

    const p_inequalityDefinitionItem = vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(cfg.DefinitionLocation.Inline).items,
            { placeHolder: 'Choose where to place the definition of operator!= (Uncheck to only generate operator==)' });

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
