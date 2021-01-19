import * as vscode from 'vscode';
import * as util from './utility';


export enum CurlyBraceFormat {
    SameLine,
    NewLineCtorDtor,
    NewLine
}

export enum HeaderGuardStyle {
    Define,
    PragmaOnce,
    Both
}

const defaultHeaderExtensions = ['h', 'hpp', 'hh', 'hxx'];
const defaultSourceExtensions = ['c', 'cpp', 'cc', 'cxx'];
const defaultCurlyBraceFormat = CurlyBraceFormat.NewLine;
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

export function curlyBraceFormat(languageId: string): CurlyBraceFormat
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('curlyBraceFormat.' + languageId);
    switch (format) {
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    case 'New line for constructors and destructors':
        return CurlyBraceFormat.NewLineCtorDtor;
    case 'New line':
        return CurlyBraceFormat.NewLine;
    default:
        return defaultCurlyBraceFormat;
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
