import * as vscode from 'vscode';
import SourceDocument from './SourceDocument';
import { logger } from './extension';


export async function addInclude(sourceDoc: SourceDocument): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError('No active text editor detected.');
        return;
    }

    const p_userInput = vscode.window.showInputBox({ value: '#include ', valueSelection: [9, 9] });

    if (!sourceDoc) {
        // Command was called from the command-palette
        sourceDoc = new SourceDocument(editor.document);
    }

    const currentPosition = getCurrentPositionFromEditor(editor);
    const newIncludePosition = sourceDoc.findPositionForNewInclude(currentPosition);

    const userInput = await p_userInput;
    if (userInput !== undefined) {
        if (/^\s*#\s*include\s*<.+>/.test(userInput)) {
            return editor.edit(edit => edit.insert(newIncludePosition.system, userInput + sourceDoc.endOfLine));
        } else if (/^\s*#\s*include\s*".+"/.test(userInput)) {
            return editor.edit(edit => edit.insert(newIncludePosition.project, userInput + sourceDoc.endOfLine));
        } else {
            logger.alertInformation('This doesn\'t seem to be a valid include statement. It wasn\'t added.');
        }
    }
}

function getCurrentPositionFromEditor(editor: vscode.TextEditor): vscode.Position | undefined {
    let pos: vscode.Position | undefined;
    for (const visibleRange of editor.visibleRanges) {
        if (!pos?.isAfter(visibleRange.end)) {
            pos = visibleRange.end;
        }
    }
    return pos;
}
