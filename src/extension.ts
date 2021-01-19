import * as vscode from 'vscode';
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
