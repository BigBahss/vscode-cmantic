import * as vscode from 'vscode';
import * as util from './utility';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from './ProposedPosition';
import { getMatchingSourceFile, logger } from './extension';
import { SourceFile } from './SourceFile';


export const title = {
    matchingSourceFile: 'Move Definition to matching source file',
    outOfClass: 'Move Definition below class body',
    intoClass: 'Move Definition into class body',
    intoOrOutOfClassPlaceholder: 'Move Definition into or out of class body'
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
    const position = await getNewPosition(targetDoc, declaration);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const insertText = await getInsertText(definition, position, targetDoc, declaration);
    workspaceEdit.insert(targetDoc.uri, position, insertText);
    if (!declaration && SourceFile.isHeader(definition.uri)
            && (definition.parent?.isClassOrStruct() || definition.parent?.kind === vscode.SymbolKind.Namespace)) {
        const newDeclaration = definition.newFunctionDeclaration();
        workspaceEdit.replace(definition.uri, definition.getFullRange(), newDeclaration);
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
        return false;
    }

    if (definition.parent?.isClassOrStruct()) {
        const position = await getNewPosition(classDoc, definition);

        const workspaceEdit = new vscode.WorkspaceEdit();
        const insertText = await getInsertText(definition, position, classDoc);
        workspaceEdit.insert(classDoc.uri, position, insertText);
        const newDeclaration = definition.newFunctionDeclaration();
        workspaceEdit.replace(definition.uri, definition.getFullRange(), newDeclaration);
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

async function getInsertText(
    definition: CSymbol,
    position: ProposedPosition,
    targetDoc: SourceDocument,
    declaration?: SourceSymbol
): Promise<string> {
    const p_insertText = definition.getTextForTargetPosition(targetDoc, position, declaration);
    const re_indentation = util.getIndentationRegExp(definition);

    return new Promise((resolve) => {
        p_insertText.then(insertText => {
            insertText = insertText.replace(re_indentation, '');
            resolve(position.formatTextToInsert(insertText, targetDoc));
        });
    });
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
