import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as path from 'path';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';
import { getMatchingSourceFile } from './extension';
import { logger } from './logger';
import { CSymbol } from './CSymbol';


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noWorkspaceFolder: 'You must have a workspace folder open.',
    notHeaderFile: 'This file is not a header file.',
    sourceFileExists: 'A source file already exists for this header.'
};


export async function createMatchingSourceFile(): Promise<vscode.Uri | undefined> {
    const currentDocument = vscode.window.activeTextEditor?.document;
    if (!currentDocument) {
        logger.alertError(failure.noActiveTextEditor);
        return;
    }

    if (!vscode.workspace.workspaceFolders) {
        logger.alertWarning(failure.noWorkspaceFolder);
        return;
    }
    const workspaceFolder = (vscode.workspace.workspaceFolders.length > 1) ?
            await vscode.window.showWorkspaceFolderPick() : vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
        return;
    }

    const headerDoc = new SourceDocument(currentDocument);
    if (!headerDoc.isHeader()) {
        logger.alertWarning(failure.notHeaderFile);
        return;
    } else if (await getMatchingSourceFile(headerDoc.uri)) {
        logger.alertInformation(failure.sourceFileExists);
        return;
    }

    const headerFileNameBase = util.fileNameBase(headerDoc.fileName);
    const headerDirectory = path.dirname(headerDoc.fileName);

    const sourceFolders = await findSourceFolders(workspaceFolder.uri);
    sourceFolders.sort((a: FolderItem, b: FolderItem): number => {
        const diff_a = util.compareDirectoryPaths(a.uri.fsPath, headerDirectory);
        const diff_b = util.compareDirectoryPaths(b.uri.fsPath, headerDirectory);
        return (diff_a < diff_b) ? -1 : 1;
    });

    const folder = await vscode.window.showQuickPick(
            sourceFolders, { placeHolder: 'Select/Enter the name of the folder where the new source file will go' });
    if (!folder) {
        return;
    }

    let extension = await getSourceFileExtension(folder.uri);
    if (!extension) {
        extension = await vscode.window.showQuickPick(
                cfg.sourceExtensions(), { placeHolder: 'Select an extension for the new source file' });
        if (!extension) {
            return;
        }
    }

    const newFilePath = path.join(folder.uri.fsPath, headerFileNameBase + '.' + extension);
    const newFileUri = vscode.Uri.file(newFilePath);

    const includeStatement = `#include "${path.basename(headerDoc.uri.fsPath)}"${headerDoc.endOfLine}`;
    const namespacesText = (headerDoc.languageId === 'cpp') ? await getNamespaceText(headerDoc) : '';

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, { ignoreIfExists: true });
    workspaceEdit.insert(newFileUri, new vscode.Position(0, 0), includeStatement + namespacesText);
    await vscode.workspace.applyEdit(workspaceEdit);

    const editor = await vscode.window.showTextDocument(newFileUri);
    const cursorPosition = editor.document.lineAt(0).range.end;
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);

    return newFileUri;
}

interface FolderItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
}

// Returns an array of FolderItem's that contain C/C++ source files.
async function findSourceFolders(relativeUri: vscode.Uri): Promise<FolderItem[]> {
    const fileSystemItems = await vscode.workspace.fs.readDirectory(relativeUri);
    const directories: FolderItem[] = [];
    let foundSourceFile = false;
    for (const fileSystemItem of fileSystemItems) {
        if (fileSystemItem[1] === vscode.FileType.Directory) {
            directories.push(...await findSourceFolders(vscode.Uri.joinPath(relativeUri, fileSystemItem[0])));
        } else if (!foundSourceFile && fileSystemItem[1] === vscode.FileType.File
                && cfg.sourceExtensions().includes(util.fileExtension(fileSystemItem[0]))) {
            foundSourceFile = true;
            directories.push({
                label: `$(folder) ${vscode.workspace.asRelativePath(relativeUri, true)}`,
                uri: relativeUri
            });
        }
    }
    return directories;
}

// Reads a directory containing source files and returns the extension of those files.
// Returns undefined if more than one kind of source file extension is found.
async function getSourceFileExtension(uri: vscode.Uri): Promise<string | undefined> {
    const fileSystemItems = await vscode.workspace.fs.readDirectory(uri);
    const sourceExtensions = cfg.sourceExtensions();
    let sourceExtension: string | undefined;

    for (const fileSystemItem of fileSystemItems) {
        if (fileSystemItem[1] === vscode.FileType.File) {
            const extension = util.fileExtension(fileSystemItem[0]);
            if (sourceExtensions.includes(extension)) {
                if (sourceExtension !== undefined && sourceExtension !== extension) {
                    return;
                }
                sourceExtension = extension;
            }
        }
    }

    return sourceExtension;
}

async function getNamespaceText(headerDoc: SourceDocument) {
    if (headerDoc.languageId !== 'cpp' || !cfg.shouldGenerateNamespaces()) {
        return '';
    }

    const eol = headerDoc.endOfLine;
    const namespaces = await headerDoc.namespaces();
    const namespacesText = generateNamespaces(namespaces, eol);
    if (namespacesText.length === 0) {
        return '';
    }

    return eol + namespacesText + eol;
}

function generateNamespaces(namespaces: CSymbol[], eol: string): string {
    const indentation = util.indentation();
    const curlySeparator = getNamespaceCurlySeparator(namespaces, eol);

    return function generateNamespacesRecursive(namespaces: CSymbol[]): string {
        let namespaceText = '';
        for (const namespace of namespaces) {
            if (namespaceText) {
                namespaceText += eol + eol;
            }

            if (namespace.isNestedNamespace()) {
                namespaceText += '::' + (namespace.isInline() ? 'inline ' : '') + namespace.name;
            } else {
                namespaceText += (namespace.isInline() ? 'inline ' : '') + 'namespace ' + namespace.name;
            }

            const childNamespaces = namespace.childNamespaces();
            const body = generateNamespacesRecursive(childNamespaces);
            if (!body.startsWith('::')) {
                namespaceText += curlySeparator + '{' + eol;
                if (body) {
                    if (childNamespaces.length > 0
                            && childNamespaces[0].trueStart.character > namespace.trueStart.character) {
                        namespaceText += body.replace(/^/gm, indentation);
                    } else {
                        namespaceText += body;
                    }
                }
                namespaceText += eol + '} // namespace ' + namespace.name;
            } else {
                namespaceText += body;
            }
        }
        return namespaceText;
    } (namespaces).replace(/\s+$/gm, eol);
}

function getNamespaceCurlySeparator(namespaces: CSymbol[], eol: string): string {
    const curlyFormat = cfg.namespaceCurlyBraceFormat();
    if (curlyFormat === cfg.CurlyBraceFormat.Auto && namespaces.length > 0) {
        if (/^(\s*::\s*[\w_][\w\d_]*)*[ \t]*{/.test(namespaces[0].parsableTrailingText)) {
            return ' ';
        }
        return eol;
    } else if (curlyFormat === cfg.CurlyBraceFormat.NewLine) {
        return eol;
    }
    return ' ';
}
