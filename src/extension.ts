import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import Logger from './Logger';
import HeaderSourceCache from './HeaderSourceCache';
import {
    addDefinitionInSourceFile, addDefinitionInCurrentFile, addDefinitions, addDefinition
} from './commands/addDefinition';
import { addDeclaration } from './commands/addDeclaration';
import { moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass } from './commands/moveDefinition';
import {
    generateGetterSetter, generateGetter, generateSetter,
    generateGetterSetterFor, generateGetterFor, generateSetterFor
} from './commands/generateGetterSetter';
import {
    generateEqualityOperators, generateRelationalOperators, generateStreamOutputOperator
} from './commands/generateOperators';
import { createMatchingSourceFile } from './commands/createSourceFile';
import { addHeaderGuard } from './commands/addHeaderGuard';
import { addInclude } from './commands/addInclude';
import { switchHeaderSourceInWorkspace } from './commands/switchHeaderSource';
import { CodeActionProvider } from './CodeActionProvider';
import { cclsId, clangdId, cpptoolsId, LanguageServer } from './common';


export const cmanticId = 'tdennis4496.cmantic';

export const logger = new Logger('C-mantic');

const disposables: vscode.Disposable[] = [logger];
const codeActionProvider = new CodeActionProvider();
const headerSourceCache = new HeaderSourceCache();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    registerCommands(context);
    await cacheOpenDocuments();
    registerCodeActionProvider(context);
    registerEventListeners();
    pollExtensionsToSetLanguageServer();
    logActivation(context);
}

export function deactivate(): void {
    disposables.forEach(disposable => disposable.dispose());
}

export function getMatchingHeaderSource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    return headerSourceCache.get(uri);
}

export { LanguageServer };

let languageServer = LanguageServer.unknown;

export function activeLanguageServer(): LanguageServer {
    return languageServer;
}

export function setActiveLanguageServer(): void {
    if (vscode.extensions.getExtension(cpptoolsId)?.isActive && cfg.cpptoolsIntellisenseIsActive()) {
        languageServer = LanguageServer.cpptools;
        logger.logInfo(`Language server detected as ${cpptoolsId}.`);
    } else if (vscode.extensions.getExtension(clangdId)?.isActive) {
        languageServer = LanguageServer.clangd;
        logger.logInfo(`Language server detected as ${clangdId}.`);
    } else if (vscode.extensions.getExtension(cclsId)?.isActive) {
        languageServer = LanguageServer.ccls;
        logger.logInfo(`Language server detected as ${cclsId}.`);
    } else {
        languageServer = LanguageServer.unknown;
    }
}

export const commands = {
    'cmantic.addDefinitionInSourceFile': addDefinitionInSourceFile,
    'cmantic.addDefinitionInCurrentFile': addDefinitionInCurrentFile,
    'cmantic.addDefinitions': addDefinitions,
    'cmantic.addDefinition': addDefinition,
    'cmantic.addDeclaration': addDeclaration,
    'cmantic.moveDefinitionToMatchingSourceFile': moveDefinitionToMatchingSourceFile,
    'cmantic.moveDefinitionIntoOrOutOfClass': moveDefinitionIntoOrOutOfClass,
    'cmantic.generateGetterSetter': generateGetterSetter,
    'cmantic.generateGetter': generateGetter,
    'cmantic.generateSetter': generateSetter,
    'cmantic.generateGetterSetterFor': generateGetterSetterFor,
    'cmantic.generateGetterFor': generateGetterFor,
    'cmantic.generateSetterFor': generateSetterFor,
    'cmantic.generateEqualityOperators': generateEqualityOperators,
    'cmantic.generateRelationalOperators': generateRelationalOperators,
    'cmantic.generateStreamOutputOperator': generateStreamOutputOperator,
    'cmantic.createMatchingSourceFile': createMatchingSourceFile,
    'cmantic.addHeaderGuard': addHeaderGuard,
    'cmantic.addInclude': addInclude,
    'cmantic.switchHeaderSourceInWorkspace': switchHeaderSourceInWorkspace
};

