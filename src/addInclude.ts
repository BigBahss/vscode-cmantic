import * as vscode from 'vscode';
import { SourceFile } from './cmantics';
import * as util from './utility';


export async function addInclude(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('You must have a text editor open.');
        return;
    }

    const userInput = vscode.window.showInputBox({ value: '#include ', valueSelection: [9, 9] });

    const sourceFile = new SourceFile(editor.document);
    const newIncludePosition = await sourceFile.findPositionForNewInclude();
    const eol = util.endOfLine(sourceFile.document);

    userInput.then(value => {
        if (value?.trim().match(/^#include\s*<.+>/)) {
            editor.edit(edit => edit.insert(newIncludePosition.system, value + eol));
        } else if (value?.trim().match(/^#include\s*".+"/)) {
            editor.edit(edit => edit.insert(newIncludePosition.project, value + eol));
        } else if (value) {
            vscode.window.showWarningMessage('This doesn\'t seem to be a valid include statement. It wasn\'t added.');
        }
    });
}
