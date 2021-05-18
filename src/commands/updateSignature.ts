import * as vscode from 'vscode';
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

    updateReturnType(currentSignature, linkedSignature, linkedDoc.uri, workspaceEdit);

    return vscode.workspace.applyEdit(workspaceEdit);
}

function updateReturnType(
    currentSignature: FunctionSignature,
    linkedSignature: FunctionSignature,
    linkedUri: vscode.Uri,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    if (currentSignature.normalizedReturnType !== linkedSignature.normalizedReturnType) {
        const returnType = !linkedSignature.hasTrailingReturnType && /[\w\d_]$/.test(linkedSignature.returnType)
                ? linkedSignature.returnType + ' '
                : linkedSignature.returnType;
        workspaceEdit.replace(linkedUri, linkedSignature.returnTypeRange!, returnType);
    }
}

