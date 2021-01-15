import * as vscode from 'vscode';
import * as c from './cmantics';
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
    const sourceFile = new c.SourceFile(activeEditor.document);
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
        const FILENAME_EXT = fileName.replace('.', '_').toUpperCase();
        const FILENAME = util.fileNameBase(fileName).toUpperCase();

        const headerGuardDefine = cfg.headerGuardDefineFormat()
                .replace('${FILENAME_EXT}', FILENAME_EXT).replace('${FILENAME}', FILENAME);

        header += '#ifndef ' + headerGuardDefine + eol + '#define ' + headerGuardDefine + eol;
        footer = eol + '#endif // ' + headerGuardDefine + eol;
    }

    if (headerGuardPosition.after) {
        header = eol + eol + header;
    } else if (headerGuardPosition.before) {
        header += eol;
    } else if (sourceFile.document.lineCount - 1 === headerGuardPosition.value.line) {
        footer += eol;
    }

    activeEditor.insertSnippet(
            new vscode.SnippetString(footer),
            new vscode.Position(sourceFile.document.lineCount - 1, 0),
            { undoStopBefore: true, undoStopAfter: false });
    activeEditor.insertSnippet(
            new vscode.SnippetString(header),
            headerGuardPosition.value,
            { undoStopBefore: false, undoStopAfter: true });
}
