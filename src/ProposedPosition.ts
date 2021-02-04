import { Position, Range, TextDocument } from 'vscode';
import { endOfLine } from './utility';


export interface PositionOptions {
    relativeTo?: Range;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
}

export class ProposedPosition extends Position
{
    options: PositionOptions;

    constructor(position?: Position, options?: PositionOptions)
    {
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

    formatTextToInsert(insertText: string, document: TextDocument): string
    {
        // Indent text to match the relative position.
        const line = this.options.relativeTo ? document.lineAt(this.options.relativeTo.start) : document.lineAt(this);
        const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
        if (!this.options.before) {
            insertText = insertText.replace(/^/gm, indentation);
        } else {
            insertText = insertText.replace(/\n/gm, '\n' + indentation);
        }

        const eol = endOfLine(document);
        const newLines = this.options.nextTo ? eol : eol + eol;
        if (this.options.after) {
            insertText = newLines + insertText;
        } else if (this.options.before) {
            insertText += newLines;
        }

        if (this.line === document.lineCount - 1) {
            insertText += eol;
        }

        if (this.options.before) {
            insertText += indentation;
        }

        return insertText;
    }
}
