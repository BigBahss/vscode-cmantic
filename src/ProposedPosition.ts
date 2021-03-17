import * as util from './utility';
import SourceDocument from './SourceDocument';
import { Position, Range, TextLine } from 'vscode';


export interface PositionOptions {
    relativeTo?: Range;
    before?: boolean;
    after?: boolean;
    nextTo?: boolean;       // Signals to not put a blank line between.
    emptyScope?: boolean;   // Signals that the position is in an empty scope and may need to be indented.
    inNamespace?: boolean;  // Used with emptyScope, since namespace indentation is controlled by user settings.
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

    formatTextToInsert(insertText: string, sourceDoc: SourceDocument): Promise<string> {
        return formatTextToInsert(insertText, this, sourceDoc);
    }
}

export class TargetLocation {
    position: ProposedPosition;
    sourceDoc: SourceDocument;

    constructor(position: ProposedPosition, sourceDoc: SourceDocument) {
        this.position = position;
        this.sourceDoc = sourceDoc;
    }

    formatTextToInsert(insertText: string): Promise<string> {
        return formatTextToInsert(insertText, this.position, this.sourceDoc);
    }
}

async function formatTextToInsert(
    insertText: string, position: ProposedPosition, sourceDoc: SourceDocument
): Promise<string> {
    if (position.options.emptyScope && (!position.options.inNamespace
            || (position.options.inNamespace && await util.shouldIndentNamespaceBody(sourceDoc)))) {
        insertText = insertText.replace(/^/gm, util.indentation());
    }

    // Indent text to match the relative position.
    const indentationLine = position.options.relativeTo
            ? sourceDoc.lineAt(position.options.relativeTo.start)
            : sourceDoc.lineAt(position);
    const indentation = indentationLine.text.substring(0, indentationLine.firstNonWhitespaceCharacterIndex);
    if (!position.options.before) {
        insertText = insertText.replace(/^/gm, indentation);
    } else {
        insertText = insertText.replace(/\n/gm, '\n' + indentation);
    }

    const accessSpecifierIndentation = util.indentation() + '(?=(public|protected|private))';
    insertText = insertText.replace(new RegExp(accessSpecifierIndentation, 'g'), '');

    const nextLine = function (): TextLine | undefined {
        if (position.options.after) {
            return sourceDoc.lineAt(position.line + 1);
        } else if (position.options.before) {
            return sourceDoc.lineAt(position.line - 1);
        }
    } ();

    const eol = util.endOfLine(sourceDoc);
    const newLines = (position.options.nextTo || !nextLine
                  || (!nextLine.isEmptyOrWhitespace && position.options.after && !/^\s*}/.test(nextLine.text))
                  || (!nextLine.isEmptyOrWhitespace && position.options.before && !/{\s*$/.test(nextLine.text)))
            ? eol
            : eol + eol;

    if (position.options.after) {
        insertText = newLines + insertText;
    } else if (position.options.before) {
        insertText += newLines;
    }

    if (position.line === sourceDoc.lineCount - 1) {
        insertText += eol;
    }

    if (position.options.before) {
        insertText += indentation;
    }

    return insertText;
}
