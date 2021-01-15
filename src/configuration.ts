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
    const extensions = vscode.workspace.getConfiguration('C_mantic').get<string[]>('HeaderFileExtensions');
    return extensions ? extensions : defaultHeaderExtensions;
}

export function sourceExtensions(): string[]
{
    const extensions = vscode.workspace.getConfiguration('C_mantic').get<string[]>('SourceFileExtensions');
    return extensions ? extensions : defaultSourceExtensions;
}

export function curlyBraceFormat(): CurlyBraceFormat
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('CurlyBraceFormat');
    switch (format) {
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    case 'New line for constructors and destructors':
        return CurlyBraceFormat.NewLineCtorDtor;
    case 'New line':
    default:
        return defaultCurlyBraceFormat;
    }
}

export function headerGuardStyle(): HeaderGuardStyle
{
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('HeaderGuardStyle');
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
    const format = vscode.workspace.getConfiguration('C_mantic').get<string>('HeaderGuardDefineFormat');
    return format ? format : defaultHeaderGuardDefineFormat;
}

export function headerGuardDefine(fileName: string): string
{
    const FILENAME_EXT = fileName.replace('.', '_').toUpperCase();
    const FILENAME = util.fileNameBase(fileName).toUpperCase();
    return headerGuardDefineFormat().replace('${FILENAME_EXT}', FILENAME_EXT).replace('${FILENAME}', FILENAME);
}

export function indentation(options?: vscode.TextEditorOptions)
{
    if (!options) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            options = editor.options;
        }
    }

    if (options && options.insertSpaces) {
        return ' '.repeat(<number>(options.tabSize));
    }
    return '\t';
}
