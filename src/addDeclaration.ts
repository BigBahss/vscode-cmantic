import * as vscode from 'vscode';
import * as util from './utility';
import SourceFile from './SourceFile';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import { getMatchingHeaderSource, logger } from './extension';


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
): Promise<boolean | undefined> {
    if (!functionDefinition || !definitionDoc || !targetUri) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        definitionDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingHeaderSource(definitionDoc.uri),
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
        if (existingDeclarationSymbol?.matches(functionDefinition)) {
            logger.alertInformation(failure.declarationExists);
            return;
        }
    }

    const parentClass = await functionDefinition.getParentClass();
    const access = parentClass !== undefined
            ? await util.getMemberAccessFromUser()
            : undefined;
    if (parentClass && access === undefined) {
        // User cancelled the access specifier selection.
        return;
    }

    const targetPos = await definitionDoc.findSmartPositionForFunctionDeclaration(
            functionDefinition, targetDoc, parentClass, access);

    const declaration = await functionDefinition.getDeclarationForTargetPosition(targetDoc, targetPos);
    let formattedDeclaration = declaration;
    if (access && !parentClass?.positionHasAccess(targetPos, access)) {
        formattedDeclaration = util.accessSpecifierString(access) + targetDoc.endOfLine + formattedDeclaration;
    }
    formattedDeclaration = targetPos.formatTextToInsert(formattedDeclaration, targetDoc);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, targetPos, formattedDeclaration);
    return vscode.workspace.applyEdit(workspaceEdit);
}
