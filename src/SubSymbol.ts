import * as vscode from 'vscode';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';


/**
 * Represents a sub-symbol within a CSymbol or SourceDocument, such as a keyword, type, or preprocessor directive.
 * Not provided by the language server.
 */
export default class SubSymbol {
    readonly document: SourceDocument;
    readonly uri: vscode.Uri;
    name: string;
    range: vscode.Range;
    selectionRange: vscode.Range;

    get location(): vscode.Location { return new vscode.Location(this.uri, this.range); }

    constructor(documentOrCSymbol: SourceDocument | CSymbol, range: vscode.Range, selectionRange?: vscode.Range) {
        this.document = (documentOrCSymbol instanceof SourceDocument) ? documentOrCSymbol : documentOrCSymbol.document;
        this.uri = documentOrCSymbol.uri;
        this.range = range;
        this.selectionRange = selectionRange ? selectionRange : range;
        this.name = this.document.getText(this.selectionRange);
    }

    text(): string { return this.document.getText(this.range); }

    startOffset(): number { return this.document.offsetAt(this.range.start); }

    endOffset(): number { return this.document.offsetAt(this.range.end); }

    isBefore(offset: number): boolean { return this.endOffset() < offset; }

    isAfter(offset: number): boolean { return this.startOffset() > offset; }

    async findDefinition(): Promise<vscode.Location | undefined> {
        return util.findDefinition(this);
    }

    async findDeclaration(): Promise<vscode.Location | undefined> {
        return util.findDeclaration(this);
    }

    async findDefinitions(): Promise<vscode.Location[]> {
        return this.document.findDefinitions(this.selectionRange.start);
    }

    async findDeclarations(): Promise<vscode.Location[]> {
        return this.document.findDeclarations(this.selectionRange.start);
    }
}
