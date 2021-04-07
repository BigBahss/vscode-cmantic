import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import * as parse from './parsing';
import SourceDocument from './SourceDocument';
import SourceSymbol from './SourceSymbol';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';
import { ProposedPosition } from './ProposedPosition';
import { activeLanguageServer, LanguageServer } from './extension';


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
 * Returns a coefficient of how similar the paths are to eachother.
 * Lower numbers mean more similar. Equivalent paths will return 0.
 */
export function compareDirectoryPaths(directoryPath_a: string, directoryPath_b: string): number {
    const a_segments = directoryPath_a.split(path.sep).filter(segment => segment.length > 0);
    const b_segments = directoryPath_b.split(path.sep).filter(segment => segment.length > 0);
    const minSegments = Math.min(a_segments.length, b_segments.length);

    let commonLeadingDirectories = 0;
    for (let i = 0; i < minSegments; ++i) {
        if (a_segments[i] !== b_segments[i]) {
            break;
        }
        ++commonLeadingDirectories;
    }

    let commonTrailingDirectories = 0;
    for (let i = 1; i < minSegments - commonLeadingDirectories; ++i) {
        if (a_segments[a_segments.length - i] !== b_segments[b_segments.length - i]) {
            break;
        }
        ++commonTrailingDirectories;
    }

    return Math.max((a_segments.length - commonLeadingDirectories - commonTrailingDirectories),
                    (b_segments.length - commonLeadingDirectories - commonTrailingDirectories));
}

