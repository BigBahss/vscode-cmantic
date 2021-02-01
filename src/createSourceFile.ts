import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';
import { addHeaderSourcePairToCache, getMatchingSourceFile } from './extension';


const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noWorkspaceFolder: 'You must have a workspace folder open.',
    notHeaderFile: 'This file is not a header file.',
    sourceFileExists: 'A source file already exists for this header.'
};


export async function createMatchingSourceFile(): Promise<vscode.Uri | undefined>
{
    const currentDocument = vscode.window.activeTextEditor?.document;
    if (!currentDocument) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage(failure.noWorkspaceFolder);
        return;
    }
    const workspaceFolder = (vscode.workspace.workspaceFolders.length > 1) ?
            await vscode.window.showWorkspaceFolderPick() : vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
        return;
    }

    const headerDoc = new SourceDocument(currentDocument);
    if (!headerDoc.isHeader()) {
        vscode.window.showErrorMessage(failure.notHeaderFile);
        return;
    } else if (getMatchingSourceFile(headerDoc.uri)) {
        vscode.window.showErrorMessage(failure.sourceFileExists);
        return;
    }

    const headerFileNameBase = util.fileNameBase(currentDocument.uri.path);
    const headerDirectory = util.directory(currentDocument.uri.path);

    const sourceFolders = await findSourceFolders(workspaceFolder.uri);
    sourceFolders.sort((a: FolderItem, b: FolderItem): number => {
        const diff_a = util.compareDirectoryPaths(a.uri.path, headerDirectory);
        const diff_b = util.compareDirectoryPaths(b.uri.path, headerDirectory);
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

    const newFilePath = `${folder.uri.path}/${headerFileNameBase}.${extension}`;
    const newFileUri = vscode.Uri.file(newFilePath);

    const eol = util.endOfLine(headerDoc.document);
    const includeStatement = `#include "${util.fileName(headerDoc.uri.path)}"${eol}`;
    const namespacesText = (headerDoc.languageId === 'cpp') ? await getNamespaceText(headerDoc, eol) : '';

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, { ignoreIfExists: true });
    workspaceEdit.insert(newFileUri, new vscode.Position(0, 0), includeStatement + namespacesText);
    await vscode.workspace.applyEdit(workspaceEdit);

    const editor = await vscode.window.showTextDocument(newFileUri);
    const cursorPosition = editor.document.lineAt(0).range.end;
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);

    addHeaderSourcePairToCache(headerDoc.uri, newFileUri);
    return newFileUri;
}

interface FolderItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
}

// Returns an array of FolderItem's that contain C/C++ source files.
async function findSourceFolders(uri: vscode.Uri): Promise<FolderItem[]>
{
    const fileSystemItems = await vscode.workspace.fs.readDirectory(uri);
    let directories: FolderItem[] = [];
    let foundSourceFile = false;
    for (const fileSystemItem of fileSystemItems) {
        if (fileSystemItem[1] === vscode.FileType.Directory) {
            directories.push(...await findSourceFolders(vscode.Uri.parse(uri.path + '/' + fileSystemItem[0])));
        } else if (!foundSourceFile && fileSystemItem[1] === vscode.FileType.File
                && cfg.sourceExtensions().includes(util.fileExtension(fileSystemItem[0]))) {
            foundSourceFile = true;
            directories.push({
                label: `$(folder) ${vscode.workspace.asRelativePath(uri, true)}`,
                uri: uri
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

async function getNamespaceText(headerDoc: SourceDocument, eol: string)
{
    if (headerDoc.languageId !== 'cpp' || !cfg.shouldGenerateNamespaces()) {
        return '';
    }

    const namespaces = await headerDoc.namespaces();
    const curlySeparator = (cfg.namespaceCurlyBraceFormat() === cfg.CurlyBraceFormat.NewLine) ? eol : ' ';
    const indentation = await getNamespaceIndentation(headerDoc);
    const namespacesText = generateNamespaces(namespaces, eol, curlySeparator, indentation);

    return eol + namespacesText + eol;
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
