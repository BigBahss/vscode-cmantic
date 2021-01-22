import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceFile } from "./SourceFile";
import { SourceSymbol } from './SourceSymbol';


interface FolderItem extends vscode.QuickPickItem
{
    path: string;
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

    const currentSourceFile = new SourceFile(currentDocument.uri);
    if (!currentSourceFile.isHeader()) {
        vscode.window.showErrorMessage('This file is not a header file.');
        return;
    }

    const fileNameBase = util.fileNameBase(currentDocument.uri.path);

    const folder = await vscode.window.showQuickPick(
            await findSourceFolders(workspaceFolder.uri),
            { placeHolder: 'Select/Enter the name of the folder where the new source file will go' });
    if (!folder) {
        return;
    }

    const extension = await vscode.window.showQuickPick(
            cfg.sourceExtensions(),
            { placeHolder: 'Select an extension for the new source file' });
    if (!extension) {
        return;
    }

    const newFilePath = folder.path + '/' + fileNameBase + '.' + extension;
    const newFileUri = vscode.Uri.parse(newFilePath);
    const eol = util.endOfLine(currentDocument);
    const includeStatement = '#include "' + util.fileName(currentDocument.uri.path) + '"$0' + eol;

    const namespaces = await currentSourceFile.namespaces();
    const indentation = (await currentSourceFile.namespaceBodyIsIndented()) ? util.indentation() : '';
    const namespacesText = generateNamespaces(namespaces, eol, indentation);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, { ignoreIfExists: true });
    if (await vscode.workspace.applyEdit(workspaceEdit)) {
        util.insertSnippetAndReveal(includeStatement + eol + namespacesText, { value: new vscode.Position(0, 0) }, newFileUri);
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
                path: uri.path
            });
        }
    }
    return directories;
}

function generateNamespaces(namespaces: SourceSymbol[], eol: string, indentation: string): string
{
    let namespaceText: string = '';
    for (const namespace of namespaces) {
        if (namespaceText) {
            namespaceText += eol + eol;
        }
        namespaceText += 'namespace ' + namespace.name + ' {' + eol;
        const body = generateNamespaces(namespace.children, eol, indentation);
        if (body) {
            namespaceText += body.replace(/^/gm, indentation);
        }
        namespaceText += eol + '}';
    }
    return namespaceText;
}
