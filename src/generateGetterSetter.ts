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

    const baseMemberName = getBaseMemberName(symbol.name);

    // If we extracted a base member name, use that for the getter function name. Otherwise prepend with 'get'.
    const getterName = baseMemberName ? baseMemberName : 'get' + util.firstCharToUpper(symbol.name);
    const setterName = 'set' + util.firstCharToUpper(baseMemberName ? baseMemberName : symbol.name);

    const leading = symbol.leading();
    const staticness = leading.match(/\bstatic\b/) ? 'static ' : '';
    const constness = staticness ? '' : ' const';
    const type = leading.replace(/\b(static|mutable)\b\s*/g, '');

    const getter = staticness + type + getterName + '()' + constness + ' { return ' + symbol.name + '; }';
    const setter = staticness + 'void ' + setterName + '(' + type + 'value) { ' + symbol.name + ' = value; }';
    const combinedText = getter + util.endOfLine(symbol.document) + setter;

    return util.insertSnippetAndTrimWhitespace(combinedText, position, symbol.document);
}

function getBaseMemberName(symbolName: string): string | undefined
{
    // Check for common member variable naming schemes and get the base name from them.
    let baseMemberName: string | undefined;
    let match = /^_+[\w_][\w\d_]*_*$/.exec(symbolName);
    if (match && !baseMemberName) {
        baseMemberName = symbolName.replace(/^_+|_*$/g, '');
    }
    match = /^_*[\w_][\w\d_]*_+$/.exec(symbolName);
    if (match && !baseMemberName) {
        baseMemberName = symbolName.replace(/^_*|_+$/g, '');
    }
    match = /^m_[\w_][\w\d_]*$/.exec(symbolName);
    if (match && !baseMemberName) {
        baseMemberName = symbolName.replace(/^m_/, '');
    }

    return baseMemberName;
}
