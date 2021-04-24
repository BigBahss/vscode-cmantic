import * as vscode from 'vscode';
import SourceDocument from '../SourceDocument';
import { logger } from '../extension';
import { showSingleQuickPick } from '../QuickPick';


export async function addInclude(sourceDoc?: SourceDocument): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError('No active text editor detected.');
        return;
    }

    let lineNumber: number | undefined;

    const p_userInput = showSingleQuickPick([] as vscode.QuickPickItem[], {
        title: 'Enter an include statement',
        value: '#include ',
        ignoreFocusOut: true,
        onDidChangeValue: async (value, quickPick) => {
            if (lineNumber === undefined) {
                if (value.indexOf('"') === value.length - 1) {
                    lineNumber = newIncludePosition.project.line;
                    await editor.edit(edit => edit.insert(newIncludePosition.project, sourceDoc!.endOfLine));
                } else if (value.endsWith('<')) {
                    lineNumber = newIncludePosition.system.line;
                    await editor.edit(edit => edit.insert(newIncludePosition.system, sourceDoc!.endOfLine));
                } else {
                    return;
                }
            }
            let line = sourceDoc!.lineAt(lineNumber);
            await editor.edit(edit => edit.replace(line.range, value));
            line = sourceDoc!.lineAt(lineNumber);
            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider', sourceDoc?.uri, line.range.end);
            const items = completions?.items.filter((item: vscode.QuickPickItem & vscode.CompletionItem) => {
                switch (item.kind) {
                case vscode.CompletionItemKind.File:
                    item.label = '$(file) ' + item.label;
                    break;
                case vscode.CompletionItemKind.Folder:
                    item.label = '$(folder) ' + item.label;
                    break;
                default:
                    return false;
                }
                return item.alwaysShow = true;
            }) ?? [];
            quickPick.items = items;
        }
    });

    if (!sourceDoc) {
        // Command was called from the command-palette
        sourceDoc = new SourceDocument(editor.document);
    }

    const currentPosition = getCurrentPositionFromEditor(editor);
    const newIncludePosition = sourceDoc.findPositionForNewInclude(currentPosition);

    const userInput = await p_userInput;
    if (userInput !== undefined) {
        if (/^\s*#\s*include\s*<.+>/.test(userInput.label)) {
            return editor.edit(edit => edit.insert(newIncludePosition.system, userInput.label + sourceDoc!.endOfLine));
        } else if (/^\s*#\s*include\s*".+"/.test(userInput.label)) {
            return editor.edit(edit => edit.insert(newIncludePosition.project, userInput.label + sourceDoc!.endOfLine));
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
