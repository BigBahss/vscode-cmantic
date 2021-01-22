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

// TODO: Use vscode.workspace.asRelativePath()
export function workspaceRelativePath(absolutePath: string, includeWorkspaceName: boolean = false): string
{
    if (!vscode.workspace.workspaceFolders) {
        return absolutePath;
    }
    for (const folder of vscode.workspace.workspaceFolders) {
        if (absolutePath.indexOf(folder.uri.path) !== 0) {
            continue;
        }

        if (includeWorkspaceName) {
            absolutePath = absolutePath.replace(directory(folder.uri.path), '').substring(1);
        } else {
            absolutePath = absolutePath.replace(folder.uri.path, '').substring(1);
        }
    }
    return absolutePath;
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

export function firstCharToUpper(str: string): string
{
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function insertSnippetAndReveal(
    text: string,
    position: ProposedPosition,
    document: vscode.TextDocument
): Promise<void> {
    const eol = endOfLine(document);
    const newLines = position.nextTo ? eol : eol + eol;
    if (position.after) {
        text = newLines + text;
    } else if (position.before) {
        text += newLines;
    }
    if (document.lineCount - 1 === position.value.line) {
        text += eol;
    }

    const editor = await vscode.window.showTextDocument(document.uri);
    const revealPosition = position.value.translate(lineCount(text) - 1);
    editor.revealRange(new vscode.Range(revealPosition, revealPosition), vscode.TextEditorRevealType.InCenter);

    const snippet = new vscode.SnippetString(text);
    const success = await editor.insertSnippet(snippet, position.value, { undoStopBefore: true, undoStopAfter: false });
    if (success) {
        /* When inserting an indented snippet that contains empty lines, the empty lines will be
         * indented, thus leaving trailing whitespace. So we need to clean up that whitespace. */
        await editor.edit(editBuilder => {
            const snippetLines = text.split(eol);
            for (let i = 0; i < snippetLines.length; ++i) {
                // Don't trim whitespace from the line that contains the new cursor position.
                if (snippetLines[i].endsWith('$0')) {
                    continue;
                }
                const documentLine = document.lineAt(i + position.value.line);
                if (documentLine.isEmptyOrWhitespace) {
                    editBuilder.delete(documentLine.range);
                }
            }
        }, { undoStopBefore: false, undoStopAfter: true });
    }
}
