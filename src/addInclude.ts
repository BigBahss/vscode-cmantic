import * as vscode from 'vscode';
import * as util from './utility';
import { SourceDocument } from "./SourceDocument";


export async function addInclude(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('You must have a text editor open.');
        return;
    }

    const userInput = vscode.window.showInputBox({ value: '#include ', valueSelection: [9, 9] });

    const sourceDoc = new SourceDocument(editor.document);
    const newIncludePosition = sourceDoc.findPositionForNewInclude();
    const eol = util.endOfLine(sourceDoc.document);

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
