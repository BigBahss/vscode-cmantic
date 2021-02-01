import * as vscode from 'vscode';
import { ProposedPosition } from "./ProposedPosition";


export function fileName(filePath: string): string
{
    const lastSeparator = filePath.lastIndexOf('/');
    return (lastSeparator !== -1) ? filePath.substring(lastSeparator + 1) : filePath;
}

export function fileExtension(filePath: string): string
{
    const name = fileName(filePath);
    const lastDot = name.lastIndexOf('.');
    return (lastDot !== -1) ? name.substring(lastDot + 1) : '';
}

// Strips the directory and extension from a file name.
export function fileNameBase(filePath: string): string
{
    const name = fileName(filePath);
    const lastDot = name.lastIndexOf('.');
    return (lastDot !== -1) ? name.substring(0, lastDot) : name;
}

export function directory(filePath: string): string
{
    const lastSeparator = filePath.lastIndexOf('/');
    return (lastSeparator !== -1) ? filePath.substring(0, lastSeparator) : '';
}

// Returns the amount of different directories between directoryPath_a and directoryPath_b.
export function compareDirectoryPaths(directoryPath_a: string, directoryPath_b: string): number
{
    const path1_segments = directoryPath_a.split('/');
    const path2_segments = directoryPath_b.split('/');
    const minSegments = Math.min(path1_segments.length, path2_segments.length);

    let commonLeadingDirectories = 0;
    for (let i = 0; i < minSegments; ++i) {
        if (path1_segments[i] !== path2_segments[i]) {
            break;
        }
        ++commonLeadingDirectories;
    }

    let commonTrailingDirectories = 0;
    for (let i = 1; i < minSegments - commonLeadingDirectories - 1; ++i) {
        if (path1_segments[path1_segments.length - i] !== path2_segments[path2_segments.length - i]) {
            break;
        }
        ++commonTrailingDirectories;
    }

    return Math.max((path1_segments.length - commonLeadingDirectories - commonTrailingDirectories),
                    (path2_segments.length - commonLeadingDirectories - commonTrailingDirectories));
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
            return { value: document.lineAt(i).range.end, after: true };
        }
    }
    return { value: new vscode.Position(0, 0) };
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