export function arraysAreEqual<T>(array_a: T[], array_b: T[]): boolean {
    if (array_a.length !== array_b.length) {
        return false;
    }
    for (let i = 0; i < array_a.length; ++i) {
        if (array_a[i] !== array_b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Returns true if the arrays are equal, or if either array is a sub-array of
 * the other, starting from the beginning of the arrays.
 * For example, [1, 2, 3] and [1, 2] intersect while [1, 2, 3] and [2, 3] do not.
 */
export function arraysIntersect<T>(array_a: T[], array_b: T[]): boolean {
    const minLength = Math.min(array_a.length, array_b.length);
    for (let i = 0; i < minLength; ++i) {
        if (array_a[i] !== array_b[i]) {
            return false;
        }
    }
    return true;
}

export function arraysShareAnyElement<T>(array_a: T[], array_b: T[]): boolean {
    for (const element of array_a) {
        if (array_b.includes(element)) {
            return true;
        }
    }
    return false;
}

export async function uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
    } catch (e) {
        return false;
    }
    return true;
}

export function containedInWorkspace(locationOrUri: vscode.Location | vscode.Uri): boolean {
    if (locationOrUri instanceof vscode.Location) {
        return vscode.workspace.asRelativePath(locationOrUri.uri) !== locationOrUri.uri.fsPath;
    }
    return vscode.workspace.asRelativePath(locationOrUri) !== locationOrUri.fsPath;
}

export function revealRange(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.revealRange(editor.document.validateRange(range), vscode.TextEditorRevealType.InCenter);

    // revealRange() sometimes doesn't work for large files, this appears to be a bug in vscode.
    // Waiting a bit and re-executing seems to work around this issue. (BigBahss/vscode-cmantic#2)
    setTimeout(() => {
        if (editor && range) {
            for (const visibleRange of editor.visibleRanges) {
                if (visibleRange.contains(range)) {
                    return;
                }
            }
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    }, 500);
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

export function sortByRange(a: { range: vscode.Range }, b: { range: vscode.Range }): number {
    return a.range.end.isAfter(b.range.end) ? 1 : -1;
}

export type AnySymbol = SourceSymbol | CSymbol | SubSymbol;

export type LocationType = vscode.Location | vscode.LocationLink;

/**
 * Finds the most likely definition of symbol and only returns a result with the same base file name.
 * Returns undefined if the most likely definition found is the same symbol.
 */
export async function findDefinition(symbol: AnySymbol): Promise<vscode.Location | undefined> {
    const definitionResults = await vscode.commands.executeCommand<LocationType[]>(
            'vscode.executeDefinitionProvider', symbol.uri, symbol.selectionRange.start);
    return findMostLikelyResult(symbol, definitionResults);
}

/**
 * Finds the most likely declaration of symbol and only returns a result with the same base file name.
 * Returns undefined if the most likely declaration found is the same symbol.
 */
export async function findDeclaration(symbol: AnySymbol): Promise<vscode.Location | undefined> {
    const declarationResults = await vscode.commands.executeCommand<LocationType[]>(
            'vscode.executeDeclarationProvider', symbol.uri, symbol.selectionRange.start);
    return findMostLikelyResult(symbol, declarationResults);
}

function findMostLikelyResult(
    symbol: AnySymbol, locationResults?: LocationType[]
): vscode.Location | undefined {
    const thisFileNameBase = fileNameBase(symbol.uri.fsPath);
    for (const location of makeLocationArray(locationResults)) {
        if (!containedInWorkspace(location)) {
            continue;
        }

        if (fileNameBase(location.uri.fsPath) === thisFileNameBase
                && !(location.uri.fsPath === symbol.uri.fsPath && symbol.range.contains(location.range))) {
            return location;
        }
    }
}

export function makeLocationArray(locationResults?: LocationType[]): vscode.Location[] {
    if (!locationResults) {
        return [];
    }

    const locations: vscode.Location[] = [];
    for (const element of locationResults) {
        const location = (element instanceof vscode.Location)
                ? element
                : new vscode.Location(element.targetUri, element.targetRange);
        locations.push(location);
    }

    return locations;
}

export interface DeclarationDefinitionLink {
    declaration: CSymbol;
    definition?: vscode.Location;
}

export async function makeDeclDefLink(declaration: CSymbol): Promise<DeclarationDefinitionLink> {
    return {
        declaration: declaration,
        definition: await declaration.findDefinition()
    };
}

/**
 * Indicates that the function requires a definition that is visible to translation unit that declares it.
 */
export function requiresVisibleDefinition(functionDeclaration: CSymbol): boolean {
    return functionDeclaration.isInline()
        || functionDeclaration.isConstexpr()
        || functionDeclaration.isConsteval()
        || functionDeclaration.hasUnspecializedTemplate();
}

export function formatSignature(symbol: CSymbol): string {
    if (symbol.isVariable()) {
        const text = symbol.document.getText(new vscode.Range(symbol.range.start, symbol.declarationEnd()));
        return parse.removeAttributes(parse.removeComments(text)).replace(/\s+/g, ' ');
    } else if (activeLanguageServer() === LanguageServer.cpptools) {
        // cpptools does a good job of providing formatted signatures for DocumentSymbols.
        return symbol.signature;
    }

    if (symbol.isFunction()) {
        const text = symbol.document.getText(new vscode.Range(symbol.selectionRange.end, symbol.declarationEnd()));
        return symbol.templatedName(true) + parse.removeAttributes(parse.removeComments(text)).replace(/\s+/g, ' ');
    }

    return symbol.templatedName(true);
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

export function formatPathToDisplay(uri: vscode.Uri): string {
    const relativePath = vscode.workspace.asRelativePath(uri);
    // Arbitrary limit, as to not display a path that's running all the way across the screen.
    if (relativePath.length > 60) {
        return relativePath.slice(0, 28) + '....' + relativePath.slice(-28);
    }
    return relativePath;
}

export enum AccessLevel {
    public,
    protected,
    private
}

export function accessSpecifierString(access: AccessLevel): string {
    switch (access) {
    case AccessLevel.public:
        return 'public:';
    case AccessLevel.protected:
        return 'protected:';
    case AccessLevel.private:
        return 'private:';
    }
}

export function accessSpecifierRegexp(access: AccessLevel): RegExp {
    switch (access) {
    case AccessLevel.public:
        return /\bpublic\s*:/;
    case AccessLevel.protected:
        return /\bprotected\s*:/;
    case AccessLevel.private:
        return /\bprivate\s*:/;
    }
}

interface AccessQuickPickItem extends vscode.QuickPickItem {
    access: AccessLevel;
}

const accessItems: AccessQuickPickItem[] = [
    { label: 'public', access: AccessLevel.public },
    { label: 'protected', access: AccessLevel.protected },
    { label: 'private', access: AccessLevel.private }
];

export async function getMemberAccessFromUser(): Promise<AccessLevel | undefined> {
    const accessItem = await vscode.window.showQuickPick<AccessQuickPickItem>(accessItems, {
        placeHolder: 'Select member access level'
    });

    return accessItem?.access;
}
