import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';
import { ProposedPosition, TargetLocation } from './ProposedPosition';
import { Operator, OpEqual, OpNotEqual, Operand } from './Operator';
import { getMatchingHeaderSource, logger } from './extension';


export const title = 'Generate Equality Operators';

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noClassOrStruct: 'No class or struct detected.',
    positionNotFound: 'Could not find a position for a new public member function.'
};

export async function generateEqualityOperators(
    classOrStruct?: CSymbol,
    classDoc?: SourceDocument
): Promise<boolean | undefined> {
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

    const p_operands = promptUserForOperands(classOrStruct);

    const equalPosition = classOrStruct.findPositionForNewMemberFunction(util.AccessLevel.public);
    if (!equalPosition) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const operands = await p_operands;
    if (!operands) {
        return;
    }

    const opEqual = new OpEqual(classOrStruct, operands);
    const opNotEqual = new OpNotEqual(classOrStruct);

    const targets = await promptUserForDefinitionLocations(classOrStruct, classDoc, equalPosition);
    if (!targets) {
        return;
    }

    const notEqualPosition = new ProposedPosition(equalPosition, {
        relativeTo: equalPosition.options.relativeTo,
        after: true,
        nextTo: true,
        emptyScope: equalPosition.options.emptyScope
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(opEqual, equalPosition, classDoc, targets.equal, workspaceEdit);
    if (targets.notEqual) {
        await addNewOperatorToWorkspaceEdit(
                opNotEqual, notEqualPosition, classDoc, targets.notEqual, workspaceEdit, true);
    }
    return vscode.workspace.applyEdit(workspaceEdit);
}

interface OperandQuickPickItem extends vscode.QuickPickItem {
    operand: Operand;
}

async function promptUserForOperands(classOrStruct: CSymbol): Promise<Operand[] | undefined> {
    const operands: Operand[] = [...classOrStruct.baseClasses(), ...classOrStruct.nonStaticMemberVariables()];

    if (operands.length === 0) {
        return [];
    }

    const operandItems: OperandQuickPickItem[] = [];
    operands.forEach(operand => {
        if (operand instanceof SubSymbol) {
            operandItems.push({
                label: '$(symbol-class) ' + operand.name,
                description: 'Base class comparison',
                operand: operand,
                picked: true
            });
        } else {
            operandItems.push({
                label: '$(symbol-field) ' + operand.name,
                description: operand.text(),
                operand: operand,
                picked: true
            });
        }
    });

    const selectedIems = await vscode.window.showQuickPick<OperandQuickPickItem>(operandItems, {
        matchOnDescription: true,
        placeHolder: 'Select what you would like to compare in the equality operator:',
        canPickMany: true
    });

    if (!selectedIems) {
        return;
    }

    const selectedOperands: Operand[] = [];
    selectedIems.forEach(item => selectedOperands.push(item.operand));

    return selectedOperands;
}

interface DefinitionLocationQuickPickItem extends vscode.QuickPickItem {
    location: cfg.DefinitionLocation;
}

class DefinitionLocationQuickPickItems extends Array<DefinitionLocationQuickPickItem> {
    constructor(classOrStruct: CSymbol, sourceDoc: SourceDocument) {
        super({ label: 'Inline', location: cfg.DefinitionLocation.Inline },
              { label: 'Current File', location: cfg.DefinitionLocation.CurrentFile });

        if (sourceDoc.isHeader() && !classOrStruct.hasUnspecializedTemplate()) {
            this.push({ label: 'Source File', location: cfg.DefinitionLocation.SourceFile });
        }
    }
}

interface TargetLocations {
    equal: TargetLocation;
    notEqual?: TargetLocation;
}

async function promptUserForDefinitionLocations(
    classOrStruct: CSymbol,
    classDoc: SourceDocument,
    declarationPos: ProposedPosition
): Promise<TargetLocations | undefined> {
    const equalityDefinitionItem = await vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(classOrStruct, classDoc),
            { placeHolder: 'Select where the definition of operator== should be placed:' });
    if (!equalityDefinitionItem) {
        return;
    }

    const p_inequalityDefinitionItem = vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(classOrStruct, classDoc),
            { placeHolder: 'Select where the definition of operator!= should be placed:' });

    const matchingUri = await getMatchingHeaderSource(classDoc.uri);

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
    workspaceEdit: vscode.WorkspaceEdit,
    skipAccessSpecifierCheck?: boolean
): Promise<void> {
    const curlySeparator = (cfg.functionCurlyBraceFormat('cpp') === cfg.CurlyBraceFormat.NewLine)
            ? target.sourceDoc.endOfLine
            : ' ';

    if (target.sourceDoc.fileName === classDoc.fileName && target.position.isEqual(declarationPos)) {
        let formattedInlineDefinition = (newOperator.body.includes('\n'))
                ? await newOperator.definition(classDoc, declarationPos, curlySeparator)
                : newOperator.declaration + ' { ' + newOperator.body + ' }';
        if (!skipAccessSpecifierCheck
                && !newOperator.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedInlineDefinition = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedInlineDefinition;
        }
        formattedInlineDefinition = await declarationPos.formatTextToInsert(formattedInlineDefinition, classDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedInlineDefinition);
    } else {
        let formattedDeclaration = newOperator.declaration + ';';
        if (!skipAccessSpecifierCheck
                && !newOperator.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedDeclaration = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedDeclaration;
        }
        formattedDeclaration = await declarationPos.formatTextToInsert(formattedDeclaration, classDoc);

        const definition = await newOperator.definition(target.sourceDoc, target.position, curlySeparator);
        const formattedDefinition = await target.position.formatTextToInsert(definition, target.sourceDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
}
