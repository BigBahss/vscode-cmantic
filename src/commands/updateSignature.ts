import * as vscode from 'vscode';
import * as parse from '../parsing';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';
import FunctionSignature from '../FunctionSignature';
import { logger } from '../extension';


export async function updateSignature(
    currentFunction: CSymbol,
    sourceDoc: SourceDocument,
    linkedLocation: vscode.Location
): Promise<boolean | undefined> {
    const linkedDoc = linkedLocation.uri.fsPath === sourceDoc.uri.fsPath
            ? sourceDoc
            : await SourceDocument.open(linkedLocation.uri);
    const linkedFunction = await linkedDoc.getSymbol(linkedLocation.range.start);

    if (currentFunction.isFunctionDeclaration()) {
        if (!linkedFunction?.isFunctionDefinition() || linkedFunction.name !== currentFunction.name) {
            logger.alertError('The linked definition could not be found.');
            return;
        }
    } else {
        if (!linkedFunction?.isFunctionDeclaration() || linkedFunction.name !== currentFunction.name) {
            logger.alertError('The linked declaration could not be found.');
            return;
        }
    }

    const currentSignature = new FunctionSignature(currentFunction);
    const linkedSignature = new FunctionSignature(linkedFunction);

    const workspaceEdit = new vscode.WorkspaceEdit();

    updateReturnType(currentSignature, linkedSignature, linkedDoc, workspaceEdit);
    updateSpecifiers(currentSignature, linkedSignature, linkedDoc, workspaceEdit);

    return vscode.workspace.applyEdit(workspaceEdit);
}

function updateReturnType(
    currentSignature: FunctionSignature,
    linkedSignature: FunctionSignature,
    linkedDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    if (currentSignature.normalizedReturnType !== linkedSignature.normalizedReturnType) {
        const nextCharEnd = linkedSignature.returnTypeRange.end.translate(0, 1);
        const nextChar = linkedDoc.getText(new vscode.Range(linkedSignature.returnTypeRange.end, nextCharEnd));
        const newReturnType = /[\w\d_]$/.test(currentSignature.returnType) && /^[\w\d_]$/.test(nextChar)
                ? currentSignature.returnType + ' '
                : currentSignature.returnType;
        workspaceEdit.replace(linkedDoc.uri, linkedSignature.returnTypeRange, newReturnType);
    }
}

function updateSpecifiers(
    currentSignature: FunctionSignature,
    linkedSignature: FunctionSignature,
    linkedDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    const declaration = parse.maskComments(linkedDoc.getText(linkedSignature.range), true);
    const startOffset = linkedDoc.offsetAt(linkedSignature.range.start);

    function removeLeadingSpecifier(re_specifier: RegExp): void {
        const match = declaration.match(re_specifier);
        if (match?.index !== undefined) {
            const range = linkedDoc.rangeAt(startOffset + match.index, startOffset + match.index + match[0].length);
            workspaceEdit.replace(linkedDoc.uri, range, '');
        }
    }

    if (currentSignature.isConstexpr && !linkedSignature.isConstexpr) {
        workspaceEdit.insert(linkedDoc.uri, linkedSignature.range.start, 'constexpr ');
    } else if (!currentSignature.isConstexpr && linkedSignature.isConstexpr) {
        removeLeadingSpecifier(/\bconstexpr\b[ \t]*/);
    }

    if (currentSignature.isConsteval && !linkedSignature.isConsteval) {
        workspaceEdit.insert(linkedDoc.uri, linkedSignature.range.start, 'consteval ');
    } else if (!currentSignature.isConsteval && linkedSignature.isConsteval) {
        removeLeadingSpecifier(/\bconsteval\b[ \t]*/);
    }
}