function registerCommands(context: vscode.ExtensionContext): void {
    Object.entries(commands).forEach(([command, handler]) => {
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    });
}

async function cacheOpenDocuments(): Promise<void> {
    await Promise.all(vscode.workspace.textDocuments.map(document => onDidOpenTextDocument(document)));
}

function registerCodeActionProvider(context: vscode.ExtensionContext): void {
    const documentSelector: vscode.DocumentSelector = [
        { scheme: 'file', language: 'c' },
        { scheme: 'file', language: 'cpp' }
    ];

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            documentSelector,
            codeActionProvider,
            codeActionProvider.metadata
        )
    );
}

function registerEventListeners(): void {
    disposables.push(vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument));
    disposables.push(vscode.workspace.onDidCreateFiles(onDidCreateFiles));
    disposables.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration));
    disposables.push(vscode.extensions.onDidChange(setActiveLanguageServer));
}

function logActivation(context: vscode.ExtensionContext): void {
    logger.logInfo('C-mantic extension activated.');
    showMessageOnFeatureUpdate(context);
}

async function onDidOpenTextDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme === 'file' && (document.languageId === 'c' || document.languageId === 'cpp')) {
        return headerSourceCache.add(document.uri);
    }
}

async function onDidCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
    await Promise.all(
        event.files.map(uri => {
            const ext = util.fileExtension(uri.fsPath);
            if (uri.scheme === 'file'
                    && (cfg.sourceExtensions(uri).includes(ext) || cfg.headerExtensions(uri).includes(ext))) {
                return headerSourceCache.add(uri);
            }
        })
    );
}

function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(cfg.extensionKey)) {
        codeActionProvider.addDefinitionEnabled = cfg.enableAddDefinition();
        codeActionProvider.addDeclarationEnabled = cfg.enableAddDeclaration();
        codeActionProvider.moveDefinitionEnabled = cfg.enableMoveDefinition();
        codeActionProvider.generateGetterSetterEnabled = cfg.enableGenerateGetterSetter();
    }

    if (event.affectsConfiguration(cfg.cpptoolsKey)) {
        setActiveLanguageServer();
    }
}

function pollExtensionsToSetLanguageServer(): void {
    let i = 0;
    const timer = setInterval(() => {
        setActiveLanguageServer();
        if (languageServer !== LanguageServer.unknown || ++i > 30) {
            clearInterval(timer);
            if (i > 30) {
                logger.logWarn('No language server detected after 30 seconds.');
            }
        }
    }, 1000);
}

const re_semver = /^\d+\.\d+\.\d+$/;
const versionKey = 'version';
const updateMessage =
        'C-mantic v0.8.0: Added "Generate Relational Operators" and "Amend Header Guard" code-actions.';
const readmeButton = 'Open README';
const changelogButton = 'Open CHANGELOG';
const readmeUri = vscode.Uri.parse('https://github.com/BigBahss/vscode-cmantic/blob/master/README.md');
const changelogUri = vscode.Uri.parse('https://github.com/BigBahss/vscode-cmantic/blob/master/CHANGELOG.md');

async function showMessageOnFeatureUpdate(context: vscode.ExtensionContext): Promise<void> {
	const currentVersion = vscode.extensions.getExtension(cmanticId)?.packageJSON?.version;
    if (typeof currentVersion !== 'string' || !re_semver.test(currentVersion)) {
        return;
    }

    const previousVersion = context.globalState.get<string>(versionKey);
    context.globalState.update(versionKey, currentVersion);

    const currentMinor = currentVersion.split('.')[1];
    if (previousVersion !== undefined && re_semver.test(previousVersion)) {
        const previousMinor = previousVersion.split('.')[1];
        if (+previousMinor >= +currentMinor) {
            return;
        }
    }

    const selected = await vscode.window.showInformationMessage(updateMessage, readmeButton, changelogButton);
    if (selected === readmeButton) {
        vscode.env.openExternal(readmeUri);
    } else if (selected === changelogButton) {
        vscode.env.openExternal(changelogUri);
    }
}
