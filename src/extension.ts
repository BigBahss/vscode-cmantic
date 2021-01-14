import * as vscode from 'vscode';
import { switchHeaderSourceInWorkspace } from './switchHeaderSource';
import { addDefinition, addDefinitionInSourceFile, addDefinitionInCurrentFile } from './addDefinition';
import { createMatchingSourceFile } from './createSourceFile';
import { addInclude } from './addInclude';
import { CodeActionProvider } from './codeActions';


export function activate(context: vscode.ExtensionContext)
{
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addInclude", addInclude));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.switchHeaderSourceInWorkspace", switchHeaderSourceInWorkspace));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinition", addDefinition));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInSourceFile", addDefinitionInSourceFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.addDefinitionInCurrentFile", addDefinitionInCurrentFile));
    context.subscriptions.push(vscode.commands.registerCommand("cmantic.createMatchingSourceFile", createMatchingSourceFile));

    vscode.languages.registerCodeActionsProvider([{ language: 'c' }, { language: 'cpp' }], new CodeActionProvider());
}


export function deactivate() { }
