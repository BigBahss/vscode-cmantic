import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';
import { ProposedPosition, TargetLocation } from './ProposedPosition';
import {
    Operand, Operator, EqualOperator, NotEqualOperator, LessThanOperator, StreamOutputOperator
} from './Operator';
import { getMatchingHeaderSource, logger } from './extension';


export const title = {
    equality: 'Generate Equality Operators',
    relational: 'Generate Relational Operators',
    streamOutput: 'Generate Stream Output Operator'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noClassOrStruct: 'No class or struct detected.',
    positionNotFound: 'Could not find a position for a new public member function.'
};

export async function generateEqualityOperators(
    parentClass?: CSymbol,
    classDoc?: SourceDocument
): Promise<boolean | undefined> {
    if (!parentClass || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        classDoc = new SourceDocument(editor.document);

        const symbol = await classDoc.getSymbol(editor.selection.start);

        parentClass = symbol?.isClassOrStruct() ? symbol : symbol?.parent;

        if (!parentClass?.isClassOrStruct()) {
            logger.alertWarning(failure.noClassOrStruct);
            return;
        }
    }

    const p_operands = promptUserForOperands(parentClass, 'Select what you would like to compare in operator==');

    const equalPosition = parentClass.findPositionForNewMemberFunction(util.AccessLevel.public);
    if (!equalPosition) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const operands = await p_operands;
    if (!operands) {
        return;
    }

    const equalOp = new EqualOperator(parentClass, operands);
    const notEqualOp = new NotEqualOperator(parentClass);

    const targets = await promptUserForDefinitionLocations(
            parentClass, classDoc, equalPosition, equalOp.name, notEqualOp.name);
    if (!targets) {
        return;
    }

    const notEqualPosition = new ProposedPosition(equalPosition, {
        relativeTo: equalPosition.options.relativeTo,
        after: true,
        nextTo: true,
        indent: equalPosition.options.indent
    });

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(equalOp, equalPosition, classDoc, targets.first, workspaceEdit);
    if (targets.second) {
        await addNewOperatorToWorkspaceEdit(
                notEqualOp, notEqualPosition, classDoc, targets.second, workspaceEdit, true);
    }

    return vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateRelationalOperators(
    parentClass?: CSymbol,
    classDoc?: SourceDocument
): Promise<boolean | undefined> {
    if (!parentClass || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        classDoc = new SourceDocument(editor.document);

        const symbol = await classDoc.getSymbol(editor.selection.start);

        parentClass = symbol?.isClassOrStruct() ? symbol : symbol?.parent;

        if (!parentClass?.isClassOrStruct()) {
            logger.alertWarning(failure.noClassOrStruct);
            return;
        }
    }

    const p_operands = promptUserForOperands(parentClass, 'Select what you would like to compare in operator<');

    const lessThanPosition = parentClass.findPositionForNewMemberFunction(util.AccessLevel.public);
    if (!lessThanPosition) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const operands = await p_operands;
    if (!operands) {
        return;
    }

    const lessThanOp = new LessThanOperator(parentClass, operands);

    const targets = await promptUserForDefinitionLocations(
            parentClass, classDoc, lessThanPosition, lessThanOp.name);
    if (!targets) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(lessThanOp, lessThanPosition, classDoc, targets.first, workspaceEdit);

    return vscode.workspace.applyEdit(workspaceEdit);
}

export async function generateStreamOutputOperator(
    parentClass?: CSymbol,
    classDoc?: SourceDocument
): Promise<boolean | undefined> {
    if (!parentClass || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        classDoc = new SourceDocument(editor.document);

        const symbol = await classDoc.getSymbol(editor.selection.start);

        parentClass = symbol?.isClassOrStruct() ? symbol : symbol?.parent;

        if (!parentClass?.isClassOrStruct()) {
            logger.alertWarning(failure.noClassOrStruct);
            return;
        }
    }

    const p_operands = promptUserForOperands(parentClass, 'Select what you would like to output in operator<<');

    const declarationPos = parentClass.findPositionForNewMemberFunction(util.AccessLevel.public);
    if (!declarationPos) {
        logger.alertError(failure.positionNotFound);
        return;
    }

    const newOstreamIncludePos = getPositionForOstreamInclude(classDoc, declarationPos);

    const operands = await p_operands;
    if (!operands) {
        return;
    }

    const streamOutputOp = new StreamOutputOperator(parentClass, operands);

    const targets = await promptUserForDefinitionLocations(parentClass, classDoc, declarationPos, streamOutputOp.name);
    if (!targets) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    await addNewOperatorToWorkspaceEdit(streamOutputOp, declarationPos, classDoc, targets.first, workspaceEdit);
    if (newOstreamIncludePos) {
        workspaceEdit.insert(classDoc.uri, newOstreamIncludePos, '#include <ostream>' + classDoc.endOfLine);
    }

    return vscode.workspace.applyEdit(workspaceEdit);
}

/**
 * Returns undefined if the file already includes ostream or iostream.
 */
function getPositionForOstreamInclude(
    classDoc: SourceDocument, declarationPos: vscode.Position
): vscode.Position | undefined {
    if (!classDoc.includedFiles.some(file => file === 'ostream' || file === 'iostream')) {
        return classDoc.findPositionForNewInclude(declarationPos).system;
    }
}

interface OperandQuickPickItem extends vscode.QuickPickItem {
    operand: Operand;
}

async function promptUserForOperands(parentClass: CSymbol, prompt: string): Promise<Operand[] | undefined> {
    const operands: Operand[] = [...parentClass.baseClasses(), ...parentClass.nonStaticMemberVariables()];
    if (operands.length === 0) {
        return [];
    }

    const operandItems: OperandQuickPickItem[] = [];
    operands.forEach(operand => {
        if (operand instanceof SubSymbol) {
            operandItems.push({
                label: '$(symbol-class) ' + operand.name,
                description: 'Base class',
                operand: operand,
                picked: true
            });
        } else {
            operandItems.push({
                label: '$(symbol-field) ' + operand.name,
                description: util.formatSignature(operand),
                operand: operand,
                picked: true
            });
        }
    });

    const selectedIems = await vscode.window.showQuickPick<OperandQuickPickItem>(operandItems, {
        matchOnDescription: true,
        placeHolder: prompt,
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
    constructor(parentClass: CSymbol, sourceDoc: SourceDocument) {
        super({ label: 'Inline', location: cfg.DefinitionLocation.Inline },
              { label: 'Current File', location: cfg.DefinitionLocation.CurrentFile });

        if (sourceDoc.isHeader() && !parentClass.hasUnspecializedTemplate()) {
            this.push({ label: 'Source File', location: cfg.DefinitionLocation.SourceFile });
        }
    }
}

interface TargetLocations {
    first: TargetLocation;
    second?: TargetLocation;
}

async function promptUserForDefinitionLocations(
    parentClass: CSymbol,
    classDoc: SourceDocument,
    declarationPos: ProposedPosition,
    firstOperatorName: string,
    secondOperatorName?: string
): Promise<TargetLocations | undefined> {
    const firstDefinitionItem = await vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
            new DefinitionLocationQuickPickItems(parentClass, classDoc),
            { placeHolder: `Select where to place the definition of ${firstOperatorName}` });
    if (!firstDefinitionItem) {
        return;
    }

    const p_secondDefinitionItem = secondOperatorName !== undefined
            ? vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(
                new DefinitionLocationQuickPickItems(parentClass, classDoc),
                { placeHolder: `Select where to place the definition of ${secondOperatorName}` })
            : undefined;

    const matchingUri = await getMatchingHeaderSource(classDoc.uri);

    const firstTargetDoc = (firstDefinitionItem.location === cfg.DefinitionLocation.SourceFile && matchingUri)
            ? await SourceDocument.open(matchingUri)
            : classDoc;
    const firstDefinitionPos = (firstDefinitionItem.location === cfg.DefinitionLocation.Inline)
            ? declarationPos
            : await classDoc.findSmartPositionForFunctionDefinition(declarationPos, firstTargetDoc);
    const firstTargetLocation = new TargetLocation(firstDefinitionPos, firstTargetDoc);

    const secondDefinitionItem = await p_secondDefinitionItem;
    if (!secondDefinitionItem) {
        return { first: firstTargetLocation };
    }

    let secondTargetLocation: TargetLocation | undefined;

    if (secondDefinitionItem.location === cfg.DefinitionLocation.SourceFile && matchingUri) {
        const secondTargetDoc = (firstTargetDoc.uri.fsPath === matchingUri.fsPath)
                ? firstTargetDoc
                : await SourceDocument.open(matchingUri);
        const secondDefinitionPos =
                await classDoc.findSmartPositionForFunctionDefinition(declarationPos, secondTargetDoc);
        secondTargetLocation = new TargetLocation(secondDefinitionPos, secondTargetDoc);
    } else {
        const secondDefinitionPos = secondDefinitionItem.location === cfg.DefinitionLocation.Inline
                ? declarationPos
                : await classDoc.findSmartPositionForFunctionDefinition(declarationPos);
        secondTargetLocation = new TargetLocation(secondDefinitionPos, classDoc);
    }

    return { first: firstTargetLocation, second: secondTargetLocation };
}

async function addNewOperatorToWorkspaceEdit(
    newOperator: Operator,
    declarationPos: ProposedPosition,
    classDoc: SourceDocument,
    target: TargetLocation,
    workspaceEdit: vscode.WorkspaceEdit,
    skipAccessSpecifierCheck?: boolean
): Promise<void> {
    if (target.sourceDoc.fileName === classDoc.fileName && target.position.isEqual(declarationPos)) {
        const curlySeparator = (cfg.functionCurlyBraceFormat('cpp', classDoc) === cfg.CurlyBraceFormat.NewLine)
                ? target.sourceDoc.endOfLine
                : ' ';

        let formattedInlineDefinition = (newOperator.body.includes('\n'))
                ? await newOperator.definition(classDoc, declarationPos, curlySeparator)
                : newOperator.declaration + ' { ' + newOperator.body + ' }';
        if (!skipAccessSpecifierCheck
                && !newOperator.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedInlineDefinition = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedInlineDefinition;
        }
        formattedInlineDefinition = declarationPos.formatTextToInsert(formattedInlineDefinition, classDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedInlineDefinition);
    } else {
        const curlySeparator = (cfg.functionCurlyBraceFormat('cpp', target.sourceDoc) === cfg.CurlyBraceFormat.NewLine)
                ? target.sourceDoc.endOfLine
                : ' ';

        let formattedDeclaration = newOperator.declaration + ';';
        if (!skipAccessSpecifierCheck
                && !newOperator.parent?.positionHasAccess(declarationPos, util.AccessLevel.public)) {
            formattedDeclaration = util.accessSpecifierString(util.AccessLevel.public)
                    + classDoc.endOfLine + formattedDeclaration;
        }
        formattedDeclaration = declarationPos.formatTextToInsert(formattedDeclaration, classDoc);

        const definition = await newOperator.definition(target.sourceDoc, target.position, curlySeparator);
        const formattedDefinition = target.position.formatTextToInsert(definition, target.sourceDoc);

        workspaceEdit.insert(classDoc.uri, declarationPos, formattedDeclaration);
        workspaceEdit.insert(target.sourceDoc.uri, target.position, formattedDefinition);
    }
}
