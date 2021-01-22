import * as vscode from 'vscode';
import * as util from './utility';


export enum CurlyBraceFormat {
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

const defaultHeaderExtensions = ['h', 'hpp', 'hh', 'hxx'];
const defaultSourceExtensions = ['c', 'cpp', 'cc', 'cxx'];
const defaultFunctionCurlyBraceFormat = CurlyBraceFormat.NewLine;
const defaultNamespaceCurlyBraceFormat = CurlyBraceFormat.SameLine;
const defaultNamespaceIndentation = NamespaceIndentation.Auto;
const defaultHeaderGuardStyle = HeaderGuardStyle.Define;
const defaultHeaderGuardDefineFormat = '${FILENAME_EXT}';


export function headerExtensions(): string[]
{
    const extensions = vscode.workspace.getConfiguration('C_mantic').get<string[]>('extensions.headerFiles');
    return extensions ? extensions : defaultHeaderExtensions;
}

export function sourceExtensions(): string[]
{
    const extensions = vscode.workspace.getConfiguration('C_mantic').get<string[]>('extensions.sourceFiles');
    return extensions ? extensions : defaultSourceExtensions;
}

export function functionCurlyBraceFormat(languageId: string): CurlyBraceFormat
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>(languageId + '.curlyBraceFormat.function');
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
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('cpp.curlyBraceFormat.namespace');
    switch (format) {
    case 'New line':
        return CurlyBraceFormat.NewLine;
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    default:
        return defaultNamespaceCurlyBraceFormat;
    }
}

export function indentNamespaceBody(): NamespaceIndentation
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('cpp.indentation.namespace');
    switch (format) {
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

export function headerGuardStyle(): HeaderGuardStyle
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('headerGuard.style');
    switch (format) {
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
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('headerGuard.defineFormat');
    return format ? format : defaultHeaderGuardDefineFormat;
}

const re_charactersNotAllowedInIdentifiers = /[^\w\d_]/g;

export function headerGuardDefine(fileName: string): string
{
    const FILENAME_EXT = fileName.replace(re_charactersNotAllowedInIdentifiers, '_').toUpperCase();
    const FILENAME = util.fileNameBase(fileName).replace(re_charactersNotAllowedInIdentifiers, '_').toUpperCase();
    return headerGuardDefineFormat().replace('${FILENAME_EXT}', FILENAME_EXT).replace('${FILENAME}', FILENAME);
}
