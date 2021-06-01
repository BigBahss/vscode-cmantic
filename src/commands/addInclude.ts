import * as vscode from 'vscode';
import SourceDocument from '../SourceDocument';
import { logger } from '../extension';
import { showSingleQuickPick } from '../QuickPick';


type IncludeItem = vscode.QuickPickItem & vscode.CompletionItem;

const re_validIncludeStatement = /^\s*#\s*include\s*[<"].+[>"]/;

export async function addInclude(sourceDoc?: SourceDocument): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError('No active text editor detected.');
        return;
    }

    if (!sourceDoc) {
        // Command was called from the command-palette
        sourceDoc = new SourceDocument(editor.document);
    }

    let includePosition: vscode.Position | undefined;
    let includeText = '#include ';
    let userAcceptedInput = false;
    const eol = sourceDoc.endOfLine;
    const editOptions = { undoStopBefore: false, undoStopAfter: false };

    async function onDidChangeValue(value: string, quickPick: vscode.QuickPick<IncludeItem>): Promise<void> {
        if (includePosition && value.length < includeText.length
                && (includeText.endsWith('"') || includeText.endsWith('<'))) {
            const line = sourceDoc!.lineAt(includePosition);
            includePosition = undefined;
            includeText = value;
            quickPick.items = [];
            await editor!.edit(edit => edit.delete(line.rangeIncludingLineBreak), editOptions);
            return;
        }

        if (!includePosition) {
            if (value.endsWith('"')) {
                includePosition = newIncludePositions.project;
                await editor!.edit(edit => edit.insert(includePosition!, eol), editOptions);
            } else if (value.endsWith('<')) {
                includePosition = newIncludePositions.system;
                await editor!.edit(edit => edit.insert(includePosition!, eol), editOptions);
            } else {
                return;
            }
            // eslint-disable-next-line require-atomic-updates
            includeText = value;
        }

        let line = sourceDoc!.lineAt(includePosition);
        await editor!.edit(edit => edit.replace(line.range, value), editOptions);
        line = sourceDoc!.lineAt(includePosition);

        quickPick.items = await getIncludeCompletions(sourceDoc!, line.range.end);
    }

    function onWillAccept(quickPick: vscode.QuickPick<IncludeItem>): boolean {
        if (re_validIncludeStatement.test(quickPick.value)) {
            includeText = quickPick.value;
            userAcceptedInput = true;
            return true;
        }

        const item = quickPick.selectedItems[0];
        if (item) {
            includeText += item.insertText;
            if (item.kind === vscode.CompletionItemKind.Folder || (item.insertText as string)?.endsWith('/')) {
                quickPick.value = includeText;
                onDidChangeValue(includeText, quickPick);
                return false;
            }
        }

        userAcceptedInput = true;
        return true;
    }

    const p_promptUser = showSingleQuickPick<IncludeItem>([], {
        title: 'Enter an include statement',
        value: includeText,
        ignoreFocusOut: true,
        onDidChangeValue: onDidChangeValue,
        onWillAccept: onWillAccept
    });

    const currentPosition = getCurrentPositionFromEditor(editor);
    const newIncludePositions = sourceDoc.findPositionForNewInclude(currentPosition);

    await p_promptUser;

    if (includePosition) {
        const line = sourceDoc.lineAt(includePosition);
        if (userAcceptedInput) {
            if (re_validIncludeStatement.test(includeText)) {
                return editor.edit(edit => edit.replace(line.range, includeText), editOptions);
            } else {
                logger.alertInformation('This doesn\'t seem to be a valid include statement. It wasn\'t added.');
            }
        }
        await editor.edit(edit => edit.delete(line.rangeIncludingLineBreak), editOptions);
    }
}

async function getIncludeCompletions(sourceDoc: SourceDocument, position: vscode.Position): Promise<IncludeItem[]> {
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', sourceDoc.uri, position);

    const includeItems: IncludeItem[] = [];
    for (const item of (completions?.items ?? []) as IncludeItem[]) {
        item.insertText = item.insertText instanceof vscode.SnippetString
                ? item.insertText.value : (item.insertText ?? item.label);
        switch (item.kind) {
        case vscode.CompletionItemKind.Folder:
            item.label = '$(folder) ' + item.insertText;
            break;
        case vscode.CompletionItemKind.File:
        case vscode.CompletionItemKind.Unit:
        case vscode.CompletionItemKind.Module:
        case undefined:
            item.label = '$(file) ' + item.insertText;
            break;
        default:
            continue;
        }
        item.detail = undefined;
        item.alwaysShow = true;
        includeItems.push(item);
    }

    return includeItems;
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
