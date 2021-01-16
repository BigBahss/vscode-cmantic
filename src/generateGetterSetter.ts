import * as vscode from 'vscode';
import { CSymbol, SourceFile } from './cmantics';
import * as util from './utility';


export async function generateGetterSetter(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor detected.');
        return;
    }

    const sourceFile = new SourceFile(editor.document);
    if (!sourceFile.isHeader()) {
        vscode.window.showErrorMessage('This file is not a header file.');
        return;
    }

    const symbol = await sourceFile.getSymbol(editor.selection.start);
    if (!symbol?.isMemberVariable()) {
        vscode.window.showErrorMessage('No member variable detected.');
        return;
    }

    generateGetterSetterFor(symbol);
}

export async function generateGetterSetterFor(symbol: CSymbol): Promise<void>
{
    const position = symbol.parent?.findPositionForNewMethod();
    if (!position) {
        vscode.window.showErrorMessage('Could not find a position for \'get\' and \'set\' methods.');
        return;
    }

    const baseFunctionName = util.firstCharToUpper(symbol.name);
    const getterName = 'get' + baseFunctionName;
    const setterName = 'set' + baseFunctionName;
    const type = symbol.leading();

    const getter = type + getterName + '() const { return ' + symbol.name + '; }';
    const setter = 'void ' + setterName + '(' + type + 'value) { ' + symbol.name + ' = value; }';

    const eol = util.endOfLine(symbol.document);
    let fullText = getter + eol + setter;
    if (position.after) {
        fullText = eol + eol + fullText;
    } else if (position.before) {
        fullText += eol + eol;
    } else if (symbol.document.lineCount - 1 === position.value.line) {
        fullText += eol;
    }
    const snippet = new vscode.SnippetString(fullText);

    const editor = await vscode.window.showTextDocument(symbol.document.uri);
    await editor.insertSnippet(snippet, position.value, { undoStopBefore: true, undoStopAfter: false });
    if (position.before || position.after) {
        /* When inserting a indented snippet that contains an empty line, the empty line with be indented,
         * thus leaving trailing whitespace. So we need to clean up that whitespace. */
        editor.edit(editBuilder => {
            const trailingWSPosition = position.value.translate(position.after ? 1 : util.lines(snippet.value));
            const l = symbol.document.lineAt(trailingWSPosition);
            if (l.isEmptyOrWhitespace) {
                editBuilder.delete(l.range);
            }
        }, { undoStopBefore: false, undoStopAfter: true });
    }
    const revealPosition = position.value.translate(position.after ? 3 : -3);
    editor.revealRange(new vscode.Range(revealPosition, revealPosition), vscode.TextEditorRevealType.InCenter);
}
