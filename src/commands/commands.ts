import * as vscode from 'vscode';
import {
    addDefinitionInSourceFile, addDefinitionInCurrentFile, addDefinitions, addDefinition
} from './addDefinition';
import { addDeclaration } from './addDeclaration';
import { updateSignature } from './updateSignature';
import { moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass } from './moveDefinition';
import {
    generateGetterSetter, generateGetter, generateSetter,
    generateGetterSetterFor, generateGetterFor, generateSetterFor
} from './generateGetterSetter';
import {
    generateEqualityOperators, generateRelationalOperators, generateStreamOutputOperator
} from './generateOperators';
import { implementFunctions } from './generateVirtualFunctions';
import { createMatchingSourceFile } from './createSourceFile';
import { addHeaderGuard } from './addHeaderGuard';
import { addInclude } from './addInclude';
import { switchHeaderSourceInWorkspace } from './switchHeaderSource';
import { openDocumentation } from './openDocumentation';


export type CmanticCommandId =
    | 'cmantic.addDefinitionInSourceFile'
    | 'cmantic.addDefinitionInCurrentFile'
    | 'cmantic.addDefinitions'
    | 'cmantic.addDefinition'
    | 'cmantic.addDeclaration'
    | 'cmantic.updateSignature'
    | 'cmantic.moveDefinitionToMatchingSourceFile'
    | 'cmantic.moveDefinitionIntoOrOutOfClass'
    | 'cmantic.generateGetterSetter'
    | 'cmantic.generateGetter'
    | 'cmantic.generateSetter'
    | 'cmantic.generateGetterSetterFor'
    | 'cmantic.generateGetterFor'
    | 'cmantic.generateSetterFor'
    | 'cmantic.generateEqualityOperators'
    | 'cmantic.generateRelationalOperators'
    | 'cmantic.generateStreamOutputOperator'
    | 'cmantic.implementFunctions'
    | 'cmantic.createMatchingSourceFile'
    | 'cmantic.addHeaderGuard'
    | 'cmantic.addInclude'
    | 'cmantic.switchHeaderSourceInWorkspace'
    | 'cmantic.openDocumentation';

export interface CmanticCommand extends vscode.Command {
    command: CmanticCommandId;
}

export type CommandHandlerMap = {
    [K in CmanticCommandId]: (...args: any[]) => any;
};

export const commandHandlers: CommandHandlerMap = {
    'cmantic.addDefinitionInSourceFile': addDefinitionInSourceFile,
    'cmantic.addDefinitionInCurrentFile': addDefinitionInCurrentFile,
    'cmantic.addDefinitions': addDefinitions,
    'cmantic.addDefinition': addDefinition,
    'cmantic.addDeclaration': addDeclaration,
    'cmantic.updateSignature': updateSignature,
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
    'cmantic.implementFunctions': implementFunctions,
    'cmantic.createMatchingSourceFile': createMatchingSourceFile,
    'cmantic.addHeaderGuard': addHeaderGuard,
    'cmantic.addInclude': addInclude,
    'cmantic.switchHeaderSourceInWorkspace': switchHeaderSourceInWorkspace,
    'cmantic.openDocumentation': openDocumentation
};
