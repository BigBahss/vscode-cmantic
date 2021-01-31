import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
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

const disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext)
{
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

    context.subscriptions.push(vscode.commands.registerCommand("cmantic.switchHeaderSourceInWorkspace", switchHeaderSourceInWorkspace));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.createMatchingSourceFile", createMatchingSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addInclude", addInclude));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addHeaderGuard", addHeaderGuard));

    vscode.languages.registerCodeActionsProvider(
        [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
        new CodeActionProvider(),
        { providedCodeActionKinds: [vscode.CodeActionKind.Refactor, vscode.CodeActionKind.Source] }
    );

    disposables.push(vscode.workspace.onDidDeleteFiles(onDidDeleteFiles));
    disposables.push(vscode.workspace.onDidRenameFiles(onDidRenameFiles));
}

export function deactivate()
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

// Stores header/source pairs after they have been requested.
const headerSourceCache = new Map<string, vscode.Uri>();

export function addHeaderSourcePairToCache(uri_a: vscode.Uri, uri_b: vscode.Uri): void
{
    headerSourceCache.set(uri_a.toString(), uri_b);
    headerSourceCache.set(uri_b.toString(), uri_a);
}

export function removeHeaderSourcePairFromCache(uri_a: vscode.Uri, uri_b?: vscode.Uri): void
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
    const extension = util.fileExtension(uri.path);
    const baseName = util.fileNameBase(uri.path);
    const directory = util.directory(uri.path);
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

        const diff = util.compareDirectoryPaths(util.directory(uri.path), directory);
        if (typeof smallestDiff === 'undefined' || diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = uri;
        }
    }

    return bestMatch;
}

function onDidDeleteFiles(event: vscode.FileDeleteEvent): void
{
    event.files.forEach(uri => removeHeaderSourcePairFromCache(uri));
}

function onDidRenameFiles(event: vscode.FileRenameEvent): void
{
    event.files.forEach(file => {
        const matchingUri = headerSourceCache.get(file.oldUri.toString());
        if (matchingUri) {
            removeHeaderSourcePairFromCache(file.oldUri, matchingUri);
            addHeaderSourcePairToCache(file.newUri, matchingUri);
        }
    });
}
