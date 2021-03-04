import * as vscode from 'vscode';
import { SourceDocument } from './SourceDocument';
import { logger } from './logger';


export async function addInclude(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError('No active text editor detected.');
        return;
    }

    const p_userInput = vscode.window.showInputBox({ value: '#include ', valueSelection: [9, 9] });

    const sourceDoc = new SourceDocument(editor.document);
    const newIncludePosition = sourceDoc.findPositionForNewInclude();

    const userInput = await p_userInput;
    if (userInput !== undefined) {
        if (/^\s*#\s*include\s*<.+>/.test(userInput)) {
            editor.edit(edit => edit.insert(newIncludePosition.system, userInput + sourceDoc.endOfLine));
        } else if (/^\s*#\s*include\s*".+"/.test(userInput)) {
            editor.edit(edit => edit.insert(newIncludePosition.project, userInput + sourceDoc.endOfLine));
        } else {
            logger.alertInformation('This doesn\'t seem to be a valid include statement. It wasn\'t added.');
        }
    }
}
