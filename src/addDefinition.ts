import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { getMatchingSourceFile } from './extension';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { ProposedPosition } from './ProposedPosition';
import { SourceSymbol } from './SourceSymbol';
import { SubSymbol } from './SubSymbol';


export const title = {
    currentFile: 'Add Definition in this file',
    matchingSourceFile: 'Add Definition in matching source file',
    constructorCurrentFile: 'Generate Constructor in this file',
    constructorMatchingSourceFile: 'Generate Constructor in matching source file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notHeaderFile: 'This file is not a header file.',
    noFunctionDeclaration: 'No function declaration detected.',
    noMatchingSourceFile: 'No matching source file was found.',
    isTemplate: 'Function templates must be defined in the file that they are declared.',
    isClassTemplate: 'Class template member functions must be defined in the same file.',
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
    } else if (symbol?.isTemplate()) {
        logger.alertInformation(failure.isTemplate);
    } else if (symbol?.parent?.isTemplate()) {
        logger.alertInformation(failure.isClassTemplate);
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

    const p_initializers = getInitializersIfFunctionIsConstructor(functionDeclaration);

    // Find the position for the new function definition.
    const targetDoc = (targetUri.fsPath === declarationDoc.uri.fsPath)
            ? declarationDoc
            : await SourceDocument.open(targetUri);
    const targetPos = await declarationDoc.findPositionForFunctionDefinition(functionDeclaration, targetDoc);

    const functionSkeleton = await constructFunctionSkeleton(
            functionDeclaration, declarationDoc, targetDoc, targetPos, p_initializers);

    if (functionSkeleton === undefined) {
        return;
    }

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

type Initializer = SourceSymbol | SubSymbol;

interface InitializerQuickPickItem extends vscode.QuickPickItem {
    initializer: Initializer;
}

async function getInitializersIfFunctionIsConstructor(functionDeclaration: CSymbol): Promise<Initializer[] | undefined> {
    if (!functionDeclaration.isConstructor() || !functionDeclaration.parent?.isClassOrStruct()) {
        return [];
    }
    const parentClass = functionDeclaration.parent;

    const initializers: Initializer[] = [];
    if (parentClass.constructors().length > 1) {
        initializers.push(parentClass);
    }
    initializers.push(...parentClass.baseClasses(), ...parentClass.nonStaticMemberVariables());

    if (initializers.length === 0) {
        return [];
    }

    const initializerItems: InitializerQuickPickItem[] = [];
    initializers.forEach(initializer => {
        const initializerItem: InitializerQuickPickItem = { label: '', initializer: initializer };
        if (initializer === parentClass) {
            initializerItem.label = '$(symbol-class) ' + initializer.name;
            initializerItem.description = 'Delegating constructor (cannot be used with any other initializers)';
        } else if (initializer instanceof SubSymbol) {
            initializerItem.label = '$(symbol-class) ' + initializer.text();
            initializerItem.description = 'Base class constructor';
        } else {
            const memberVariable = new CSymbol(initializer, parentClass.document);
            initializerItem.label = '$(symbol-field) ' + memberVariable.name;
            initializerItem.description = memberVariable.text();
        }
        initializerItems.push(initializerItem);
    });

    const selectedIems = await vscode.window.showQuickPick<InitializerQuickPickItem>(initializerItems, {
        matchOnDescription: true,
        placeHolder: 'Select what you would like to initialize in this constructor:',
        canPickMany: true
    });

    if (!selectedIems) {
        return;
    }

    if (selectedIems.length === 1 && selectedIems[0].initializer === parentClass) {
        return [parentClass];
    }

    const selectedInitializers: Initializer[] = [];
    selectedIems.forEach(item => {
        if (item.initializer !== parentClass) {
            selectedInitializers.push(item.initializer);
        }
    });

    selectedInitializers.push(...parentClass.memberVariablesThatRequireInitialization());
    selectedInitializers.sort(util.sortByRange);

    return [...new Set(selectedInitializers)];
}

async function constructFunctionSkeleton(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetDoc: SourceDocument,
    position: ProposedPosition,
    p_initializers: Promise<Initializer[] | undefined>
): Promise<string | undefined> {
    const curlyBraceFormat = cfg.functionCurlyBraceFormat(targetDoc.languageId);
    const eol = targetDoc.endOfLine;
    const indentation = util.indentation();

    const [definition, initializers] = await Promise.all([
        functionDeclaration.newFunctionDefinition(targetDoc, position),
        p_initializers
    ]);

    if (initializers === undefined) {
        // Undefined only when the user cancels the QuickPick, so return.
        return;
    }

    const initializerList = constructInitializerList(initializers, eol);

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

    return position.formatTextToInsert(functionSkeleton, targetDoc);
}

function constructInitializerList(initializers: Initializer[], eol: string): string {
    if (initializers.length === 0) {
        return '';
    }

    const indentation = util.indentation();
    const initializerBody = cfg.bracedInitialization() ? '{},' : '(),';

    let initializerList = eol + indentation + ': ';
    initializers.forEach(initializer => initializerList += initializer.name + initializerBody + eol + indentation + '  ');

    return initializerList.trimEnd().slice(0, -1);
}

function getPositionForCursor(position: ProposedPosition, functionSkeleton: string): vscode.Position {
    const lines = functionSkeleton.split('\n');
    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trimStart().startsWith(':')) {
            // The function is a constructor, so we want to position the cursor in the first initializer.
            let index = lines[i].lastIndexOf(')');
            if (index === -1) {
                index = lines[i].lastIndexOf('}');
                if (index === -1) {
                    return new vscode.Position(0, 0);
                }
            }
            return new vscode.Position(i + position.line, index);
        }
        if (lines[i].trimEnd().endsWith('{')) {
            return new vscode.Position(i + 1 + position.line, lines[i + 1].length);
        }
    }
    return new vscode.Position(0, 0);
}
