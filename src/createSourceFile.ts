import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceSymbol } from './SourceSymbol';
import { SourceDocument } from './SourceDocument';
import { addHeaderSourcePairToCache } from './extension';


interface FolderItem extends vscode.QuickPickItem
{
    uri: vscode.Uri;
}


export async function createMatchingSourceFile(): Promise<vscode.Uri | undefined>
{
    const currentDocument = vscode.window.activeTextEditor?.document;
    if (!currentDocument) {
        vscode.window.showErrorMessage('You must have a text editor open.');
        return;
    }

    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage('You must have a workspace folder open.');
        return;
    }
    const workspaceFolder = (vscode.workspace.workspaceFolders.length > 1) ?
            await vscode.window.showWorkspaceFolderPick() : vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
        return;
    }

    const currentSourceDoc = new SourceDocument(currentDocument);
    if (!currentSourceDoc.isHeader()) {
        vscode.window.showErrorMessage('This file is not a header file.');
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

    const newFilePath = folder.uri.path + '/' + headerFileNameBase + '.' + extension;
    const newFileUri = vscode.Uri.parse(newFilePath);
    const eol = util.endOfLine(currentDocument);
    const includeStatement = '#include "' + util.fileName(currentDocument.uri.path) + '"$0' + eol;

    const namespacesText = (currentDocument.languageId === 'cpp') ?
            await getNamespaceText(currentSourceDoc, eol) : '';

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, { ignoreIfExists: true });
    if (await vscode.workspace.applyEdit(workspaceEdit)) {
        util.insertSnippetAndReveal(
                includeStatement + namespacesText, { value: new vscode.Position(0, 0) }, newFileUri);
        addHeaderSourcePairToCache(currentSourceDoc.uri, newFileUri);
        return newFileUri;
    }
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
                label: '$(folder) ' + util.workspaceRelativePath(uri.path, true),
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
    const sourceExtensions = cfg.sourceExtensions();
    let sourceExtension: string | undefined;
    const fileSystemItems = await vscode.workspace.fs.readDirectory(uri);
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

async function getNamespaceText(sourceFile: SourceDocument, eol: string)
{
    if (sourceFile.document.languageId !== 'cpp' || !cfg.shouldGenerateNamespaces()) {
        return '';
    }

    const namespaces = await sourceFile.namespaces();
    const curlySeparator = (cfg.namespaceCurlyBraceFormat() === cfg.CurlyBraceFormat.NewLine) ? eol : ' ';
    const indentation = await getNamespaceIndentation(sourceFile);
    const namespacesText = generateNamespaces(namespaces, eol, curlySeparator, indentation);

    return eol + namespacesText;
}

async function getNamespaceIndentation(sourceFile: SourceDocument): Promise<string>
{
    switch (cfg.indentNamespaceBody()) {
    case cfg.NamespaceIndentation.Always:
        return util.indentation();
    case cfg.NamespaceIndentation.Never:
        return '';
    case cfg.NamespaceIndentation.Auto:
        return (await sourceFile.isNamespaceBodyIndented()) ? util.indentation() : '';
    }
}

function generateNamespaces(
    namespaces: SourceSymbol[],
    eol: string,
    curlySeparator: string,
    indentation: string
): string {
    let namespaceText: string = '';
    for (const namespace of namespaces) {
        if (namespaceText) {
            namespaceText += eol + eol;
        }
        namespaceText += 'namespace ' + namespace.name + curlySeparator + '{' + eol;
        const body = generateNamespaces(namespace.children, eol, curlySeparator, indentation);
        if (body) {
            namespaceText += body.replace(/^/gm, indentation);
        }
        namespaceText += eol + '} // namespace ' + namespace.name;
    }
    return namespaceText;
}
