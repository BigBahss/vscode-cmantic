import * as vscode from 'vscode';
import { SourceFile } from "./SourceFile";


export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const uri = await SourceFile.findMatchingSourceFile(editor.document.fileName);
    if (!uri) {
        vscode.window.showErrorMessage('No matching header/source file was found.');
        return;
    }

    vscode.window.showTextDocument(uri);
}
