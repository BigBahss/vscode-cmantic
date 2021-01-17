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

    return generateGetterSetterFor(symbol);
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
    const combinedText = getter + util.endOfLine(symbol.document) + setter;

    return util.insertSnippetAndTrimWhitespace(combinedText, position, symbol.document);
}
