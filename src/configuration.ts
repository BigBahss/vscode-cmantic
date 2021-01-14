import * as vscode from 'vscode';


export enum CurlyBraceFormat {
    SameLine,
    NewLine,
    NewLineCtorDtor
}

const defaultHeaderExtensions = ['h', 'hpp', 'hh', 'hxx'];
const defaultSourceExtensions = ['c', 'cpp', 'cc', 'cxx'];
const defaultCurlyBraceFormat = CurlyBraceFormat.NewLineCtorDtor;


export function headerExtensions(): string[]
{
    const extensions = vscode.workspace.getConfiguration('Cmantic').get<string[]>('HeaderFileExtensions');
    return extensions ? extensions : defaultHeaderExtensions;
}

export function sourceExtensions(): string[]
{
    const extensions = vscode.workspace.getConfiguration('Cmantic').get<string[]>('SourceFileExtensions');
    return extensions ? extensions : defaultSourceExtensions;
}

export function curlyBraceFormat(): CurlyBraceFormat
{
    const format = vscode.workspace.getConfiguration('Cmantic').get<string>('CurlyBraceFormat');
    switch (format) {
    case 'Same line':
        return CurlyBraceFormat.SameLine;
    case 'New line':
        return CurlyBraceFormat.NewLine;
    case 'New line for constructors and destructors':
    default:
        return defaultCurlyBraceFormat;
    }
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
