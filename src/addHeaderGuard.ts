import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceDocument } from "./SourceDocument";


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notHeaderFile: 'This file is not a header file.',
    headerGuardExists: 'A header guard already exists.'
};


export function addHeaderGuard(): void
{
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }
    const fileName = util.fileName(activeEditor.document.uri.path);
    const sourceDoc = new SourceDocument(activeEditor.document);
    if (!sourceDoc.isHeader()) {
        vscode.window.showErrorMessage(failure.notHeaderFile);
        return;
    } else if (sourceDoc.hasHeaderGuard()) {
        vscode.window.showInformationMessage(failure.headerGuardExists);
        return;
    }

    const headerGuardPosition = sourceDoc.positionAfterHeaderComment();
    const eol = util.endOfLine(sourceDoc.document);

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

    const footerPosition = new vscode.Position(sourceDoc.document.lineCount - 1, 0);

    if (headerGuardPosition.after) {
        header = eol + eol + header;
    } else if (headerGuardPosition.before) {
        header += eol;
    }
    if (sourceDoc.document.getText(new vscode.Range(headerGuardPosition.value, footerPosition)).trim().length === 0) {
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
