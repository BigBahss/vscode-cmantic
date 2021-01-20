import * as vscode from 'vscode';
import { CSymbol, SourceDocument, SourceFile } from './cmantics';
import * as cfg from './configuration';
import * as util from './utility';


export const title = {
    currentFile: 'Add Definition in this file',
    matchingSourceFile: 'Add Definition in matching source file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notHeaderFile: 'This file is not a header file.',
    notFunctionDeclaration: 'No function declaration detected.',
    noMatchingSourceFile: 'No matching source file was found.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.',
    definitionExists: 'A definition for this function already exists.'
};


export async function addDefinitionInSourceFile(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);
    if (!sourceDoc.isHeader()) {
        vscode.window.showErrorMessage(failure.notHeaderFile);
        return;
    }

    const [matchingUri, symbol] = await Promise.all([
        sourceDoc.findMatchingSourceFile(),
        sourceDoc.getSymbol(editor.selection.start)
    ]);
    if (!symbol?.isFunctionDeclaration()) {
        vscode.window.showErrorMessage(failure.notFunctionDeclaration);
        return;
    } else if (!matchingUri) {
        vscode.window.showErrorMessage(failure.noMatchingSourceFile);
        return;
    } else if (symbol.isConstexpr()) {
        vscode.window.showErrorMessage(failure.isConstexpr);
        return;
    } else if (symbol.isInline()) {
        vscode.window.showErrorMessage(failure.isInline);
        return;
    }

    return addDefinition(symbol, sourceDoc, matchingUri);
}

export async function addDefinitionInCurrentFile(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);

    const symbol = await sourceDoc.getSymbol(editor.selection.start);
    if (!symbol?.isFunctionDeclaration()) {
        vscode.window.showErrorMessage(failure.notFunctionDeclaration);
        return;
    }

    return addDefinition(symbol, sourceDoc, sourceDoc.uri);
}

export async function addDefinition(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetUri: vscode.Uri
): Promise<void> {
    // Check for an existing definition. If one exists, reveal it and return.
    const existingDefinition = await functionDeclaration.findDefinition();
    if (existingDefinition) {
        const editor = await vscode.window.showTextDocument(existingDefinition.uri);
        editor.revealRange(existingDefinition.range, vscode.TextEditorRevealType.InCenter);
        return;
    }

    // Find the position for the new function definition.
    const document = await vscode.workspace.openTextDocument(targetUri);
    const targetFile = (targetUri.path === declarationDoc.uri.path) ?
            declarationDoc : new SourceDocument(document);
    const position = await declarationDoc.findPositionForNewDefinition(functionDeclaration, targetFile);

    // Construct the snippet for the new function definition.
    const definition = await functionDeclaration.newFunctionDefinition(targetFile, position.value);
    const curlyBraceFormat = cfg.curlyBraceFormat(document.languageId);
    const eol = util.endOfLine(targetFile.document);
    let functionSkeleton: string;
    if (curlyBraceFormat === cfg.CurlyBraceFormat.NewLine
            || (curlyBraceFormat === cfg.CurlyBraceFormat.NewLineCtorDtor
            && (functionDeclaration.isConstructor() || functionDeclaration.isDestructor()))) {
        // Opening brace on new line.
        functionSkeleton = definition + eol + '{' + eol + util.indentation() + '$0' + eol + '}';
    } else {
        // Opening brace on same line.
        functionSkeleton = definition + ' {' + eol + util.indentation() + '$0' + eol + '}';
    }

    return util.insertSnippetAndReveal(functionSkeleton, position, targetFile.document);
}
