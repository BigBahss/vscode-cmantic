import * as vscode from 'vscode';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';


export const title = {
    currentFile: 'Add Declaration in this file',
    matchingHeaderFile: 'Add Declaration in matching header file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notSourceFile: 'This file is not a source file.',
    noFunctionDefinition: 'No function definition detected.',
    noMatchingHeaderFile: 'No matching header file was found.',
    declarationExists: 'A declaration for this function already exists.'
};

export async function addDeclaration(
    functionDefinition: CSymbol,
    definitionDoc: SourceDocument,
    targetUri: vscode.Uri
): Promise<void> {
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
