import * as vscode from 'vscode';
import { getMatchingSourceFile, logger } from './extension';


export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.showErrorMessage('No active text editor detected.');
        return;
    }

    const matchingUri = await getMatchingSourceFile(editor.document.uri);
    if (!matchingUri) {
        logger.showInformationMessage('No matching header/source file was found.');
        return;
    }

    await vscode.window.showTextDocument(matchingUri);
}
