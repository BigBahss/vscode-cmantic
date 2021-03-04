import * as vscode from 'vscode';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { getMatchingSourceFile } from './extension';
import { SourceFile } from './SourceFile';


export const title = {
    currentFile: 'Add Declaration in this file',
    matchingHeaderFile: 'Add Declaration in matching header file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noFunctionDefinition: 'No function definition detected.',
    declarationExists: 'A declaration for this function already exists.'
};

export async function addDeclaration(
    functionDefinition?: CSymbol,
    definitionDoc?: SourceDocument,
    targetUri?: vscode.Uri
): Promise<void> {
    if (!functionDefinition || !definitionDoc || !targetUri) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        definitionDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(definitionDoc.uri),
            definitionDoc.getSymbol(editor.selection.start)
        ]);

        if (!symbol?.isFunctionDefinition()) {
            logger.alertWarning(failure.noFunctionDefinition);
            return;
        }

        functionDefinition = symbol;
        targetUri = (matchingUri && SourceFile.isHeader(matchingUri)) ? matchingUri : definitionDoc.uri;
    }

    // Find the position for the new function definition.
    const targetDoc = (targetUri.fsPath === definitionDoc.uri.fsPath)
            ? definitionDoc
            : await SourceDocument.open(targetUri);

    const existingDeclaration = await functionDefinition.findDeclaration();
    if (existingDeclaration?.uri.fsPath === targetDoc.uri.fsPath) {
        const existingDeclarationSymbol = await targetDoc.getSymbol(existingDeclaration.range.start);
        if (existingDeclarationSymbol?.equals(functionDefinition)) {
            logger.alertInformation(failure.declarationExists);
            return;
        }
    }

    const targetPos = await definitionDoc.findPositionForFunctionDeclaration(functionDefinition, targetDoc);
    const declaration = await functionDefinition.getDeclarationForTargetPosition(targetDoc, targetPos);
    const formattedDeclaration = targetPos.formatTextToInsert(declaration, targetDoc);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, targetPos, formattedDeclaration);
    await vscode.workspace.applyEdit(workspaceEdit);
}
