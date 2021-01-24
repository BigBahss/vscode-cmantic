import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { addDefinition, addDefinitionInSourceFile, addDefinitionInCurrentFile } from './addDefinition';
import {
    generateGetterSetter, generateGetter, generateSetter,
    generateGetterSetterFor, generateGetterFor, generateSetterFor
} from './generateGetterSetter';
import { switchHeaderSourceInWorkspace } from './switchHeaderSource';
import { createMatchingSourceFile } from './createSourceFile';
import { addInclude } from './addInclude';
import { addHeaderGuard } from './addHeaderGuard';
import { CodeActionProvider } from './codeActions';


export function activate(context: vscode.ExtensionContext)
{
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInSourceFile", addDefinitionInSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInCurrentFile", addDefinitionInCurrentFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinition", addDefinition));

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
        new CodeActionProvider()
    );
}

export function deactivate() { }

// Stores header/source pairs after they have been requested.
const matchingUriCache = new Map<string, vscode.Uri>();

export async function getMatchingSourceFile(uri: vscode.Uri): Promise<vscode.Uri | undefined>
{
    const cachedMatchingUri = matchingUriCache.get(uri.toString());
    if (cachedMatchingUri) {
        if (await util.workspaceFileExists(cachedMatchingUri)) {
            return cachedMatchingUri;
        } else {
            // Cached header/source pair no longer exists, remove it from the cache.
            matchingUriCache.delete(uri.toString());
            matchingUriCache.delete(cachedMatchingUri.toString());
        }
    }

    const matchingUri = await findMatchingSourceFile(uri);
    if (!matchingUri) {
        return;
    }

    matchingUriCache.set(uri.toString(), matchingUri);
    matchingUriCache.set(matchingUri.toString(), uri);

    return matchingUri;
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
