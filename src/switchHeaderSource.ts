import * as vscode from 'vscode';
import { SourceFile } from "./SourceFile";


export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const sourceFile = new SourceFile(editor.document.uri);
    const matchingUri = await sourceFile.findMatchingSourceFile();
    if (!matchingUri) {
        vscode.window.showInformationMessage('No matching header/source file was found.');
        return;
    }

    vscode.window.showTextDocument(matchingUri);
}
