import * as vscode from 'vscode';
import * as path from 'path';
import * as xregexp from 'xregexp';
import { ProposedPosition } from './ProposedPosition';
import { CSymbol } from './CSymbol';

/**
 * Returns the file extension without the dot.
 */
export function fileExtension(fsPath: string): string
{
    const extension = path.extname(fsPath);
    if (extension.length > 0) {
        return extension.substring(1);
    }
    return extension;
}

/**
 * Strips the directory and extension from a file name.
 */
export function fileNameBase(fsPath: string): string
{
    return path.basename(fsPath, path.extname(fsPath));
}

/**
 * Returns the number of different directories between directoryPath_a and directoryPath_b.
 */
export function compareDirectoryPaths(directoryPath_a: string, directoryPath_b: string): number
{
    const a_segments = directoryPath_a.split(path.sep);
    const b_segments = directoryPath_b.split(path.sep);
    const minSegments = Math.min(a_segments.length, b_segments.length);

    let commonLeadingDirectories = 0;
    for (let i = 0; i < minSegments; ++i) {
        if (a_segments[i] !== b_segments[i]) {
            break;
        }
        ++commonLeadingDirectories;
    }

    let commonTrailingDirectories = 0;
    for (let i = 1; i < minSegments - commonLeadingDirectories - 1; ++i) {
        if (a_segments[a_segments.length - i] !== b_segments[b_segments.length - i]) {
            break;
        }
        ++commonTrailingDirectories;
    }

    return Math.max((a_segments.length - commonLeadingDirectories - commonTrailingDirectories),
                    (b_segments.length - commonLeadingDirectories - commonTrailingDirectories));
}

export function indentation(options?: vscode.TextEditorOptions): string
{
    if (!options) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            options = editor.options;
        }
    }

    if (options && options.insertSpaces) {
        return ' '.repeat(<number>(options.tabSize));
    }
    return '\t';
}

export function lineCount(text: string): number
{
    return (text.endsWith('\n')) ? text.split('\n').length - 1 : text.split('\n').length;
}

export function endOfLine(document: vscode.TextDocument): string
{
    switch (document.eol) {
    case vscode.EndOfLine.CRLF:
        return '\r\n';
    case vscode.EndOfLine.LF:
    default:
        return '\n';
    }
}

export function positionAfterLastNonEmptyLine(document: vscode.TextDocument): ProposedPosition
{
    for (let i = document.lineCount - 1; i >= 0; --i) {
        if (!document.lineAt(i).isEmptyOrWhitespace) {
            return new ProposedPosition(document.lineAt(i).range.end, { after: true });
        }
    }
    return new ProposedPosition();
}

/**
 * DocumentSymbol ranges don't always include the final semi-colon.
 */
export function getEndOfStatement(document: vscode.TextDocument, position: vscode.Position): vscode.Position
{
    let nextPosition = position.translate(0, 1);
    while (document.getText(new vscode.Range(position, nextPosition)) === ';') {
        position = nextPosition;
        nextPosition = position.translate(0, 1);
    }
    return position;
}

export function getIndentationRegExp(symbol: CSymbol): RegExp
{
    const line = symbol.document.lineAt(symbol.getRangeWithLeadingComment().start);
    const oldIndentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    return new RegExp('^' + oldIndentation, 'gm');
}

export function firstCharToUpper(str: string): string
{
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function is_snake_case(label: string): boolean
{
    return label.match(/[\w\d]_[\w\d]/) !== null;
}

export function masker(match: string): string { return ' '.repeat(match.length); }

/**
 * Performs a balanced mask of text between left and right, accounting for depth.
 */
export function maskBalanced(text: string, left: string, right: string, keepEnclosingChars: boolean = true)
{
    xregexp.matchRecursive(text, left, right, 'gm', {
        valueNames: ['outer', 'left', 'inner', 'right'],
        escapeChar: '\\'
    }).forEach(match => {
        if (match.name === 'inner') {
            if (keepEnclosingChars) {
                text = text.substring(0, match.start) + masker(match.value) + text.substring(match.end);
            } else {
                text = text.substring(0, match.start - left.length)
                        + masker(left.length + match.value + right.length)
                        + text.substring(match.end + right.length);
            }
        }
    });
    return text;
}

export function maskComments(text: string, keepEnclosingChars: boolean = true): string
{
    if (keepEnclosingChars) {
        text = text.replace(/(?<=\/\/).*/gm, masker);
        text = text.replace(/(?<=\/\*)(\*(?!\/)|[^*])*(?=\*\/)/gm, masker);
    } else {
        text = text.replace(/\/\/.*/gm, masker);
        text = text.replace(/\/\*(\*(?!\/)|[^*])*\*\//gm, masker);
    }
    return text;
}

export function maskQuotes(text: string, keepEnclosingChars: boolean = true): string
{
    if (keepEnclosingChars) {
        text = text.replace(/(?<=').*(?=')(?<!\\)/g, masker);
        text = text.replace(/(?<=").*(?=")(?<!\\)/g, masker);
    } else {
        text = text.replace(/'.*'(?<!\\)/g, masker);
        text = text.replace(/".*"(?<!\\)/g, masker);
    }
    return text;
}

export function maskParentheses(text: string, keepEnclosingChars: boolean = true): string
{
    return maskBalanced(text, '\\(', '\\)', keepEnclosingChars);
};

export function maskBraces(text: string, keepEnclosingChars: boolean = true): string
{
    return maskBalanced(text, '{', '}', keepEnclosingChars);
}

export function maskBrackets(text: string, keepEnclosingChars: boolean = true): string
{
    return maskBalanced(text, '\\[', '\\]', keepEnclosingChars);
}

export function maskAngleBrackets(text: string, keepEnclosingChars: boolean = true): string
{
    return maskBalanced(text, '\\<', '\\>', keepEnclosingChars);
}

export function maskComparisonOperators(text: string): string
{
    return text.replace(/[^\w\d_\s]=(?!=)/g, masker);
}
