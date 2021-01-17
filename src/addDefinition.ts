import * as vscode from 'vscode';
import { CSymbol, SourceFile } from './cmantics';
import * as cfg from './configuration';
import * as util from './utility';


export const failReason = {
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
        vscode.window.showErrorMessage(failReason.noActiveTextEditor);
        return;
    }

    const sourceFile = new SourceFile(editor.document);
    if (!sourceFile.isHeader()) {
        vscode.window.showErrorMessage(failReason.notHeaderFile);
        return;
    }

    const [matchingUri, symbol] = await Promise.all([
        sourceFile.findMatchingSourceFile(),
        sourceFile.getSymbol(editor.selection.start)
    ]);
    if (!symbol?.isFunctionDeclaration()) {
        vscode.window.showErrorMessage(failReason.notFunctionDeclaration);
        return;
    } else if (!matchingUri) {
        vscode.window.showErrorMessage(failReason.noMatchingSourceFile);
        return;
    } else if (symbol.isConstexpr()) {
        vscode.window.showErrorMessage(failReason.isConstexpr);
        return;
    } else if (symbol.isInline()) {
        vscode.window.showErrorMessage(failReason.isInline);
        return;
    }

    addDefinition(symbol, sourceFile, matchingUri);
}

export async function addDefinitionInCurrentFile(): Promise<void>
{
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(failReason.noActiveTextEditor);
        return;
    }

    const sourceFile = new SourceFile(editor.document);

    const symbol = await sourceFile.getSymbol(editor.selection.start);
    if (!symbol?.isFunctionDeclaration()) {
        vscode.window.showErrorMessage(failReason.notFunctionDeclaration);
        return;
    }

    addDefinition(symbol, sourceFile, sourceFile.uri);
}

export async function addDefinition(
    functionDeclaration: CSymbol,
    declarationFile: SourceFile,
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
    const editor = await vscode.window.showTextDocument(targetUri);
    const targetFile = (targetUri.path === declarationFile.uri.path) ?
            declarationFile : new SourceFile(editor.document);
    const position = await declarationFile.findPositionForNewDefinition(functionDeclaration, targetFile);

    // Construct the snippet for the new function definition.
    const definition = await functionDeclaration.newFunctionDefinition(targetFile, position.value);
    const curlyBraceFormat = cfg.curlyBraceFormat();
    const eol = util.endOfLine(targetFile.document);
    let functionSkeleton: string;
    if (curlyBraceFormat === cfg.CurlyBraceFormat.NewLine
            || (curlyBraceFormat === cfg.CurlyBraceFormat.NewLineCtorDtor
            && (functionDeclaration.isConstructor() || functionDeclaration.isDestructor()))) {
        // Opening brace on new line.
        functionSkeleton = definition + eol + '{' + eol + cfg.indentation() + '$0' + eol + '}';
    } else {
        // Opening brace on same line.
        functionSkeleton = definition + ' {' + eol + cfg.indentation() + '$0' + eol + '}';
    }
    if (position.after) {
        functionSkeleton = eol + eol + functionSkeleton;
    } else if (position.before) {
        functionSkeleton += eol + eol;
    } else if (targetFile.document.lineCount - 1 === position.value.line) {
        functionSkeleton += eol;
    }
    const snippet = new vscode.SnippetString(functionSkeleton);

    await editor.insertSnippet(snippet, position.value, { undoStopBefore: true, undoStopAfter: false });
    if (position.before || position.after) {
        /* When inserting a indented snippet that contains an empty line, the empty line with be indented,
         * thus leaving trailing whitespace. So we need to clean up that whitespace. */
        editor.edit(editBuilder => {
            const trailingWSPosition = position.value.translate(position.after ? 1 : util.lines(snippet.value));
            const l = targetFile.document.lineAt(trailingWSPosition);
            if (l.isEmptyOrWhitespace) {
                editBuilder.delete(l.range);
            }
        }, { undoStopBefore: false, undoStopAfter: true });
    }
    const revealPosition = position.value.translate(position.after ? 3 : -3);
    editor.revealRange(new vscode.Range(revealPosition, revealPosition), vscode.TextEditorRevealType.InCenter);
}
