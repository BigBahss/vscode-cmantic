import * as vscode from 'vscode';
import { CSymbol, ProposedPosition, SourceFile } from './cmantics';
import * as util from './utility';


export async function generateGetterSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterSetterFor, 'Could not find a position for \'get\' and \'set\' methods.');
}

export async function generateGetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateGetterFor, 'Could not find a position for \'get\' method.');
}

export async function generateSetter(): Promise<void>
{
    return getCurrentSymbolAndCall(generateSetterFor, 'Could not find a position for \'set\' method.');
}

async function getCurrentSymbolAndCall(
    callback: (symbol: CSymbol, errorMsg: string) => Promise<void>,
    errorMsg: string
): Promise<void> {
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

    return callback(symbol, errorMsg);
}

export async function generateGetterSetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const memberInfo = getMemberInfo(symbol);
    if (!memberInfo) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    const getterName = symbol.getterName(memberInfo.baseName);
    const setterName = symbol.setterName(memberInfo.baseName);

    let type = symbol.leading();
    const staticness = type.match(/\bstatic\b/) ? 'static ' : '';
    const constness = staticness ? '' : ' const';
    type = type.replace(/\b(static|mutable)\b\s*/g, '');

    // Pass 'set' parameter by const-reference for non-primitive, non-pointer types.
    const paramType = (!symbol.isPrimitive() && !symbol.isPointer()) ? 'const ' + type + '&' : type;

    const getter = staticness + type + getterName + '()' + constness + ' { return ' + symbol.name + '; }';
    const setter = staticness + 'void ' + setterName + '(' + paramType + 'value) { ' + symbol.name + ' = value; }';
    const combinedText = getter + util.endOfLine(symbol.document) + setter;

    return util.insertSnippetAndTrimWhitespace(combinedText, memberInfo.position, symbol.document);
}

export async function generateGetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const memberInfo = getMemberInfo(symbol);
    if (!memberInfo) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    const getterName = symbol.getterName(memberInfo.baseName);

    let type = symbol.leading();
    const staticness = type.match(/\bstatic\b/) ? 'static ' : '';
    const constness = staticness ? '' : ' const';
    type = type.replace(/\b(static|mutable)\b\s*/g, '');

    const getter = staticness + type + getterName + '()' + constness + ' { return ' + symbol.name + '; }';

    return util.insertSnippetAndTrimWhitespace(getter, memberInfo.position, symbol.document);
}

export async function generateSetterFor(symbol: CSymbol, errorMsg: string): Promise<void>
{
    const memberInfo = getMemberInfo(symbol);
    if (!memberInfo) {
        vscode.window.showErrorMessage(errorMsg);
        return;
    }

    const setterName = symbol.setterName(memberInfo.baseName);

    let type = symbol.leading();
    const staticness = type.match(/\bstatic\b/) ? 'static ' : '';
    type = type.replace(/\b(static|mutable)\b\s*/g, '');

    // Pass 'set' parameter by const-reference for non-primitive, non-pointer types.
    const paramType = (!symbol.isPrimitive() && !symbol.isPointer()) ? 'const ' + type + '&' : type;

    const setter = staticness + 'void ' + setterName + '(' + paramType + 'value) { ' + symbol.name + ' = value; }';

    return util.insertSnippetAndTrimWhitespace(setter, memberInfo.position, symbol.document);
}

interface MemberInfo
{
    position: ProposedPosition;
    baseName?: string;
}

function getMemberInfo(symbol: CSymbol): MemberInfo | undefined
{
    const baseMemberName = symbol.baseName();
    if (!position) {
        return;
    }

    return {
        baseName: baseMemberName,
        position: position
    };
}
