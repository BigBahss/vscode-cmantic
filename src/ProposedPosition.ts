import { Position, Range, TextDocument, TextLine } from 'vscode';
import { SourceDocument } from './SourceDocument';
import { endOfLine } from './utility';


export interface PositionOptions {
    relativeTo?: Range;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
}

export class ProposedPosition extends Position {
    options: PositionOptions;

    constructor(position?: Position, options?: PositionOptions) {
        if (position) {
            super(position.line, position.character);
        } else {
            super(0, 0);
        }

        if (options) {
            this.options = options;
        } else {
            this.options = { };
        }
    }

    formatTextToInsert(insertText: string, document: TextDocument): string {
        return formatTextToInsert(insertText, this, document);
    }
}

export class TargetLocation {
    position: ProposedPosition;
    sourceDoc: SourceDocument;

    constructor(position: ProposedPosition, sourceDoc: SourceDocument) {
        this.position = position;
        this.sourceDoc = sourceDoc;
    }

    formatTextToInsert(insertText: string): string {
        return formatTextToInsert(insertText, this.position, this.sourceDoc);
    }
}

function formatTextToInsert(insertText: string, position: ProposedPosition, document: TextDocument): string {
    // Indent text to match the relative position.
    const indentationLine = position.options.relativeTo
            ? document.lineAt(position.options.relativeTo.start)
            : document.lineAt(position);
    const indentation = indentationLine.text.substring(0, indentationLine.firstNonWhitespaceCharacterIndex);
    if (!position.options.before) {
        insertText = insertText.replace(/^/gm, indentation);
    } else {
        insertText = insertText.replace(/\n/gm, '\n' + indentation);
    }

    const eol = endOfLine(document);
    const nextLine = function (): TextLine | undefined {
        if (position.options.after) {
            return document.lineAt(position.line + 1);
        } else if (position.options.before) {
            return document.lineAt(position.line - 1);
        }
    } ();
    const newLines = (position.options.nextTo || !nextLine?.isEmptyOrWhitespace)
            ? eol
            : eol + eol;
    if (position.options.after) {
        insertText = newLines + insertText;
    } else if (position.options.before) {
        insertText += newLines;
    }

    if (position.line === document.lineCount - 1) {
        insertText += eol;
    }

    if (position.options.before) {
        insertText += indentation;
    }

    return insertText;
}
