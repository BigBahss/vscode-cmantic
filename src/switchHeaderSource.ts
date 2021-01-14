import * as vscode from 'vscode';
import * as c from './cmantics';


export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const uri = await c.SourceFile.findMatchingSourceFile(editor.document.fileName);
    if (!uri) {
        vscode.window.showErrorMessage('No matching header/source file was found.');
        return;
    }

    vscode.window.showTextDocument(uri);
}
