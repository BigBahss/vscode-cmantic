import * as vscode from 'vscode';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';


export async function updateSignature(
    functionSymbol: CSymbol,
    sourceDoc: SourceDocument,
    linkedLocation: vscode.Location
): Promise<boolean | undefined> {
    return;
}
