import * as vscode from 'vscode';

/**
 * Represents a sub-symbol within a CSymbol, such as a data type or a keyword. Not provided by the language server.
 */
export class SubSymbol {
    readonly document: vscode.TextDocument;
    name: string;
    range: vscode.Range;

    constructor(range: vscode.Range, document: vscode.TextDocument) {
        this.document = document;
        this.name = document.getText(range);
        this.range = range;
    }
}
