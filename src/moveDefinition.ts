import * as vscode from 'vscode';
import * as util from './utility';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { SourceSymbol } from './SourceSymbol';
import { ProposedPosition } from './ProposedPosition';


export const title = {
    outOfClass: 'Move Definition out of class body',
    intoClass: 'Move Definition into class body',
    intoOrOutOfClassPlaceholder: 'Move Definition into or out of class body',
    matchingSourceFile: 'Move Definition to matching source file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notFunctionDefinition: 'No function declaration detected.',
    noMatchingSourceFile: 'No matching source file was found.',
    notCpp: 'Detected language is not C++, cannot operate on classes.',
    notMethod: 'Function is not a class method.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.'
};

export async function moveDefinitionToMatchingSourceFile(
    functionDefinition: CSymbol,
    targetUri: vscode.Uri,
    functionDeclaration?: SourceSymbol
): Promise<void> {
    const targetDoc = await SourceDocument.open(targetUri);
    const position = await getNewPosition(targetDoc, functionDeclaration);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const insertText = getInsertText(functionDefinition, position, targetDoc.document);
    workspaceEdit.insert(targetDoc.uri, position.value, insertText);
    const deletionRange = getDeletionRange(functionDefinition);
    workspaceEdit.delete(functionDefinition.uri, deletionRange);
    await vscode.workspace.applyEdit(workspaceEdit);
}

async function getNewPosition(targetDoc: SourceDocument, functionDeclaration?: SourceSymbol): Promise<ProposedPosition>
{
    if (!functionDeclaration) {
        return targetDoc.findPositionForNewSymbol();
    }

    const declarationDoc = await SourceDocument.open(functionDeclaration.uri);
    return await declarationDoc.findPositionForFunctionDefinition(functionDeclaration, targetDoc);
}

function getInsertText(
    functionDefinition: CSymbol,
    position: ProposedPosition,
    targetDocument: vscode.TextDocument
): string {
    let insertText = functionDefinition.text();

    // Convert indentation to that of the target position.
    let line = functionDefinition.document.lineAt(functionDefinition.range.start);
    const oldIndentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    const re_indentation = new RegExp('^' + oldIndentation, 'gm');
    insertText = insertText.replace(re_indentation, '');
    line = targetDocument.lineAt(position.value);
    const newIndentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    insertText = insertText.replace(/^/gm, newIndentation);

    const eol = util.endOfLine(targetDocument);
    const newLines = position.nextTo ? eol : eol + eol;
    if (position.after) {
        insertText = newLines + insertText;
    } else if (position.before) {
        insertText += newLines;
    }
    if (position.value.line === targetDocument.lineCount - 1) {
        insertText += eol;
    }

    return insertText;
}

function getDeletionRange(functionDefinition: CSymbol): vscode.Range
{
    let deletionRange = functionDefinition.range;
    if (functionDefinition.document.lineAt(functionDefinition.range.start.line - 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(functionDefinition.document.lineAt(functionDefinition.range.start.line - 1).range);
    }
    if (functionDefinition.document.lineAt(functionDefinition.range.end.line + 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(functionDefinition.document.lineAt(functionDefinition.range.end.line + 1).range);
    }
    return deletionRange;
}
