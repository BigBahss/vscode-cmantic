import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as path from 'path';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';
import { getMatchingSourceFile, logger } from './extension';
import { CSymbol } from './CSymbol';


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noWorkspaceFolder: 'You must have a workspace folder open.',
    notHeaderFile: 'This file is not a header file.',
    sourceFileExists: 'A source file already exists for this header.'
};


export async function createMatchingSourceFile(): Promise<vscode.Uri | undefined>
{
    const currentDocument = vscode.window.activeTextEditor?.document;
    if (!currentDocument) {
        logger.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    if (!vscode.workspace.workspaceFolders) {
        logger.showErrorMessage(failure.noWorkspaceFolder);
        return;
    }
    const workspaceFolder = (vscode.workspace.workspaceFolders.length > 1) ?
            await vscode.window.showWorkspaceFolderPick() : vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
        return;
    }

    const headerDoc = new SourceDocument(currentDocument);
    if (!headerDoc.isHeader()) {
        logger.showErrorMessage(failure.notHeaderFile);
        return;
    } else if (await getMatchingSourceFile(headerDoc.uri)) {
        logger.showInformationMessage(failure.sourceFileExists);
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
            sourceFolders,
            { placeHolder: 'Select/Enter the name of the folder where the new source file will go' });
    if (!folder) {
        return;
    }

    let extension = await getSourceFileExtension(folder.uri);
    if (!extension) {
        extension = await vscode.window.showQuickPick(
                cfg.sourceExtensions(),
                { placeHolder: 'Select an extension for the new source file' });
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
async function findSourceFolders(relativeUri: vscode.Uri): Promise<FolderItem[]>
{
    const fileSystemItems = await vscode.workspace.fs.readDirectory(relativeUri);
    let directories: FolderItem[] = [];
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
async function getSourceFileExtension(uri: vscode.Uri): Promise<string | undefined>
{
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

async function getNamespaceText(headerDoc: SourceDocument)
{
    if (headerDoc.languageId !== 'cpp' || !cfg.shouldGenerateNamespaces()) {
        return '';
    }

    const eol = headerDoc.endOfLine;
    const namespaces = await headerDoc.namespaces();
    const curlySeparator = getNamespaceCurlySeparator(namespaces, headerDoc);
    const indentation = await getNamespaceIndentation(headerDoc);
    const namespacesText = generateNamespaces(namespaces, eol, curlySeparator, indentation);
    if (namespacesText.length === 0) {
        return '';
    }

    return eol + namespacesText + eol;
}

function getNamespaceCurlySeparator(namespaces: SourceSymbol[], headerDoc: SourceDocument): string
{
    const curlyFormat = cfg.namespaceCurlyBraceFormat();
    if (curlyFormat === cfg.CurlyBraceFormat.Auto && namespaces.length > 0) {
        const namespace = new CSymbol(namespaces[0], headerDoc);
        const namespaceText = util.maskComments(namespace.text());
        if (namespaceText.match(/^\s*namespace\s+[\w\d_]+[ \t]*{/)) {
            return ' ';
        }
        return headerDoc.endOfLine;
    } else if (curlyFormat === cfg.CurlyBraceFormat.NewLine) {
        return headerDoc.endOfLine;
    }
    return ' ';
}

async function getNamespaceIndentation(headerDoc: SourceDocument): Promise<string>
{
    switch (cfg.indentNamespaceBody()) {
    case cfg.NamespaceIndentation.Always:
        return util.indentation();
    case cfg.NamespaceIndentation.Never:
        return '';
    case cfg.NamespaceIndentation.Auto:
        return (await headerDoc.isNamespaceBodyIndented()) ? util.indentation() : '';
    }
}

function generateNamespaces(
    namespaces: SourceSymbol[],
    eol: string,
    curlySeparator: string,
    indentation: string
): string {
    function generateNamespacesRecursive(namespaces: SourceSymbol[]): string {
        let namespaceText = '';
        for (const namespace of namespaces) {
            if (namespaceText) {
                namespaceText += eol + eol;
            }
            namespaceText += 'namespace ' + namespace.name + curlySeparator + '{' + eol;
            const body = generateNamespacesRecursive(namespace.children);
            if (body) {
                namespaceText += body.replace(/^/gm, indentation);
            }
            namespaceText += eol + '} // namespace ' + namespace.name;
        }
        return namespaceText;
    }

    return generateNamespacesRecursive(namespaces).replace(/\s+$/gm, eol);
}
