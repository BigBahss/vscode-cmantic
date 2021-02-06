import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import * as path from 'path';
import { addDefinition, addDefinitionInSourceFile, addDefinitionInCurrentFile } from './addDefinition';
import { moveDefinitionToMatchingSourceFile } from './moveDefinition';
import {
    generateGetterSetter, generateGetter, generateSetter,
    generateGetterSetterFor, generateGetterFor, generateSetterFor
} from './generateGetterSetter';
import { switchHeaderSourceInWorkspace } from './switchHeaderSource';
import { createMatchingSourceFile } from './createSourceFile';
import { addInclude } from './addInclude';
import { addHeaderGuard } from './addHeaderGuard';
import { CodeActionProvider } from './codeActions';
import { Logger } from './logger';


const disposables: vscode.Disposable[] = [];
const headerSourceCache: Map<string, vscode.Uri> = new Map<string, vscode.Uri>();

export const logger: Logger = new Logger();

export function activate(context: vscode.ExtensionContext): void
{
    disposables.push(logger);

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInSourceFile", addDefinitionInSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInCurrentFile", addDefinitionInCurrentFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinition", addDefinition));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.moveDefinitionToMatchingSourceFile", moveDefinitionToMatchingSourceFile));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterSetter", generateGetterSetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetter", generateGetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateSetter", generateSetter));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterSetterFor", generateGetterSetterFor));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateGetterFor", generateGetterFor));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.generateSetterFor", generateSetterFor));

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.createMatchingSourceFile", createMatchingSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addHeaderGuard", addHeaderGuard));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addInclude", addInclude));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.switchHeaderSourceInWorkspace", switchHeaderSourceInWorkspace));

    vscode.languages.registerCodeActionsProvider(
            [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
            new CodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.Refactor, vscode.CodeActionKind.Source] });

    disposables.push(vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument));
    disposables.push(vscode.workspace.onDidCreateFiles(onDidCreateFiles));
    disposables.push(vscode.workspace.onDidDeleteFiles(onDidDeleteFiles));
    disposables.push(vscode.workspace.onDidRenameFiles(onDidRenameFiles));

    vscode.workspace.textDocuments.forEach(onDidOpenTextDocument);
}

export function deactivate(): void
{
    disposables.forEach(disposable => disposable.dispose());
}

export async function getMatchingSourceFile(uri: vscode.Uri): Promise<vscode.Uri | undefined>
{
    const cachedMatchingUri = headerSourceCache.get(uri.toString());
    if (cachedMatchingUri) {
        return cachedMatchingUri;
    }

    const matchingUri = await findMatchingSourceFile(uri);
    if (!matchingUri) {
        return;
    }

    addHeaderSourcePairToCache(uri, matchingUri);

    return matchingUri;
}

async function cacheMatchingSourceFile(uri: vscode.Uri): Promise<void>
{
    const matchingUri = await getMatchingSourceFile(uri);
    if (matchingUri) {
        addHeaderSourcePairToCache(uri, matchingUri);
    }
}

function addHeaderSourcePairToCache(uri_a: vscode.Uri, uri_b: vscode.Uri): void
{
    headerSourceCache.set(uri_a.toString(), uri_b);
    headerSourceCache.set(uri_b.toString(), uri_a);
}

function removeHeaderSourcePairFromCache(uri_a: vscode.Uri, uri_b?: vscode.Uri): void
{
    if (!uri_b) {
        uri_b = headerSourceCache.get(uri_a.toString());
    }

    headerSourceCache.delete(uri_a.toString());
    if (uri_b) {
        headerSourceCache.delete(uri_b.toString());
    }
}

async function findMatchingSourceFile(uri: vscode.Uri): Promise<vscode.Uri | undefined>
{
    const extension = util.fileExtension(uri.fsPath);
    const baseName = util.fileNameBase(uri.fsPath);
    const directory = path.dirname(uri.fsPath);
    const headerExtensions = cfg.headerExtensions();
    const sourceExtensions = cfg.sourceExtensions();

    let globPattern: string;
    if (headerExtensions.indexOf(extension) !== -1) {
        globPattern = `**/${baseName}.{${sourceExtensions.join(",")}}`;
    } else if (sourceExtensions.indexOf(extension) !== -1) {
        globPattern = `**/${baseName}.{${headerExtensions.join(",")}}`;
    } else {
        return;
    }

    const uris = await vscode.workspace.findFiles(globPattern);
    let bestMatch: vscode.Uri | undefined;
    let smallestDiff: number | undefined;

    for (const uri of uris) {
        if (uri.scheme !== 'file') {
            continue;
        }

        const diff = util.compareDirectoryPaths(path.dirname(uri.fsPath), directory);
        if (smallestDiff === undefined || diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = uri;
        }
    }

    return bestMatch;
}

async function onDidOpenTextDocument(document: vscode.TextDocument): Promise<void>
{
    if (document.uri.scheme === 'file' && (document.languageId === 'c' || document.languageId === 'cpp')) {
        cacheMatchingSourceFile(document.uri);
    }
}

async function onDidCreateFiles(event: vscode.FileCreateEvent): Promise<void>
{
    event.files.forEach(async (uri) => {
        const ext = util.fileExtension(uri.fsPath);
        if (uri.scheme === 'file' && (cfg.sourceExtensions().includes(ext) || cfg.headerExtensions().includes(ext))) {
            cacheMatchingSourceFile(uri);
        }
    });
}

function onDidDeleteFiles(event: vscode.FileDeleteEvent): void
{
    event.files.forEach(uri => removeHeaderSourcePairFromCache(uri));
}

function onDidRenameFiles(event: vscode.FileRenameEvent): void
{
    event.files.forEach(uri => {
        const matchingUri = headerSourceCache.get(uri.oldUri.toString());
        if (matchingUri) {
            removeHeaderSourcePairFromCache(uri.oldUri, matchingUri);
            addHeaderSourcePairToCache(uri.newUri, matchingUri);
        }
    });
}
