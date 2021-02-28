import * as vscode from 'vscode';
import * as path from 'path';
import { ProposedPosition } from './ProposedPosition';
import { SourceSymbol } from './SourceSymbol';
import { SubSymbol } from './SubSymbol';

/**
 * Returns the file extension without the dot.
 */
export function fileExtension(fsPath: string): string {
    const extension = path.extname(fsPath);
    if (extension.length > 0) {
        return extension.substring(1);
    }
    return extension;
}

/**
 * Strips the directory and extension from a file name.
 */
export function fileNameBase(fsPath: string): string {
    return path.basename(fsPath, path.extname(fsPath));
}

/**
 * Returns the number of different directories between directoryPath_a and directoryPath_b.
 */
export function compareDirectoryPaths(directoryPath_a: string, directoryPath_b: string): number {
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

export function existsInWorkspace(locationOrUri: vscode.Location | vscode.Uri): boolean {
    if (locationOrUri instanceof vscode.Location) {
        return vscode.workspace.asRelativePath(locationOrUri.uri) !== locationOrUri.uri.fsPath;
    }
    return vscode.workspace.asRelativePath(locationOrUri) !== locationOrUri.fsPath;
}

export function indentation(options?: vscode.TextEditorOptions): string {
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

export function lineCount(text: string): number {
    return (text.endsWith('\n')) ? text.split('\n').length - 1 : text.split('\n').length;
}

export function endOfLine(document: vscode.TextDocument): string {
    switch (document.eol) {
    case vscode.EndOfLine.CRLF:
        return '\r\n';
    case vscode.EndOfLine.LF:
    default:
        return '\n';
    }
}

export function positionAfterLastNonEmptyLine(document: vscode.TextDocument): ProposedPosition {
    for (let i = document.lineCount - 1; i >= 0; --i) {
        if (!document.lineAt(i).isEmptyOrWhitespace) {
            return new ProposedPosition(document.lineAt(i).range.end, { after: true });
        }
    }
    return new ProposedPosition();
}

interface RangedObject {
    range: vscode.Range;
}

export function sortByRange(a: RangedObject, b: RangedObject): number {
    return a.range.end.isAfter(b.range.end) ? 1 : -1;
}

type AnySymbol = SourceSymbol | SubSymbol;

export async function findDefinition(symbol: AnySymbol): Promise<vscode.Location | undefined> {
    const definitionResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
            'vscode.executeDefinitionProvider', symbol.uri, symbol.selectionRange.start);
    return findMostLikelyResult(symbol, definitionResults);
}

export async function findDeclaration(symbol: AnySymbol): Promise<vscode.Location | undefined> {
    const declarationResults = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
            'vscode.executeDeclarationProvider', symbol.uri, symbol.selectionRange.start);
    return findMostLikelyResult(symbol, declarationResults);
}

function findMostLikelyResult(symbol: AnySymbol, results?: vscode.Location[] | vscode.LocationLink[]): vscode.Location | undefined {
    const thisFileNameBase = fileNameBase(symbol.uri.fsPath);
    for (const location of makeLocationArray(results)) {
        if (!existsInWorkspace(location)) {
            continue;
        }

        if (fileNameBase(location.uri.fsPath) === thisFileNameBase
                && !(location.uri.fsPath === symbol.uri.fsPath && symbol.range.contains(location.range))) {
            return location;
        }
    }
}

export function makeLocationArray(input?: vscode.Location[] | vscode.LocationLink[]): vscode.Location[] {
    if (!input) {
        return [];
    }

    const locations: vscode.Location[] = [];
    for (const element of input) {
        const location = (element instanceof vscode.Location)
                ? element
                : new vscode.Location(element.targetUri, element.targetRange);
        locations.push(location);
    }

    return locations;
}

/**
 * Test if range contains position, not including the start and end.
 */
export function containsExclusive(range: vscode.Range, position: vscode.Position): boolean {
    return !range.end.isBeforeOrEqual(position) && !range.start.isAfterOrEqual(position);
}

export function firstCharToUpper(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function firstCharToLower(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
}

export function make_snake_case(text: string): string {
    return text.replace(/(?<!^|_)[A-Z]/g, match => '_' + match).toLowerCase();
}

export function makeCamelCase(text: string): string {
    return firstCharToLower(text.replace(/_[a-z]/g, match => match.charAt(1).toUpperCase()).replace('_', ''));
}

export function MakePascalCase(text: string): string {
    return firstCharToUpper(text.replace(/_[a-z]/g, match => match.charAt(1).toUpperCase()).replace('_', ''));
}
