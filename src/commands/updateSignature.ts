import * as vscode from 'vscode';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';
import FunctionSignature from '../FunctionSignature';
import { logger } from '../extension';


export async function updateSignature(
    functionSymbol: CSymbol,
    sourceDoc: SourceDocument,
    linkedLocation: vscode.Location
): Promise<boolean | undefined> {
    const linkedDoc = linkedLocation.uri.fsPath === sourceDoc.uri.fsPath
            ? sourceDoc
            : await SourceDocument.open(linkedLocation.uri);
    const linkedSymbol = await linkedDoc.getSymbol(linkedLocation.range.start);

    if (functionSymbol.isFunctionDeclaration()) {
        if (!linkedSymbol?.isFunctionDefinition() || linkedSymbol.name !== functionSymbol.name) {
            logger.alertError('The linked definition could not be found.');
            return;
        }

        const currentSignature = new FunctionSignature(functionSymbol);
        const linkedSignature = new FunctionSignature(linkedSymbol);
    } else {
        if (!linkedSymbol?.isFunctionDeclaration() || linkedSymbol.name !== functionSymbol.name) {
            logger.alertError('The linked declaration could not be found.');
            return;
        }

        const currentSignature = new FunctionSignature(functionSymbol);
        const linkedSignature = new FunctionSignature(linkedSymbol);
    }
}
