import * as vscode from 'vscode';
import * as path from 'path';
import * as util from './utility';


export enum AlertLevel {
    Error,
    Warn,
    Info
}

export enum CurlyBraceFormat {
    Auto,
    SameLine,
    NewLineCtorDtor,
    NewLine
}

export enum HeaderGuardStyle {
    Define,
    PragmaOnce,
    Both
}

export enum DefinitionLocation {
    Inline,
    CurrentFile,
    SourceFile
}

export enum CaseStyle {
    snake_case,
    camelCase,
    PascalCase
}

const defaultAlertLevel = AlertLevel.Info;
const defaultHeaderExtensions = ['h', 'hpp', 'hh', 'hxx'];
const defaultSourceExtensions = ['c', 'cpp', 'cc', 'cxx'];
const defaultFunctionCurlyBraceFormat = CurlyBraceFormat.NewLine;
const defaultNamespaceCurlyBraceFormat = CurlyBraceFormat.Auto;
const defaultGenerateNamespaces = true;
const defaultHeaderGuardStyle = HeaderGuardStyle.Define;
const defaultHeaderGuardDefineFormat = '${FILE_NAME}_${EXT}';
const defaultBoolGetterIsPrefix = false;
const defaultAccessorDefinitionLocation = DefinitionLocation.Inline;
const defaultResolveTypes = false;
const defaultRevealNewDefinition = true;
const defaultAlwaysMoveComments = true;
const defaultEnableCodeAction = true;
const defaultCaseStyle = CaseStyle.camelCase;
const defaultBracedInitialization = false;
const defaultExplicitThisPointer = false;
const defaultFriendComparisonOperators = false;

export const extensionKey = 'C_mantic';
export const cpptoolsKey = 'C_Cpp';

function configuration(scope?: vscode.ConfigurationScope): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(extensionKey, scope);
}

export function alertLevel(): AlertLevel {
    const level = configuration().get<string>('alertLevel');
    switch (level) {
    case 'Information':
        return AlertLevel.Info;
    case 'Warning':
        return AlertLevel.Warn;
    case 'Error':
        return AlertLevel.Error;
    default:
        return defaultAlertLevel;
    }
}

export function enableAddDefinition(): boolean {
    return configuration().get<boolean>('codeActions.enableAddDefinition', defaultEnableCodeAction);
}

export function enableAddDeclaration(): boolean {
    return configuration().get<boolean>('codeActions.enableAddDeclaration', defaultEnableCodeAction);
}

export function enableMoveDefinition(): boolean {
    return configuration().get<boolean>('codeActions.enableMoveDefinition', defaultEnableCodeAction);
}

export function enableGenerateGetterSetter(): boolean {
    return configuration().get<boolean>('codeActions.enableGenerateGetterSetter', defaultEnableCodeAction);
}

export function headerExtensions(scope: vscode.ConfigurationScope): string[] {
    return configuration(scope).get<string[]>('extensions.headerFiles', defaultHeaderExtensions);
}

export function sourceExtensions(scope: vscode.ConfigurationScope): string[] {
    return configuration(scope).get<string[]>('extensions.sourceFiles', defaultSourceExtensions);
}

export function functionCurlyBraceFormat(languageId: string, scope: vscode.ConfigurationScope): CurlyBraceFormat {
    const format = configuration(scope).get<string>(languageId + '.curlyBraceFormat.function');
    switch (format) {
    case 'New line':
        return CurlyBraceFormat.NewLine;
    case 'New line for constructors and destructors':
        return CurlyBraceFormat.NewLineCtorDtor;
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    default:
        return defaultFunctionCurlyBraceFormat;
    }
}

export function namespaceCurlyBraceFormat(scope: vscode.ConfigurationScope): CurlyBraceFormat {
    const format = configuration(scope).get<string>('cpp.curlyBraceFormat.namespace');
    switch (format) {
    case 'Auto':
        return CurlyBraceFormat.Auto;
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    case 'New line':
        return CurlyBraceFormat.NewLine;
    default:
        return defaultNamespaceCurlyBraceFormat;
    }
}

export function shouldGenerateNamespaces(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.generateNamespaces', defaultGenerateNamespaces);
}

export function headerGuardStyle(scope: vscode.ConfigurationScope): HeaderGuardStyle {
    const style = configuration(scope).get<string>('headerGuard.style');
    switch (style) {
    case 'Add both':
        return HeaderGuardStyle.Both;
    case 'Add #pragma once':
        return HeaderGuardStyle.PragmaOnce;
    case 'Add #define':
        return HeaderGuardStyle.Define;
    default:
        return defaultHeaderGuardStyle;
    }
}

export function headerGuardDefineFormat(scope: vscode.ConfigurationScope): string {
    return configuration(scope).get<string>('headerGuard.defineFormat', defaultHeaderGuardDefineFormat);
}

