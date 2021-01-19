import * as vscode from 'vscode';
import { SourceFile } from './cmantics';
import * as cfg from './configuration';
import * as util from './utility';


export function addHeaderGuard(): void
{
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('You must have a text editor open.');
        return;
    }
    const fileName = util.fileName(activeEditor.document.uri.path);
    const sourceFile = new SourceFile(activeEditor.document);
    if (!sourceFile.isHeader()) {
        vscode.window.showErrorMessage('This file is not a header file.');
        return;
    }

    const headerGuardPosition = sourceFile.findPositionForNewHeaderGuard();
    const eol = util.endOfLine(sourceFile.document);

    let header = '';
    let footer = '';
    const headerGuardKind = cfg.headerGuardStyle();

    if (headerGuardKind === cfg.HeaderGuardStyle.PragmaOnce || headerGuardKind === cfg.HeaderGuardStyle.Both) {
        header = '#pragma once' + eol;
    }

    if (headerGuardKind === cfg.HeaderGuardStyle.Define || headerGuardKind === cfg.HeaderGuardStyle.Both) {
        const headerGuardDefine = cfg.headerGuardDefine(fileName);
        header += '#ifndef ' + headerGuardDefine + eol + '#define ' + headerGuardDefine + eol;
        footer = eol + '#endif // ' + headerGuardDefine + eol;
    }

    const footerPosition = new vscode.Position(sourceFile.document.lineCount - 1, 0);

    if (headerGuardPosition.after) {
        header = eol + eol + header;
    } else if (headerGuardPosition.before) {
        header += eol;
    }
    if (sourceFile.document.getText(new vscode.Range(headerGuardPosition.value, footerPosition)).trim().length === 0) {
        header += eol;
    }
    if (footerPosition.line === headerGuardPosition.value.line) {
        footer = eol + footer;
    }

    activeEditor.insertSnippet(
            new vscode.SnippetString(footer),
            footerPosition,
            { undoStopBefore: true, undoStopAfter: false });
    activeEditor.insertSnippet(
            new vscode.SnippetString(header),
            headerGuardPosition.value,
            { undoStopBefore: false, undoStopAfter: true });
}
