import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';
import { getMatchingHeaderSource, logger } from './extension';
import { ProposedPosition } from './ProposedPosition';


export const title = {
    currentFile: 'Add Definition in this file',
    matchingSourceFile: 'Add Definition in matching source file',
    multiple: 'Add Definitions...',
    constructorCurrentFile: 'Generate Constructor in this file',
    constructorMatchingSourceFile: 'Generate Constructor in matching source file'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notHeaderFile: 'This file is not a header file.',
    noFunctionDeclaration: 'No function declaration detected.',
    noMatchingSourceFile: 'No matching source file was found.',
    hasUnspecializedTemplate: 'Unspecialized templates must be defined in the file that they are declared.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isConsteval: 'Consteval functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.',
    definitionExists: 'A definition for this function already exists.',
    noUndefinedFunctions: 'No undefined functions found in this file.'
};

export async function addDefinitionInSourceFile(): Promise<boolean | undefined> {
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
        getMatchingHeaderSource(headerDoc.uri),
        headerDoc.getSymbol(editor.selection.start)
    ]);

    if (!symbol?.isFunctionDeclaration()) {
        logger.alertWarning(failure.noFunctionDeclaration);
        return;
    } else if (!matchingUri) {
        logger.alertWarning(failure.noMatchingSourceFile);
        return;
    } else if (symbol.isInline()) {
        logger.alertInformation(failure.isInline);
        return;
    } else if (symbol.isConstexpr()) {
        logger.alertInformation(failure.isConstexpr);
        return;
    } else if (symbol.isConsteval()) {
        logger.alertInformation(failure.isConsteval);
        return;
    } else if (symbol.hasUnspecializedTemplate()) {
        logger.alertInformation(failure.hasUnspecializedTemplate);
        return;
    }

    await addDefinition(symbol, headerDoc, matchingUri);
}

export async function addDefinitionInCurrentFile(): Promise<boolean | undefined> {
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

    return addDefinition(symbol, sourceDoc, sourceDoc.uri);
}

export async function addMultipleDefinitions(
    sourceDoc: SourceDocument, matchingUri?: vscode.Uri
): Promise<boolean | undefined> {
    const functionDeclarations: CSymbol[] = [];

    (await sourceDoc.allFunctions()).forEach(functionSymbol => {
        if (functionSymbol.isFunctionDeclaration()) {
            functionDeclarations.push(functionSymbol);
        }
    });

    const undefinedFunctions = await findAllUndefinedFunctions(functionDeclarations);
    if (!undefinedFunctions) {
        return;
    } else if (undefinedFunctions.length === 0) {
        logger.alertInformation(failure.noUndefinedFunctions);
        return;
    }

    const p_selectedFunctions = promptUserToSelectFunctions(undefinedFunctions);

    const functionsThatRequireVisibleDefinition = undefinedFunctions.filter(declaration => {
        return declaration.isInline()
            || declaration.isConstexpr()
            || declaration.isConsteval()
            || declaration.hasUnspecializedTemplate();
    });

    const selectedFunctions = await p_selectedFunctions;
    if (!selectedFunctions || selectedFunctions.length === 0) {
        return;
    }

    const targetUri = util.arraysShareAnyElement(selectedFunctions, functionsThatRequireVisibleDefinition)
            ? sourceDoc.uri
            : await promptUserForDefinitionLocation(sourceDoc, matchingUri);
    if (!targetUri) {
        return;
    }

    const targetDoc = (targetUri.fsPath === sourceDoc.uri.fsPath)
            ? sourceDoc
            : await SourceDocument.open(targetUri);

    const useSmartPlacement = selectedFunctions.length <= 5;
    const workspaceEdit = new vscode.WorkspaceEdit();

    const p_addedDefinitions: Promise<void>[] = [];
    selectedFunctions.forEach(functionDeclaration => {
        p_addedDefinitions.push(addDefinitionToWorkspaceEdit(
                functionDeclaration, sourceDoc, targetDoc, useSmartPlacement, workspaceEdit));
    });
    await Promise.all(p_addedDefinitions);

    const success = await vscode.workspace.applyEdit(workspaceEdit);

    if (success && cfg.revealNewDefinition()) {
        await revealNewFunction(workspaceEdit, targetDoc);
    }

    return success;
}

