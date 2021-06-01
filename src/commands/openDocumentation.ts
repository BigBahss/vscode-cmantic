import * as vscode from 'vscode';


const refactoringsUri = vscode.Uri.parse('https://bigbahss.github.io/vscode-cmantic/features/refactorings/');
const sourceActionsUri = vscode.Uri.parse('https://bigbahss.github.io/vscode-cmantic/features/source-actions/');
const allFeaturesUri = vscode.Uri.parse('https://bigbahss.github.io/vscode-cmantic/features/');

export async function openDocumentation(codeActionKind?: vscode.CodeActionKind): Promise<boolean> {
    if (codeActionKind?.contains(vscode.CodeActionKind.Refactor)) {
        return vscode.env.openExternal(refactoringsUri);
    } else if (codeActionKind?.contains(vscode.CodeActionKind.Source)) {
        return vscode.env.openExternal(sourceActionsUri);
    } else {
        return vscode.env.openExternal(allFeaturesUri);
    }
}
