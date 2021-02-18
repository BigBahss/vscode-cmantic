import * as vscode from 'vscode';
import { SourceDocument } from './SourceDocument';
import { logger } from './logger';


export async function addInclude(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.showErrorMessage('No active text editor detected.');
        return;
    }

    const userInput = vscode.window.showInputBox({ value: '#include ', valueSelection: [9, 9] });

    const sourceDoc = new SourceDocument(editor.document);
    const newIncludePosition = sourceDoc.findPositionForNewInclude();

    return userInput.then(value => {
        if (value !== undefined) {
            if (/^\s*#\s*include\s*<.+>/.test(value)) {
                editor.edit(edit => edit.insert(newIncludePosition.system, value + sourceDoc.endOfLine));
            } else if (/^\s*#\s*include\s*".+"/.test(value)) {
                editor.edit(edit => edit.insert(newIncludePosition.project, value + sourceDoc.endOfLine));
            } else {
                logger.showInformationMessage('This doesn\'t seem to be a valid include statement. It wasn\'t added.');
            }
        }
    });
}
