import { Position, TextDocument } from 'vscode';
import { endOfLine } from './utility';


export interface ProposedPosition {
    value: Position;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
}

export function formatTextToInsert(insertText: string, position: ProposedPosition, document: TextDocument ): string
{
    // Indent text to match the relative position.
    const line = document.lineAt(position.value);
    const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    if (!position.before) {
        insertText = insertText.replace(/^/gm, indentation);
    } else {
        insertText = insertText.replace(/\n/gm, '\n' + indentation);
    }

    const eol = endOfLine(document);
    const newLines = position.nextTo ? eol : eol + eol;
    if (position.after) {
        insertText = newLines + insertText;
    } else if (position.before) {
        insertText += newLines;
    }

    if (position.value.line === document.lineCount - 1) {
        insertText += eol;
    }

    if (position.before) {
        insertText += indentation;
    }

    return insertText;
}