export async function addDefinition(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetUri: vscode.Uri,
    skipExistingDefinitionCheck?: boolean
): Promise<boolean | undefined> {
    if (!skipExistingDefinitionCheck) {
        const existingDefinition = await functionDeclaration.findDefinition();
        if (existingDefinition) {
            if (!cfg.revealNewDefinition()) {
                logger.alertInformation(failure.definitionExists);
                return;
            }
            const editor = await vscode.window.showTextDocument(existingDefinition.uri);
            editor.revealRange(existingDefinition.range, vscode.TextEditorRevealType.InCenter);
            return;
        }
    }

    const p_initializers = getInitializersIfFunctionIsConstructor(functionDeclaration);

    const targetDoc = (targetUri.fsPath === declarationDoc.uri.fsPath)
            ? declarationDoc
            : await SourceDocument.open(targetUri);
    const targetPos = await declarationDoc.findSmartPositionForFunctionDefinition(functionDeclaration, targetDoc);

    const functionSkeleton = await constructFunctionSkeleton(
            functionDeclaration, targetDoc, targetPos, p_initializers);

    if (functionSkeleton === undefined) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, targetPos, functionSkeleton);
    const success = await vscode.workspace.applyEdit(workspaceEdit);

    if (success && cfg.revealNewDefinition()) {
        await revealNewFunction(workspaceEdit, targetDoc);
    }

    return success;
}

async function addDefinitionToWorkspaceEdit(
    functionDeclaration: CSymbol,
    declarationDoc: SourceDocument,
    targetDoc: SourceDocument,
    useSmartPlacement: boolean,
    workspaceEdit: vscode.WorkspaceEdit
): Promise<void> {
    const p_initializers = getInitializersIfFunctionIsConstructor(functionDeclaration);

    const targetPos = useSmartPlacement
            ? await declarationDoc.findSmartPositionForFunctionDefinition(functionDeclaration, targetDoc)
            : await declarationDoc.findPositionForFunctionDefinition(functionDeclaration, targetDoc);

    const functionSkeleton = await constructFunctionSkeleton(
            functionDeclaration, targetDoc, targetPos, p_initializers);

    if (functionSkeleton === undefined) {
        return;
    }

    workspaceEdit.insert(targetDoc.uri, targetPos, functionSkeleton);
}

type Initializer = CSymbol | SubSymbol;

interface InitializerQuickPickItem extends vscode.QuickPickItem {
    initializer: Initializer;
}

async function getInitializersIfFunctionIsConstructor(
    functionDeclaration: CSymbol
): Promise<Initializer[] | undefined> {
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
            initializerItem.label = '$(symbol-field) ' + initializer.name;
            initializerItem.description = initializer.text();
        }
        initializerItems.push(initializerItem);
    });

    const selectedIems = await vscode.window.showQuickPick<InitializerQuickPickItem>(initializerItems, {
        matchOnDescription: true,
        placeHolder: `Select what you would like to initialize in ${functionDeclaration.name} constructor`,
        ignoreFocusOut: true,
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

    parentClass.memberVariablesThatRequireInitialization().forEach(memberVariable => {
        if (!selectedInitializers.some(initializer => initializer.name === memberVariable.name)) {
            selectedInitializers.push(memberVariable);
        }
    });
    selectedInitializers.sort(util.sortByRange);

    return selectedInitializers;
}

async function constructFunctionSkeleton(
    functionDeclaration: CSymbol,
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

async function revealNewFunction(workspaceEdit: vscode.WorkspaceEdit, targetDoc: vscode.TextDocument): Promise<void> {
    const textEdits = workspaceEdit.get(targetDoc.uri);
    if (textEdits.length === 0) {
        return;
    }

    const editor = await vscode.window.showTextDocument(targetDoc);
    const firstEdit = textEdits[0];
    const start = firstEdit.range.start;
    util.revealRange(editor, new vscode.Range(start, start.translate(util.lineCount(firstEdit.newText))));

    const cursorPosition = targetDoc.validatePosition(getPositionForCursor(start, firstEdit.newText));
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
}

function getPositionForCursor(position: vscode.Position, functionSkeleton: string): vscode.Position {
    const lines = functionSkeleton.split('\n');
    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trimStart().startsWith(':')) {
            // The function is a constructor, so we want to position the cursor in the first initializer.
            let index = lines[i].lastIndexOf(')');
            if (index === -1) {
                index = lines[i].lastIndexOf('}');
                if (index === -1) {
                    return position;
                }
            }
            return new vscode.Position(i + position.line, index);
        }
        if (lines[i].trimEnd().endsWith('{')) {
            return new vscode.Position(i + 1 + position.line, lines[i + 1].length);
        }
    }
    return position;
}

