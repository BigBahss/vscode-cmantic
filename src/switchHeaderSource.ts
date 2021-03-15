import * as vscode from 'vscode';
import { getMatchingHeaderSource, logger } from './extension';


export async function switchHeaderSourceInWorkspace(): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError('No active text editor detected.');
        return;
    }

    const matchingUri = await getMatchingHeaderSource(editor.document.uri);
    if (!matchingUri) {
        logger.alertInformation('No matching header/source file was found.');
        return;
    }

    await vscode.window.showTextDocument(matchingUri);
    return true;
}
