import * as vscode from 'vscode';
import * as cfg from './configuration';
import SourceDocument from './SourceDocument';
import SubSymbol from './SubSymbol';
import { logger } from './extension';


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notHeaderFile: 'This file is not a header file.',
};

export async function addHeaderGuard(headerDoc?: SourceDocument): Promise<boolean | undefined> {
    if (!headerDoc) {
        // Command was called from the command-palette
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        headerDoc = new SourceDocument(activeEditor.document);
        if (!headerDoc.isHeader()) {
            logger.alertWarning(failure.notHeaderFile);
            return;
        }
    }

    const workspaceEdit = new vscode.WorkspaceEdit();

    if (headerDoc.hasHeaderGuard()) {
        for (const directive of headerDoc.headerGuardDirectives) {
            workspaceEdit.delete(headerDoc.uri, getDeletionRange(directive));
        }
    }

    let header = '';
    let footer = '';
    const eol = headerDoc.endOfLine;

    const headerGuardKind = cfg.headerGuardStyle(headerDoc);

    if (headerGuardKind === cfg.HeaderGuardStyle.PragmaOnce || headerGuardKind === cfg.HeaderGuardStyle.Both) {
        header = '#pragma once' + eol;
    }

    if (headerGuardKind === cfg.HeaderGuardStyle.Define || headerGuardKind === cfg.HeaderGuardStyle.Both) {
        const headerGuardDefine = cfg.headerGuardDefine(headerDoc.uri);
        header += '#ifndef ' + headerGuardDefine + eol + '#define ' + headerGuardDefine + eol;
        footer = eol + '#endif // ' + headerGuardDefine + eol;
    }

    const headerGuardPosition = headerDoc.positionAfterHeaderComment();
    const footerPosition = headerDoc.lineAt(headerDoc.lineCount - 1).range.end;

    if (headerGuardPosition.options.after) {
        header = eol + eol + header;
    } else if (headerGuardPosition.options.before) {
        header += eol;
    }

    if (headerDoc.getText(new vscode.Range(headerGuardPosition, footerPosition)).trim().length === 0) {
        header += eol;
    }

    if (footerPosition.line === headerGuardPosition.line) {
        footer = eol + footer;
    }

    workspaceEdit.insert(headerDoc.uri, headerGuardPosition, header);
    workspaceEdit.insert(headerDoc.uri, footerPosition, footer);

    return vscode.workspace.applyEdit(workspaceEdit);
}

function getDeletionRange(directive: SubSymbol): vscode.Range {
    let deletionRange = directive.document.lineAt(directive.range.start).rangeIncludingLineBreak;
    if (directive.range.start.line > 0
            && directive.document.lineAt(directive.range.start.line - 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(
                directive.document.lineAt(directive.range.start.line - 1).rangeIncludingLineBreak);
    }
    if (directive.range.end.line < directive.document.lineCount - 1
            && directive.document.lineAt(directive.range.end.line + 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(
                directive.document.lineAt(directive.range.end.line + 1).rangeIncludingLineBreak);
    }
    return deletionRange;
}