const re_charactersNotAllowedInIdentifiers = /[^\w\d_]/g;

export function headerGuardDefine(uri: vscode.Uri): string {
    const FILE_NAME = util.fileNameBase(uri.fsPath).toUpperCase();
    const EXT = util.fileExtension(uri.fsPath).toUpperCase();
    const FILE_NAME_EXT = FILE_NAME + '_' + EXT;
    const DIR = path.basename(path.dirname(uri.fsPath)).toUpperCase();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const PROJECT_NAME = workspaceFolder ? workspaceFolder.name.toUpperCase() : '';
    const PROJECT_REL_PATH = vscode.workspace.asRelativePath(path.dirname(uri.fsPath), false).toUpperCase();

    return headerGuardDefineFormat(uri)
            .replace('${FILE_NAME}', FILE_NAME)
            .replace('${EXT}', EXT)
            .replace('${FILE_NAME_EXT}', FILE_NAME_EXT)
            .replace('${DIR}', DIR)
            .replace('${PROJECT_NAME}', PROJECT_NAME)
            .replace('${PROJECT_REL_PATH}', PROJECT_REL_PATH)
            .replace(re_charactersNotAllowedInIdentifiers, '_')
            .replace(/^(?=\d)/g, 'INC_');
}

export function boolGetterIsPrefix(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.accessor.boolGetterIsPrefix', defaultBoolGetterIsPrefix);
}

export function getterDefinitionLocation(scope: vscode.ConfigurationScope): DefinitionLocation {
    return stringToDefinitionLocation(configuration(scope).get<string>('cpp.accessor.getterDefinitionLocation'));
}

export function setterDefinitionLocation(scope: vscode.ConfigurationScope): DefinitionLocation {
    return stringToDefinitionLocation(configuration(scope).get<string>('cpp.accessor.setterDefinitionLocation'));
}

function stringToDefinitionLocation(location?: string): DefinitionLocation {
    switch (location) {
    case 'Generate definition inline':
        return DefinitionLocation.Inline;
    case 'Generate definition below class body':
        return DefinitionLocation.CurrentFile;
    case 'Generate definition in matching source file':
        return DefinitionLocation.SourceFile;
    default:
        return defaultAccessorDefinitionLocation;
    }
}

export function resolveTypes(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.resolveTypes', defaultResolveTypes);
}

export function revealNewDefinition(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('revealNewDefinition', defaultRevealNewDefinition);
}

export function alwaysMoveComments(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('alwaysMoveComments', defaultAlwaysMoveComments);
}

export function caseStyle(scope: vscode.ConfigurationScope): CaseStyle {
    const style = configuration(scope).get<string>('caseStyle');
    switch (style) {
    case 'snake_case':
        return CaseStyle.snake_case;
    case 'camelCase':
        return CaseStyle.camelCase;
    case 'PascalCase':
        return CaseStyle.PascalCase;
    default:
        return defaultCaseStyle;
    }
}

export function formatToCaseStyle(text: string, scope: vscode.ConfigurationScope): string {
    switch (caseStyle(scope)) {
    case CaseStyle.snake_case:
        return util.make_snake_case(text);
    case CaseStyle.camelCase:
        return util.makeCamelCase(text);
    case CaseStyle.PascalCase:
        return util.MakePascalCase(text);
    }
}

export function bracedInitialization(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.bracedInitialization', defaultBracedInitialization);
}

export function useExplicitThisPointer(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.useExplicitThisPointer', defaultExplicitThisPointer);
}

export function friendComparisonOperators(scope: vscode.ConfigurationScope): boolean {
    return configuration(scope).get<boolean>('cpp.friendComparisonOperators', defaultFriendComparisonOperators);
}

export function filesExclude(scope: vscode.ConfigurationScope): string[] {
    const exclude = vscode.workspace.getConfiguration('files.exclude', scope);
    const patterns: string[] = [];
    Object.entries(exclude).forEach(([key, value]) => {
        if (value === true) {
            patterns.push(key);
        }
    });
    return patterns;
}

export function searchExclude(scope: vscode.ConfigurationScope): string[] {
    const exclude = vscode.workspace.getConfiguration('search.exclude', scope);
    const patterns: string[] = filesExclude(scope);
    Object.entries(exclude).forEach(([key, value]) => {
        if (value === true && !patterns.some(pattern => pattern === key)) {
            patterns.push(key);
        }
    });
    return patterns;
}

export function searchExcludeGlobPattern(scope: vscode.ConfigurationScope): vscode.GlobPattern {
    return `{${searchExclude(scope).join(',')}}`;
}

export function cpptoolsIntellisenseIsActive(scope?: vscode.ConfigurationScope): boolean {
    return vscode.workspace.getConfiguration(cpptoolsKey, scope).get<string>('intelliSenseEngine') === 'Default';
}
