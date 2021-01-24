import * as vscode from 'vscode';
import { SourceFile } from './SourceFile';


const matchingUriCache = new Map<string, vscode.Uri>();

export async function switchHeaderSourceInWorkspace(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const cachedMatchingUri = matchingUriCache.get(editor.document.uri.toString());
    if (cachedMatchingUri) {
        await vscode.window.showTextDocument(cachedMatchingUri);
        return;
    }

    const sourceFile = new SourceFile(editor.document.uri);
    const matchingUri = await sourceFile.findMatchingSourceFile();
    if (!matchingUri) {
        vscode.window.showInformationMessage('No matching header/source file was found.');
        return;
    }

    matchingUriCache.set(sourceFile.uri.toString(), matchingUri);
    matchingUriCache.set(matchingUri.toString(), sourceFile.uri);
    await vscode.window.showTextDocument(matchingUri);
}
