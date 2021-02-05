import * as vscode from 'vscode';
import * as path from 'path';
import { ProposedPosition } from './ProposedPosition';


// Returns the file extension without the dot.
export function fileExtension(fsPath: string): string
{
    const extension = path.extname(fsPath);
    if (extension.length > 0) {
        return extension.substring(1);
    }
    return extension;
}

// Strips the directory and extension from a file name.
export function fileNameBase(fsPath: string): string
{
    return path.basename(fsPath, path.extname(fsPath));
}

// Returns the amount of different directories between directoryPath_a and directoryPath_b.
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

export function firstCharToUpper(str: string): string
{
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function is_snake_case(label: string): boolean
{
    return label.match(/[\w\d]_[\w\d]/) !== null;
}

function masker(match: string): string { return ' '.repeat(match.length); }

export function maskComments(sourceText: string, keepEnclosingChars: boolean = true): string
{
    if (keepEnclosingChars) {
        sourceText = sourceText.replace(/(?<=\/\*)(\*(?=\/)|[^*])*(?=\*\/)/g, masker);
        sourceText = sourceText.replace(/(?<=\/\/).*/g, masker);
    } else {
        sourceText = sourceText.replace(/\/\*(\*(?=\/)|[^*])*\*\//g, masker);
        sourceText = sourceText.replace(/\/\/.*/g, masker);
    }
    return sourceText;
}

export function maskStringLiterals(sourceText: string, keepEnclosingChars: boolean = true): string
{
    if (keepEnclosingChars) {
        sourceText = sourceText.replace(/(?<=").*(?=")(?<!\\)/g, masker);
        sourceText = sourceText.replace(/(?<=').*(?=')(?<!\\)/g, masker);
    } else {
        sourceText = sourceText.replace(/".*"(?<!\\)/g, masker);
        sourceText = sourceText.replace(/'.*'(?<!\\)/g, masker);
    }
    return sourceText;
}

export function maskTemplateParameters(sourceText: string, keepEnclosingChars: boolean = true): string
{
    if (keepEnclosingChars) {
        return sourceText.replace(/(?<=<)(>(?=>)|[^>])*(?=>)/g, masker);
    }
    return sourceText.replace(/<(>(?=>)|[^>])*>/g, masker);
}
