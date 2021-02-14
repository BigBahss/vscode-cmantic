import * as vscode from 'vscode';
import * as util from './utility';


export enum CurlyBraceFormat {
    Auto,
    SameLine,
    NewLineCtorDtor,
    NewLine
}

export enum NamespaceIndentation {
    Auto,
    Always,
    Never
}

export enum HeaderGuardStyle {
    Define,
    PragmaOnce,
    Both
}

export enum AccessorDefinitionLocation {
    Inline,
    BelowClass,
    SourceFile
}

const defaultHeaderExtensions = ['h', 'hpp', 'hh', 'hxx'];
const defaultSourceExtensions = ['c', 'cpp', 'cc', 'cxx'];
const defaultFunctionCurlyBraceFormat = CurlyBraceFormat.NewLine;
const defaultNamespaceCurlyBraceFormat = CurlyBraceFormat.SameLine;
const defaultNamespaceIndentation = NamespaceIndentation.Auto;
const defaultGenerateNamespaces = true;
const defaultHeaderGuardStyle = HeaderGuardStyle.Define;
const defaultHeaderGuardDefineFormat = '${FILE_NAME_EXT}';
const defaultAccessorDefinitionLocation = AccessorDefinitionLocation.Inline;
const defaultResolveTypes = false;
const defaultRevealNewDefinition = true;
const defaultAlwaysMoveComments = true;

function configuration(): vscode.WorkspaceConfiguration
{
    return vscode.workspace.getConfiguration('C_mantic');
}

export function headerExtensions(): string[]
{
    return configuration().get<string[]>('extensions.headerFiles', defaultHeaderExtensions);
}

export function sourceExtensions(): string[]
{
    return configuration().get<string[]>('extensions.sourceFiles', defaultSourceExtensions);
}

export function functionCurlyBraceFormat(languageId: string): CurlyBraceFormat
{
    const format = configuration().get<string>(languageId + '.curlyBraceFormat.function');
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

export function namespaceCurlyBraceFormat(): CurlyBraceFormat
{
    const format = configuration().get<string>('cpp.curlyBraceFormat.namespace');
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

export function indentNamespaceBody(): NamespaceIndentation
{
    const indent = configuration().get<string>('cpp.indentation.namespace');
    switch (indent) {
    case 'Auto':
        return NamespaceIndentation.Auto;
    case 'Always':
        return NamespaceIndentation.Always;
    case 'Never':
        return NamespaceIndentation.Never;
    default:
        return defaultNamespaceIndentation;
    }
}

export function shouldGenerateNamespaces(): boolean
{
    return configuration().get<boolean>('cpp.generateNamespaces', defaultGenerateNamespaces);
}

export function headerGuardStyle(): HeaderGuardStyle
{
    const style = configuration().get<string>('headerGuard.style');
    switch (style) {
    case 'Add both':
        return HeaderGuardStyle.Both;
    case 'Add #pragma once':
        return HeaderGuardStyle.PragmaOnce;
    case 'Add #define':
    default:
        return defaultHeaderGuardStyle;
    }
}

export function headerGuardDefineFormat(): string
{
    return configuration().get<string>('headerGuard.defineFormat', defaultHeaderGuardDefineFormat);
}

const re_charactersNotAllowedInIdentifiers = /[^\w\d_]/g;

export function headerGuardDefine(fileName: string): string
{
    const FILE_NAME_EXT = fileName.toUpperCase();
    const FILE_NAME = util.fileNameBase(fileName).toUpperCase();
    return headerGuardDefineFormat()
            .replace('${FILE_NAME_EXT}', FILE_NAME_EXT)
            .replace('${FILE_NAME}', FILE_NAME)
            .replace(re_charactersNotAllowedInIdentifiers, '_');
}

export function getterDefinitionLocation(): AccessorDefinitionLocation
{
    const location = configuration().get<string>('cpp.accessor.getterDefinitionLocation');
    switch (location) {
    case 'Generate definition inline':
        return AccessorDefinitionLocation.Inline;
    case 'Generate definition below class body':
        return AccessorDefinitionLocation.BelowClass;
    case 'Generate definition in matching source file':
        return AccessorDefinitionLocation.SourceFile;
    default:
        return defaultAccessorDefinitionLocation;
    }
}

export function setterDefinitionLocation(): AccessorDefinitionLocation
{
    const location = configuration().get<string>('cpp.accessor.setterDefinitionLocation');
    switch (location) {
    case 'Generate definition inline':
        return AccessorDefinitionLocation.Inline;
    case 'Generate definition below class body':
        return AccessorDefinitionLocation.BelowClass;
    case 'Generate definition in matching source file':
        return AccessorDefinitionLocation.SourceFile;
    default:
        return defaultAccessorDefinitionLocation;
    }
}

export function resolveTypes(): boolean
{
    return configuration().get<boolean>('cpp.resolveTypes', defaultResolveTypes);
}

export function revealNewDefinition(): boolean
{
    return configuration().get<boolean>('revealNewDefinition', defaultRevealNewDefinition);
}

export function alwaysMoveComments(): boolean
{
    return configuration().get<boolean>('alwaysMoveComments', defaultAlwaysMoveComments);
}
