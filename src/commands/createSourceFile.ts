import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from '../configuration';
import * as util from '../utility';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';
import { getMatchingHeaderSource, logger } from '../extension';
import { promptUserToSelectFunctions, generateDefinitionsWorkspaceEdit, revealNewFunction } from './addDefinition';
import { showSingleQuickPick } from '../QuickPick';


export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noWorkspaceFolder: 'You must have a workspace folder open.',
    notHeaderFile: 'This file is not a header file.',
    sourceFileExists: 'A source file already exists for this header.'
};

export async function createMatchingSourceFile(
    headerDoc?: SourceDocument, dontAddDefinitions?: boolean
): Promise<vscode.Uri | undefined> {
    if (!headerDoc) {
        // Command was called from the command-palette
        const currentDocument = vscode.window.activeTextEditor?.document;
        if (!currentDocument) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        headerDoc = new SourceDocument(currentDocument);
        if (!headerDoc.isHeader()) {
            logger.alertWarning(failure.notHeaderFile);
            return;
        } else if (await getMatchingHeaderSource(headerDoc.uri)) {
            logger.alertInformation(failure.sourceFileExists);
            return;
        }
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        logger.alertWarning(failure.noWorkspaceFolder);
        return;
    }

    const workspaceFolder = (vscode.workspace.workspaceFolders.length > 1) ?
            await vscode.window.showWorkspaceFolderPick() : vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
        return;
    }

    const functionDeclarations = await findEligibleFunctionDeclarations(headerDoc);
    const p_undefinedFunctions = !dontAddDefinitions && functionDeclarations.length > 0
            ? findUndefinedFunctions(functionDeclarations)
            : undefined;

    const headerFileNameBase = util.fileNameBase(headerDoc.fileName);
    const headerDirectory = path.dirname(headerDoc.fileName);

    const sourceFolders = await findSourceFolders(workspaceFolder.uri);
    sourceFolders.sort((a: FolderItem, b: FolderItem): number => {
        const diff_a = util.compareDirectoryPaths(a.uri.fsPath, headerDirectory);
        const diff_b = util.compareDirectoryPaths(b.uri.fsPath, headerDirectory);
        return (diff_a < diff_b) ? -1 : 1;
    });

    const folder = await showSingleQuickPick(
            sourceFolders, { title: 'Select/Enter the name of the folder where the new source file will go' });
    if (!folder) {
        return;
    }

    let extension = await getSourceFileExtension(folder.uri);
    if (!extension) {
        extension = (await showSingleQuickPick(
                cfg.sourceExtensions(folder.uri).map(ext => { return { label: ext }; }),
                { title: 'Select an extension for the new source file' }))?.label;
        if (!extension) {
            return;
        }
    }

    const newFilePath = path.join(folder.uri.fsPath, headerFileNameBase + '.' + extension);
    const newFileUri = vscode.Uri.file(newFilePath);

    const includeStatement = `#include "${path.basename(headerDoc.uri.fsPath)}"${headerDoc.endOfLine}`;
    const namespacesText = await getNamespaceText(headerDoc);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, { ignoreIfExists: true });
    workspaceEdit.insert(newFileUri, new vscode.Position(0, 0), includeStatement + namespacesText);
    await vscode.workspace.applyEdit(workspaceEdit);

    const editor = await vscode.window.showTextDocument(newFileUri);
    const cursorPosition = editor.document.lineAt(0).range.end;
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);

    if (p_undefinedFunctions) {
        await generateDefinitions(p_undefinedFunctions, headerDoc, new SourceDocument(editor.document));
    }

    return newFileUri;
}

interface FolderItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
}

/**
 * Returns an array of FolderItem's that contain C/C++ source files (not including header files).
 */
async function findSourceFolders(relativeUri: vscode.Uri): Promise<FolderItem[]> {
    const fileSystemItems = await vscode.workspace.fs.readDirectory(relativeUri);
    const sourceExtensions = cfg.sourceExtensions(relativeUri);
    const directories: FolderItem[] = [];
    let foundSourceFile = false;

    for (const fileSystemItem of fileSystemItems) {
        if (fileSystemItem[1] === vscode.FileType.Directory) {
            directories.push(...await findSourceFolders(vscode.Uri.joinPath(relativeUri, fileSystemItem[0])));
        } else if (!foundSourceFile && fileSystemItem[1] === vscode.FileType.File
                && sourceExtensions.includes(util.fileExtension(fileSystemItem[0]))) {
            foundSourceFile = true;
            directories.push({
                label: `$(folder) ${vscode.workspace.asRelativePath(relativeUri, true)}`,
                uri: relativeUri
            });
        }
    }

    return directories;
}

/**
 * Reads a directory containing source files and returns the extension of those files.
 * Returns undefined if more than one kind of source file extension is found.
 */
async function getSourceFileExtension(uri: vscode.Uri): Promise<string | undefined> {
    const fileSystemItems = await vscode.workspace.fs.readDirectory(uri);
    const sourceExtensions = cfg.sourceExtensions(uri);
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

async function getNamespaceText(headerDoc: SourceDocument): Promise<string> {
    if (headerDoc.languageId !== 'cpp' || !cfg.shouldGenerateNamespaces(headerDoc)) {
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

            if (namespace.isQualifiedNamespace()) {
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
    if (namespaces.length === 0) {
        return '';
    }

    const curlyFormat = cfg.namespaceCurlyBraceFormat(namespaces[0].uri);
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

async function findEligibleFunctionDeclarations(headerDoc: SourceDocument): Promise<CSymbol[]> {
    const functionDeclarations: CSymbol[] = [];
    (await headerDoc.allFunctions()).forEach(functionSymbol => {
        if (functionSymbol.isFunctionDeclaration() && !util.requiresVisibleDefinition(functionSymbol)) {
            functionDeclarations.push(functionSymbol);
        }
    });
    return functionDeclarations;
}

async function findUndefinedFunctions(functionDeclarations: CSymbol[]): Promise<CSymbol[]> {
    const p_declarationDefinitionLinks: Promise<util.DeclarationDefinitionLink>[] = [];
    functionDeclarations.forEach(declaration => {
        p_declarationDefinitionLinks.push(util.makeDeclDefLink(declaration));
    });

    const undefinedFunctions: CSymbol[] = [];
    (await Promise.all(p_declarationDefinitionLinks)).forEach(link => {
        if (!link.definition) {
            undefinedFunctions.push(link.declaration);
        }
    });

    return undefinedFunctions;
}

async function generateDefinitions(
    p_undefinedFunctions: Promise<CSymbol[]>, headerDoc: SourceDocument, sourceDoc: SourceDocument
): Promise<void> {
    const result = await showSingleQuickPick(
            [{ label: 'Yes' }, { label: 'No' }],
            { title: `Add Definitions from "${vscode.workspace.asRelativePath(headerDoc.uri)}"?` });
    if (result?.label !== 'Yes') {
        return;
    }

    const undefinedFunctions: CSymbol[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Finding undefined functions'
    }, async () => {
        undefinedFunctions.push(...await p_undefinedFunctions);
    });

    const selectedFunctions = await promptUserToSelectFunctions(undefinedFunctions);
    if (!selectedFunctions) {
        return;
    }

    const workspaceEdit = await generateDefinitionsWorkspaceEdit(selectedFunctions, headerDoc, sourceDoc);
    if (!workspaceEdit) {
        return;
    }

    const success = await vscode.workspace.applyEdit(workspaceEdit);

    if (success && cfg.revealNewDefinition(headerDoc)) {
        await revealNewFunction(workspaceEdit, sourceDoc);
    }
}
