import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { getMatchingSourceFile } from './extension';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { ProposedPosition } from './ProposedPosition';
import { SourceSymbol } from './SourceSymbol';


export const title = {
    currentFile: 'Add Definition in this file',
    matchingSourceFile: 'Add Definition in matching source file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notHeaderFile: 'This file is not a header file.',
    noFunctionDeclaration: 'No function declaration detected.',
    noMatchingSourceFile: 'No matching source file was found.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.',
    definitionExists: 'A definition for this function already exists.'
};


export async function addDefinitionInSourceFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError(failure.noActiveTextEditor);
        return;
    }

    const headerDoc = new SourceDocument(editor.document);
    if (!headerDoc.isHeader()) {
        logger.alertWarning(failure.notHeaderFile);
        return;
    }

    const [matchingUri, symbol] = await Promise.all([
        getMatchingSourceFile(headerDoc.uri),
        headerDoc.getSymbol(editor.selection.start)
    ]);

    if (!symbol?.isFunctionDeclaration()) {
        logger.alertWarning(failure.noFunctionDeclaration);
        return;
    } else if (!matchingUri) {
        logger.alertWarning(failure.noMatchingSourceFile);
        return;
    } else if (symbol.isConstexpr()) {
        logger.alertInformation(failure.isConstexpr);
        return;
    } else if (symbol.isInline()) {
        logger.alertInformation(failure.isInline);
        return;
    }

    await addDefinition(symbol, headerDoc, matchingUri);
}

export async function addDefinitionInCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logger.alertError(failure.noActiveTextEditor);
        return;
    }

    const sourceDoc = new SourceDocument(editor.document);

    const symbol = await sourceDoc.getSymbol(editor.selection.start);
    if (!symbol?.isFunctionDeclaration()) {
        logger.alertWarning(failure.noFunctionDeclaration);
        return;
    }

    await addDefinition(symbol, sourceDoc, sourceDoc.uri);
}

export async function addDefinition(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetUri: vscode.Uri
): Promise<void> {
    const shouldReveal = cfg.revealNewDefinition();
    const existingDefinition = await functionDeclaration.findDefinition();
    if (existingDefinition) {
        if (!shouldReveal) {
            logger.alertInformation(failure.definitionExists);
            return;
        }
        const editor = await vscode.window.showTextDocument(existingDefinition.uri);
        editor.revealRange(existingDefinition.range, vscode.TextEditorRevealType.InCenter);
        return;
    }

    const p_membersToInitialize = getMembersToInitializeIfConstructor(functionDeclaration);

    // Find the position for the new function definition.
    const targetDoc = (targetUri.fsPath === declarationDoc.uri.fsPath)
            ? declarationDoc
            : await SourceDocument.open(targetUri);
    const targetPos = await declarationDoc.findPositionForFunctionDefinition(functionDeclaration, targetDoc);

    const functionSkeleton = await constructFunctionSkeleton(functionDeclaration, declarationDoc, targetDoc, targetPos, p_membersToInitialize);

    let editor: vscode.TextEditor | undefined;
    if (shouldReveal) {
        editor = await vscode.window.showTextDocument(targetDoc.uri);
        const revealRange = new vscode.Range(targetPos, targetPos.translate(util.lineCount(functionSkeleton)));
        editor.revealRange(targetDoc.validateRange(revealRange), vscode.TextEditorRevealType.InCenter);

        // revealRange() sometimes doesn't work for large files, this appears to be a bug in vscode.
        // Waiting a bit and re-executing seems to work around this issue. (BigBahss/vscode-cmantic#2)
        setTimeout(() => {
            if (editor && revealRange) {
                for (const visibleRange of editor.visibleRanges) {
                    if (visibleRange.contains(revealRange)) {
                        return;
                    }
                }
                editor.revealRange(revealRange, vscode.TextEditorRevealType.InCenter);
            }
        }, 500);
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, targetPos, functionSkeleton);
    await vscode.workspace.applyEdit(workspaceEdit);

    if (shouldReveal && editor) {
        const cursorPosition = targetDoc.validatePosition(getPositionForCursor(targetPos, functionSkeleton));
        editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
    }
}

interface QuickPickMemberVariable extends vscode.QuickPickItem {
    memberVariable: SourceSymbol;
}

async function getMembersToInitializeIfConstructor(functionDeclaration: CSymbol): Promise<SourceSymbol[] | undefined> {
    if (!functionDeclaration.isConstructor()) {
        return;
    }

    const memberVariables = functionDeclaration.parent?.memberVariables();

    const memberVariableItems: QuickPickMemberVariable[] = [];
    memberVariables?.forEach(memberVariable => {
        memberVariableItems.push({
            label: memberVariable.name,
            memberVariable: memberVariable
        });
    });

    const selectedIems = await vscode.window.showQuickPick<QuickPickMemberVariable>(memberVariableItems, {
        canPickMany: true, placeHolder: 'What members would you like to initialize?'
    });

    const selectedMemberVariables: SourceSymbol[] = [];
    selectedIems?.forEach(item => selectedMemberVariables.push(item.memberVariable));
    return selectedMemberVariables;
}

async function constructFunctionSkeleton(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetDoc: SourceDocument,
    position: ProposedPosition,
    p_membersToInitialize?: Promise<SourceSymbol[] | undefined>
): Promise<string> {
    const [definition, membersToInitialize] = await Promise.all([
        functionDeclaration.newFunctionDefinition(targetDoc, position),
        p_membersToInitialize
    ]);

    const eol = targetDoc.endOfLine;
    const initializerList = constructMemberInitializerList(membersToInitialize, eol);

    const curlyBraceFormat = cfg.functionCurlyBraceFormat(targetDoc.languageId);
    const indentation = util.indentation();

    let functionSkeleton: string;
    if (curlyBraceFormat === cfg.CurlyBraceFormat.NewLine
            || (curlyBraceFormat === cfg.CurlyBraceFormat.NewLineCtorDtor
            && (functionDeclaration.isConstructor() || functionDeclaration.isDestructor()))) {
        // Opening brace on new line.
        functionSkeleton = definition + initializerList + eol + '{' + eol + indentation + eol + '}';
    } else {
        // Opening brace on same line.
        functionSkeleton = definition + initializerList + ' {' + eol + indentation + eol + '}';
    }

    const cfgIndent = cfg.indentNamespaceBody();
    if (position.options.emptyScope && (cfgIndent === cfg.NamespaceIndentation.Always
            || (cfgIndent === cfg.NamespaceIndentation.Auto && await declarationDoc.isNamespaceBodyIndented()))) {
        functionSkeleton = functionSkeleton.replace(/^/gm, indentation);
    }

    return position.formatTextToInsert(functionSkeleton, targetDoc);
}

function constructMemberInitializerList(memberVariables: SourceSymbol[] | undefined, eol: string): string {
    if (!memberVariables) {
        return '';
    }

    const indentation = util.indentation();

    let initializerList = eol + indentation + ': ';
    memberVariables.forEach(memberVariable => initializerList += memberVariable.name + '(),' + eol + indentation + '  ');

    return initializerList.trimEnd().slice(0, -1);
}

function getPositionForCursor(position: ProposedPosition, functionSkeleton: string): vscode.Position {
    const lines = functionSkeleton.split('\n');
    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trimEnd().endsWith('{')) {
            return new vscode.Position(i + 1 + position.line, lines[i + 1].length);
        }
    }
    return new vscode.Position(0, 0);
}
