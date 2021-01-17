import * as vscode from 'vscode';
import { ProposedPosition } from './cmantics';


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
    const path1_segments = directoryPath_a.split('/').filter(segment => segment.length > 0);
    const path2_segments = directoryPath_b.split('/').filter(segment => segment.length > 0);
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

export function lines(text: string): number
{
    return text.split('\n').length;
}

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

export async function insertSnippetAndTrimWhitespace(
    text: string,
    position: ProposedPosition,
    document: vscode.TextDocument
): Promise<void> {
    const eol = endOfLine(document);
    if (position.after) {
        text = eol + eol + text;
    } else if (position.before) {
        text += eol + eol;
    } else if (document.lineCount - 1 === position.value.line) {
        text += eol;
    }

    const snippet = new vscode.SnippetString(text);
    const editor = await vscode.window.showTextDocument(document.uri);
    await editor.insertSnippet(snippet, position.value, { undoStopBefore: true, undoStopAfter: false });

    if (position.before || position.after) {
        /* When inserting a indented snippet that contains an empty line, the empty line with be indented,
         * thus leaving trailing whitespace. So we need to clean up that whitespace. */
        editor.edit(editBuilder => {
            const trailingWSPosition = position.value.translate(position.after ? 1 : lines(snippet.value));
            const l = document.lineAt(trailingWSPosition);
            if (l.isEmptyOrWhitespace) {
                editBuilder.delete(l.range);
            }
        }, { undoStopBefore: false, undoStopAfter: true });
    }

    const revealPosition = position.value.translate(position.after ? 3 : -3);
    editor.revealRange(new vscode.Range(revealPosition, revealPosition), vscode.TextEditorRevealType.InCenter);
}