/**
 * Returns the functionDeclarations that do not have a definition.
 * Returns undefined if the user cancels the operation.
 */
 async function findAllUndefinedFunctions(functionDeclarations: CSymbol[]): Promise<CSymbol[] | undefined> {
    interface DeclarationDefinitionLink {
        declaration: CSymbol;
        definition?: vscode.Location;
    }

    async function makeLink(declaration: CSymbol): Promise<DeclarationDefinitionLink> {
        return {
            declaration: declaration,
            definition: await declaration.findDefinition()
        };
    }

    const undefinedFunctions: CSymbol[] = [];

    async function findDefinitionsForNextChunkOfFunctions(i: number): Promise<void> {
        const p_declarationDefinitionLinks: Promise<DeclarationDefinitionLink>[] = [];
        functionDeclarations.slice(i, i + 20).forEach(declaration => {
            p_declarationDefinitionLinks.push(makeLink(declaration));
        });

        (await Promise.all(p_declarationDefinitionLinks)).forEach(link => {
            if (!link.definition) {
                undefinedFunctions.push(link.declaration);
            }
        });
    }

    await findDefinitionsForNextChunkOfFunctions(0);

    if (functionDeclarations.length <= 20) {
        return undefinedFunctions;
    }

    const increment = (20 / functionDeclarations.length) * 100;
    let userCancelledOperation = false;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Finding undefined functions',
        cancellable: true
    }, async (progress, token) => {
        for (let i = 20; i < functionDeclarations.length; i += 20) {
            if (token.isCancellationRequested) {
                userCancelledOperation = true;
                return;
            }

            progress.report({ message: `${i}/${functionDeclarations.length}`, increment: increment });

            await findDefinitionsForNextChunkOfFunctions(i);
        }

        progress.report({
            message: `${functionDeclarations.length}/${functionDeclarations.length}`,
            increment: increment
        });
    });

    if (!userCancelledOperation) {
        return undefinedFunctions;
    }
}

async function promptUserToSelectFunctions(functionDeclarations: CSymbol[]): Promise<CSymbol[] | undefined> {
    interface FunctionQuickPickItem extends vscode.QuickPickItem {
        declaration: CSymbol;
    }

    const functionItems: FunctionQuickPickItem[] = [];
    functionDeclarations.forEach(declaration => {
        functionItems.push({
            label: '$(symbol-function) ' + declaration.name,
            description: declaration.text().replace(/\s+/g, ' '),
            declaration: declaration
        });
    });

    const selectedItems = await vscode.window.showQuickPick<FunctionQuickPickItem>(functionItems, {
        matchOnDescription: true,
        placeHolder: 'Select the functions to add definitions for',
        ignoreFocusOut: true,
        canPickMany: true
    });

    if (!selectedItems) {
        return;
    }

    const selectedFunctions: CSymbol[] = [];
    selectedItems.forEach(item => selectedFunctions.push(item.declaration));

    return selectedFunctions;
}

async function promptUserForDefinitionLocation(
    sourceDoc: SourceDocument, matchingUri?: vscode.Uri
): Promise<vscode.Uri | undefined> {
    if (!sourceDoc.isHeader() || !matchingUri) {
        return sourceDoc.uri;
    }

    interface DefinitionLocationQuickPickItem extends vscode.QuickPickItem {
        uri: vscode.Uri;
    }

    const locationItems: DefinitionLocationQuickPickItem[] = [
        {
            label: `Add Definitions to "${vscode.workspace.asRelativePath(matchingUri)}"`,
            uri: matchingUri
        },
        {
            label: 'Add Definitions to this file',
            uri: sourceDoc.uri
        }
    ];

    const selectedItem = await vscode.window.showQuickPick<DefinitionLocationQuickPickItem>(locationItems, {
        placeHolder: 'Select which file to add the definitions to',
        ignoreFocusOut: true
    });

    if (selectedItem) {
        return selectedItem.uri;
    }
}
