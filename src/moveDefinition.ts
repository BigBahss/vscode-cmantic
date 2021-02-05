import * as vscode from 'vscode';
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
    isInline: 'Inline functions must be defined in the file that they are declared.',
    inClassBody: 'Moving definitions into/out of class bodies isn\'t supoorted yet' // temporary
};

export async function moveDefinitionToMatchingSourceFile(
    definition: CSymbol,
    targetUri: vscode.Uri,
    declaration?: SourceSymbol
): Promise<void> {
    const targetDoc = await SourceDocument.open(targetUri);
    const position = await getNewPosition(targetDoc, declaration);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const insertText = getInsertText(definition, position, targetDoc);
    workspaceEdit.insert(targetDoc.uri, position, insertText);
    const deletionRange = getDeletionRange(definition);
    workspaceEdit.delete(definition.uri, deletionRange);
    await vscode.workspace.applyEdit(workspaceEdit);
}

async function getNewPosition(targetDoc: SourceDocument, declaration?: SourceSymbol): Promise<ProposedPosition>
{
    if (!declaration) {
        return targetDoc.findPositionForNewSymbol();
    }

    const declarationDoc = await SourceDocument.open(declaration.uri);
    return await declarationDoc.findPositionForFunctionDefinition(declaration, targetDoc);
}

function getInsertText(
    definition: CSymbol,
    position: ProposedPosition,
    targetDoc: vscode.TextDocument
): string {
    let insertText = definition.text();

    // Remove the old indentation.
    let line = definition.document.lineAt(definition.range.start);
    const oldIndentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    const re_indentation = new RegExp('^' + oldIndentation, 'gm');
    insertText = insertText.replace(re_indentation, '');

    insertText = position.formatTextToInsert(insertText, targetDoc);

    return insertText;
}

function getDeletionRange(definition: CSymbol): vscode.Range
{
    let deletionRange = definition.range;
    if (definition.document.lineAt(definition.range.start.line - 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(definition.range.start.line - 1).range);
    }
    if (definition.document.lineAt(definition.range.end.line + 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(definition.range.end.line + 1).range);
    }
    return deletionRange;
}
