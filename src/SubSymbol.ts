import * as vscode from 'vscode';
import * as util from './utility';

/**
 * Represents a sub-symbol within a CSymbol, such as a data type or a keyword. Not provided by the language server.
 */
export class SubSymbol {
    readonly document: vscode.TextDocument;
    readonly uri: vscode.Uri;
    name: string;
    range: vscode.Range;
    selectionRange: vscode.Range;

    get location(): vscode.Location { return new vscode.Location(this.uri, this.range); }

    constructor(document: vscode.TextDocument, range: vscode.Range, selectionRange?: vscode.Range) {
        this.document = document;
        this.uri = document.uri;
        this.range = range;
        if (selectionRange) {
            this.selectionRange = selectionRange;
        } else {
            this.selectionRange = range;
        }
        this.name = document.getText(selectionRange);
    }

    /**
     * Finds the most likely definition of this SubSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely definition is this SubSymbol.
     */
    async findDefinition(): Promise<vscode.Location | undefined> {
        return util.findDefinition(this);
    }

    /**
     * Finds the most likely declaration of this SubSymbol and only returns a result with the same base file name.
     * Returns undefined if the most likely declaration is this SubSymbol.
     */
    async findDeclaration(): Promise<vscode.Location | undefined> {
        return util.findDeclaration(this);
    }
}
