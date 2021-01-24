import * as vscode from 'vscode';
import { getMatchingSourceFile } from './extension';
import { SourceFile } from './SourceFile';


const matchingUriCache = new Map<string, vscode.Uri>();

export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const matchingUri = await getMatchingSourceFile(editor.document.uri);
    if (!matchingUri) {
        vscode.window.showInformationMessage('No matching header/source file was found.');
        return;
    }

    await vscode.window.showTextDocument(matchingUri);
}
