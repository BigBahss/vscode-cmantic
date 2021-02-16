import * as vscode from 'vscode';
import * as cfg from './configuration';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from './ProposedPosition';
import { getMatchingSourceFile } from './extension';
import { logger } from './logger';
import { SourceFile } from './SourceFile';


export const title = {
    matchingSourceFile: 'Move Definition to matching source file',
    outOfClass: 'Move Definition below class body',
    outOfStruct: 'Move Definition below struct body',
    intoClass: 'Move Definition into class',
    intoStruct: 'Move Definition into struct',
    intoOrOutOfClass: 'Move Definition into/out-of class body'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noFunctionDefinition: 'No function definition detected.',
    noFunctionDeclaration: 'No declaration found for this function definition.',
    noMatchingSourceFile: 'No matching source file was found.',
    notCpp: 'Detected language is not C++, cannot operate on classes.',
    notMemberFunction: 'Function is not a class member function.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.'
};

export async function moveDefinitionToMatchingSourceFile(
    definition?: CSymbol,
    targetUri?: vscode.Uri,
    declaration?: SourceSymbol
): Promise<boolean> {
    if (!definition || !targetUri) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.showErrorMessage(failure.noActiveTextEditor);
            return false;
        }

        const sourceDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(editor.selection.start)
        ]);

        if (!symbol?.isFunctionDefinition()) {
            logger.showWarningMessage(failure.noFunctionDefinition);
            return false;
        } else if (!matchingUri) {
            logger.showWarningMessage(failure.noMatchingSourceFile);
            return false;
        }

        definition = symbol;
        targetUri = matchingUri;
        const declarationLocation = await definition.findDeclaration();
        if (declarationLocation) {
            declaration = await SourceFile.getSymbol(declarationLocation);
        }
    }

    const targetDoc = await SourceDocument.open(targetUri);
    const position = (declaration !== undefined)
            ? await getNewPosition(targetDoc, declaration)
            : await getNewPosition(targetDoc, definition);

    let insertText = await definition.getTextForTargetPosition(targetDoc, position, declaration);
    insertText = position.formatTextToInsert(insertText, targetDoc);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, position, insertText);
    if (!declaration && SourceFile.isHeader(definition.uri)) {
        const newDeclaration = definition.newFunctionDeclaration();
        const replaceRange = cfg.alwaysMoveComments()
                ? definition.getRangeWithLeadingComment()
                : definition.getFullRange();
        workspaceEdit.replace(definition.uri, replaceRange, newDeclaration);
    } else {
        const deletionRange = getDeletionRange(definition);
        workspaceEdit.delete(definition.uri, deletionRange);
    }
    return vscode.workspace.applyEdit(workspaceEdit);
}

export async function moveDefinitionIntoOrOutOfClass(
    definition?: CSymbol,
    classDoc?: SourceDocument,
    declaration?: CSymbol
): Promise<boolean> {
    if (!definition || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.showErrorMessage(failure.noActiveTextEditor);
            return false;
        }

        const sourceDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(editor.selection.start)
        ]);

        if (!symbol?.isFunctionDefinition()) {
            logger.showWarningMessage(failure.noFunctionDefinition);
            return false;
        }
        definition = symbol;

        if (definition.parent?.isClassOrStruct()) {
            classDoc = sourceDoc;
        } else {
            const declarationLocation = await definition.findDeclaration();
            if (declarationLocation !== undefined
                    && (declarationLocation?.uri.fsPath === definition.uri.fsPath
                    || declarationLocation?.uri.fsPath === matchingUri?.fsPath)) {
                classDoc = declarationLocation.uri.fsPath === sourceDoc.uri.fsPath
                        ? sourceDoc
                        : await SourceDocument.open(declarationLocation.uri);
                declaration = await classDoc.getSymbol(declarationLocation.range.start);
            }

            if (!declaration?.parent?.isClassOrStruct() || !classDoc) {
                logger.showWarningMessage(failure.notMemberFunction);
                return false;
            }
        }
    }

    if (definition.parent?.isClassOrStruct()) {
        const position = await getNewPosition(classDoc, definition);

        let insertText = await definition.getTextForTargetPosition(classDoc, position, declaration);
        insertText = position.formatTextToInsert(insertText, classDoc);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.insert(classDoc.uri, position, insertText);
        const newDeclaration = definition.newFunctionDeclaration();
        const replaceRange = cfg.alwaysMoveComments()
                ? definition.getRangeWithLeadingComment()
                : definition.getFullRange();
        workspaceEdit.replace(definition.uri, replaceRange, newDeclaration);
        return vscode.workspace.applyEdit(workspaceEdit);
    } else if (declaration) {
        const combinedDefinition = declaration.combineDefinition(definition);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(declaration.uri, declaration.getFullRange(), combinedDefinition);
        const deletionRange = getDeletionRange(definition);
        workspaceEdit.delete(definition.uri, deletionRange);
        return vscode.workspace.applyEdit(workspaceEdit);
    }

    logger.showWarningMessage(failure.noFunctionDeclaration);
    return false;
}

async function getNewPosition(targetDoc: SourceDocument, declaration?: SourceSymbol): Promise<ProposedPosition>
{
    if (!declaration) {
        return targetDoc.findPositionForNewSymbol();
    }

    const declarationDoc = await SourceDocument.open(declaration.uri);
    return await declarationDoc.findPositionForFunctionDefinition(declaration, targetDoc);
}

function getDeletionRange(definition: CSymbol): vscode.Range
{
    let deletionRange = definition.getRangeWithLeadingComment();
    if (definition.document.lineAt(deletionRange.start.line - 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(deletionRange.start.line - 1).range);
    }
    if (definition.document.lineAt(deletionRange.end.line + 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(deletionRange.end.line + 1).range);
    }
    return deletionRange;
}
