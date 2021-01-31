import { Position, TextDocument } from 'vscode';
import { endOfLine } from './utility';


export interface ProposedPosition {
    value: Position;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
}

export function formatTextToInsert(definition: string, position: ProposedPosition, document: TextDocument ): string
{
    // Indent text to match the relative position.
    const line = document.lineAt(position.value);
    definition = definition.replace(/^/gm, line.text.substring(0, line.firstNonWhitespaceCharacterIndex));

    const eol = endOfLine(document);
    const newLines = position.nextTo ? eol : eol + eol;
    if (position.after) {
        definition = newLines + definition;
    } else if (position.before) {
        definition += newLines;
    }
    if (position.value.line === document.lineCount - 1) {
        definition += eol;
    }

    return definition;
}
