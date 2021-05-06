import * as vscode from 'vscode';


const documentationUrl = vscode.Uri.parse('https://bigbahss.github.io/vscode-cmantic/');

export async function openDocumentation(codeActionKind?: vscode.CodeActionKind): Promise<boolean> {
    return vscode.env.openExternal(documentationUrl);
}
