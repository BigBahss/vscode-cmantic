import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as path from 'path';
import * as fs from 'fs';
import { addDefinition, addDefinitionInSourceFile, addDefinitionInCurrentFile } from './addDefinition';
import { moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass } from './moveDefinition';
import {
    generateGetterSetter, generateGetter, generateSetter,
    generateGetterSetterFor, generateGetterFor, generateSetterFor
} from './generateGetterSetter';
import { generateEqualityOperators } from './generateEqualityOperators';
import { switchHeaderSourceInWorkspace } from './switchHeaderSource';
import { createMatchingSourceFile } from './createSourceFile';
import { addInclude } from './addInclude';
import { addHeaderGuard } from './addHeaderGuard';
import { CodeActionProvider } from './codeActions';
import { logger } from './logger';


const disposables: vscode.Disposable[] = [];
const headerSourceCache: Map<string, vscode.Uri> = new Map<string, vscode.Uri>();

export function activate(context: vscode.ExtensionContext): void {
    pushDisposable(logger);

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInSourceFile", addDefinitionInSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInCurrentFile", addDefinitionInCurrentFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinition", addDefinition));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.moveDefinitionToMatchingSourceFile", moveDefinitionToMatchingSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.moveDefinitionIntoOrOutOfClass", moveDefinitionIntoOrOutOfClass));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterSetter", generateGetterSetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetter", generateGetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateSetter", generateSetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterSetterFor", generateGetterSetterFor));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterFor", generateGetterFor));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateSetterFor", generateSetterFor));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateEqualityOperators", generateEqualityOperators));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.createMatchingSourceFile", createMatchingSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addHeaderGuard", addHeaderGuard));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addInclude", addInclude));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.switchHeaderSourceInWorkspace", switchHeaderSourceInWorkspace));

    vscode.languages.registerCodeActionsProvider(
            [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
            new CodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.Refactor, vscode.CodeActionKind.Source] });

    pushDisposable(vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument));
    pushDisposable(vscode.workspace.onDidCreateFiles(onDidCreateFiles));

    logger.logInfo('C-mantic extension activated.');

    vscode.workspace.textDocuments.forEach(onDidOpenTextDocument);
}

export function deactivate(): void {
    disposables.forEach(disposable => disposable.dispose());
}

export function pushDisposable(disposable: vscode.Disposable): void {
    disposables.push(disposable);
}

export async function getMatchingSourceFile(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const cachedMatchingUri = headerSourceCache.get(uri.toString());
    if (cachedMatchingUri) {
        if (fs.existsSync(cachedMatchingUri.fsPath)) {
            return cachedMatchingUri;
        } else {
            removeHeaderSourcePairFromCache(uri, cachedMatchingUri);
        }
    }

    const matchingUri = await findMatchingSourceFile(uri);
    if (!matchingUri) {
        return;
    }

    addHeaderSourcePairToCache(uri, matchingUri);

    return matchingUri;
}

async function cacheMatchingSourceFile(uri: vscode.Uri): Promise<void> {
    const matchingUri = await getMatchingSourceFile(uri);
    if (matchingUri) {
        addHeaderSourcePairToCache(uri, matchingUri);
    }
}

function addHeaderSourcePairToCache(uri_a: vscode.Uri, uri_b: vscode.Uri): void {
    headerSourceCache.set(uri_a.toString(), uri_b);
    headerSourceCache.set(uri_b.toString(), uri_a);
}

function removeHeaderSourcePairFromCache(uri_a: vscode.Uri, uri_b?: vscode.Uri): void {
    if (!uri_b) {
        uri_b = headerSourceCache.get(uri_a.toString());
    }

    headerSourceCache.delete(uri_a.toString());
    if (uri_b) {
        headerSourceCache.delete(uri_b.toString());
    }
}

async function findMatchingSourceFile(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return;
    }

    const extension = util.fileExtension(uri.fsPath);
    const baseName = util.fileNameBase(uri.fsPath);
    const directory = path.dirname(uri.fsPath);
    const parentDirectory = path.dirname(directory);
    const headerExtensions = cfg.headerExtensions();
    const sourceExtensions = cfg.sourceExtensions();

    let globPattern: string;
    if (headerExtensions.includes(extension)) {
        globPattern = `**/${baseName}.{${sourceExtensions.join(",")}}`;
    } else if (sourceExtensions.includes(extension)) {
        globPattern = `**/${baseName}.{${headerExtensions.join(",")}}`;
    } else {
        return;
    }

    const parentDirRelativePattern = new vscode.RelativePattern(parentDirectory, globPattern);
    const parentDirRelativeUris = await vscode.workspace.findFiles(parentDirRelativePattern);
    const bestParentDirRelativeMatch = findBestMatchingUri(directory, parentDirRelativeUris);
    if (bestParentDirRelativeMatch) {
        return bestParentDirRelativeMatch;
    }

    const workspaceRelativePattern = new vscode.RelativePattern(workspaceFolder, globPattern);
    const workspaceRelativeUris = await vscode.workspace.findFiles(workspaceRelativePattern, parentDirectory);
    return findBestMatchingUri(directory, workspaceRelativeUris);
}

function findBestMatchingUri(directoryToCompare: string, uris: vscode.Uri[]): vscode.Uri | undefined {
    let bestMatch: vscode.Uri | undefined;
    let smallestDiff: number | undefined;

    for (const uri of uris) {
        if (uri.scheme !== 'file') {
            continue;
        }

        const diff = util.compareDirectoryPaths(path.dirname(uri.fsPath), directoryToCompare);
        if (smallestDiff === undefined || diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = uri;
        }
    }

    return bestMatch;
}

async function onDidOpenTextDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme === 'file' && (document.languageId === 'c' || document.languageId === 'cpp')) {
        return cacheMatchingSourceFile(document.uri);
    }
}

async function onDidCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
    event.files.forEach(async (uri) => {
        const ext = util.fileExtension(uri.fsPath);
        if (uri.scheme === 'file' && (cfg.sourceExtensions().includes(ext) || cfg.headerExtensions().includes(ext))) {
            return cacheMatchingSourceFile(uri);
        }
    });
}
