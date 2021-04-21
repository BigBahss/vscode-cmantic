import * as vscode from 'vscode';
import * as cfg from '../configuration';
import SourceDocument from '../SourceDocument';
import SubSymbol from '../SubSymbol';
import { ProposedPosition } from '../ProposedPosition';
import { logger } from '../extension';


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    notHeaderFile: 'This file is not a header file.',
    headerGuardMatches: 'Existing header guard already matches the configured style.'
};

export async function addHeaderGuard(headerDoc?: SourceDocument): Promise<boolean | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError(failure.noActiveTextEditor);
        return;
    }

    if (!headerDoc) {
        // Command was called from the command-palette
        headerDoc = new SourceDocument(editor.document);
        if (!headerDoc.isHeader()) {
            logger.alertWarning(failure.notHeaderFile);
            return;
        }
    }

    const workspaceEdit = new vscode.WorkspaceEdit();

    if (headerDoc.hasHeaderGuard) {
        if (headerGuardMatchesConfiguredStyle(headerDoc)) {
            logger.alertInformation(failure.headerGuardMatches);
            return;
        }
        for (const directive of headerDoc.headerGuardDirectives) {
            workspaceEdit.delete(headerDoc.uri, getDeletionRange(directive));
        }
    }

    const headerPosition = headerDoc.positionAfterHeaderComment();
    const footerPosition = headerDoc.lineAt(headerDoc.lineCount - 1).range.end;
    const headerGuard = generateHeaderGuard(headerDoc, headerPosition, footerPosition);

    workspaceEdit.insert(headerDoc.uri, headerPosition, headerGuard.header);
    workspaceEdit.insert(headerDoc.uri, footerPosition, headerGuard.footer);

    const prevSelection = editor.selection;
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    adjustEditorSelection(editor, prevSelection, headerPosition, headerGuard.header);

    return success;
}

export function headerGuardMatchesConfiguredStyle(headerDoc: SourceDocument): boolean {
    const headerGuardStyle = cfg.headerGuardStyle(headerDoc);

    if ((headerGuardStyle === cfg.HeaderGuardStyle.PragmaOnce || headerGuardStyle === cfg.HeaderGuardStyle.Both)
            && !headerDoc.hasPragmaOnce) {
        return false;
    }

    if (headerGuardStyle === cfg.HeaderGuardStyle.Define || headerGuardStyle === cfg.HeaderGuardStyle.Both
            && cfg.headerGuardDefine(headerDoc.uri) !== headerDoc.headerGuardDefine) {
        return false;
    }

    return true;
}

interface HeaderGuard {
    header: string;
    footer: string;
}

function generateHeaderGuard(
    headerDoc: SourceDocument, headerPosition: ProposedPosition, footerPosition: vscode.Position
): HeaderGuard {
    const eol = headerDoc.endOfLine;
    let header = '';
    let footer = '';

    const headerGuardStyle = cfg.headerGuardStyle(headerDoc);

    if (headerGuardStyle === cfg.HeaderGuardStyle.PragmaOnce || headerGuardStyle === cfg.HeaderGuardStyle.Both) {
        header = '#pragma once' + eol;
    }

    if (headerGuardStyle === cfg.HeaderGuardStyle.Define || headerGuardStyle === cfg.HeaderGuardStyle.Both) {
        const headerGuardDefine = cfg.headerGuardDefine(headerDoc.uri);
        header += '#ifndef ' + headerGuardDefine + eol + '#define ' + headerGuardDefine + eol;
        footer = eol + '#endif // ' + headerGuardDefine + eol;
    }

    if (headerPosition.options.after) {
        header = eol + eol + header;
    } else if (headerPosition.options.before) {
        header += eol;
    }

    if (headerDoc.getText(new vscode.Range(headerPosition, footerPosition)).trim().length === 0) {
        header += eol;
    }

    if (footerPosition.line === headerPosition.line || !headerDoc.lineAt(footerPosition).isEmptyOrWhitespace) {
        footer = eol + footer;
    }

    return { header: header, footer: footer };
}

function adjustEditorSelection(
    editor: vscode.TextEditor, prevSelection: vscode.Selection, headerPosition: ProposedPosition, header: string
): void {
    if (editor.selection.end.line !== editor.document.lineCount - 1) {
        return;
    }

    if (headerPosition.options.after) {
        editor.selection = prevSelection;
    } else {
        const cursorEndPos = prevSelection.end.translate(header.split('\n').length - 1);
        if (editor.selection.isEmpty) {
            editor.selection = new vscode.Selection(cursorEndPos, cursorEndPos);
        } else if (editor.selection.isReversed) {
            editor.selection = new vscode.Selection(cursorEndPos, editor.selection.start);
        } else {
            editor.selection = new vscode.Selection(editor.selection.start, cursorEndPos);
        }
    }
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
