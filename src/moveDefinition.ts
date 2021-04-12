import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceFile from './SourceFile';
import SourceDocument from './SourceDocument';
import SourceSymbol from './SourceSymbol';
import CSymbol from './CSymbol';
import { ProposedPosition } from './ProposedPosition';
import { getMatchingHeaderSource, logger } from './extension';


export const title = {
    matchingSourceFile: 'Move Definition to matching source file',
    outOfClass: 'Move Definition below class body',
    outOfStruct: 'Move Definition below struct body',
    intoClass: 'Move Definition into class',
    intoStruct: 'Move Definition into struct',
    intoOrOutOfClass: 'Move Definition into/out-of class body'
};

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noFunctionDefinition: 'No function definition detected.',
    noFunctionDeclaration: 'No declaration found for this function definition.',
    noMatchingSourceFile: 'No matching source file was found.',
    notCpp: 'Detected language is not C++, cannot operate on classes.',
    notMemberFunction: 'Function is not a class member function.',
    isTemplate: 'Function templates must be defined in the file that they are declared.',
    isClassTemplate: 'Class template member functions must be defined in the same file.',
    isConstexpr: 'Constexpr functions must be defined in the file that they are declared.',
    isConsteval: 'Consteval functions must be defined in the file that they are declared.',
    isInline: 'Inline functions must be defined in the file that they are declared.'
};

export async function moveDefinitionToMatchingSourceFile(
    definition?: CSymbol,
    targetUri?: vscode.Uri,
    declaration?: CSymbol
): Promise<boolean | undefined> {
    if (!definition || !targetUri) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        const sourceDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingHeaderSource(sourceDoc.uri),
            sourceDoc.getSymbol(editor.selection.start)
        ]);

        if (!symbol?.isFunctionDefinition()) {
            logger.alertWarning(failure.noFunctionDefinition);
            return;
        } else if (!matchingUri) {
            logger.alertWarning(failure.noMatchingSourceFile);
            return;
        }

        definition = symbol;
        targetUri = matchingUri;

        const declarationLocation = await definition.findDeclaration();
        if (declarationLocation) {
            declaration = await SourceDocument.getSymbol(declarationLocation);
        }
    }

    const targetDoc = await SourceDocument.open(targetUri);
    const position = (declaration !== undefined)
            ? await getNewPosition(targetDoc, declaration)
            : await getNewPosition(targetDoc, definition);

    const definitionText = await definition.getDefinitionForTargetPosition(targetDoc, position, declaration, true);
    const formattedDefinition = position.formatTextToInsert(definitionText, targetDoc);

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(targetDoc.uri, position, formattedDefinition);
    if (!declaration && SourceFile.isHeader(definition.uri)) {
        const newDeclaration = definition.newFunctionDeclaration();
        const replaceRange = cfg.alwaysMoveComments(definition.uri)
                ? definition.rangeWithLeadingComment()
                : definition.fullRange();
        workspaceEdit.replace(definition.uri, replaceRange, newDeclaration);
    } else {
        const deletionRange = getDeletionRange(definition);
        workspaceEdit.delete(definition.uri, deletionRange);
    }
    return vscode.workspace.applyEdit(workspaceEdit);
}

export async function moveDefinitionIntoOrOutOfClass(
    definition?: CSymbol,
    classDoc?: SourceDocument,
    declaration?: CSymbol
): Promise<boolean | undefined> {
    if (!definition || !classDoc) {
        // Command was called from the command-palette
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.alertError(failure.noActiveTextEditor);
            return;
        }

        const sourceDoc = new SourceDocument(editor.document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingHeaderSource(sourceDoc.uri),
            sourceDoc.getSymbol(editor.selection.start)
        ]);

        if (!symbol?.isFunctionDefinition()) {
            logger.alertWarning(failure.noFunctionDefinition);
            return;
        }
        definition = symbol;

        if (definition.parent?.isClassType()) {
            classDoc = sourceDoc;
        } else {
            const declarationLocation = await definition.findDeclaration();
            if (declarationLocation !== undefined
                    && (declarationLocation?.uri.fsPath === definition.uri.fsPath
                    || declarationLocation?.uri.fsPath === matchingUri?.fsPath)) {
                classDoc = declarationLocation.uri.fsPath === sourceDoc.uri.fsPath
                        ? sourceDoc
                        : await SourceDocument.open(declarationLocation.uri);
                declaration = await classDoc.getSymbol(declarationLocation.range.start);
                if (!declaration?.parent?.isClassType()) {
                    declaration = undefined;
                }
            }

            if (declaration?.parent?.isClassType() === false || !classDoc) {
                const parentClass = await definition.getParentClass();
                if (parentClass) {
                    classDoc = parentClass.document;
                } else {
                    logger.alertWarning(failure.notMemberFunction);
                    return;
                }
            }
        }
    }

    if (definition.parent?.isClassType()) {
        const position = await getNewPosition(classDoc, definition);

        const definitionText = await definition.getDefinitionForTargetPosition(classDoc, position, declaration, true);
        const formattedDefinition = position.formatTextToInsert(definitionText, classDoc);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.insert(classDoc.uri, position, formattedDefinition);
        const newDeclaration = definition.newFunctionDeclaration();
        const replaceRange = cfg.alwaysMoveComments(definition.uri)
                ? definition.rangeWithLeadingComment()
                : definition.fullRange();
        workspaceEdit.replace(definition.uri, replaceRange, newDeclaration);
        return vscode.workspace.applyEdit(workspaceEdit);
    } else if (declaration) {
        const combinedDefinition = declaration.combineDefinition(definition);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(declaration.uri, declaration.fullRange(), combinedDefinition);
        const deletionRange = getDeletionRange(definition);
        workspaceEdit.delete(definition.uri, deletionRange);
        return vscode.workspace.applyEdit(workspaceEdit);
    } else {
        const parentClass = await definition.getParentClass();
        if (parentClass) {
            const access = await util.getMemberAccessFromUser();
            if (access === undefined) {
                // User cancelled the access specifier selection.
                return;
            }

            const position = await definition.document.findSmartPositionForFunctionDeclaration(
                    definition, parentClass.document, parentClass, access);

            const definitionText = await definition.getDefinitionForTargetPosition(classDoc, position);
            let formattedDefinition = definitionText;
            if (access && !parentClass?.positionHasAccess(position, access)) {
                formattedDefinition = util.accessSpecifierString(access) + classDoc.endOfLine + formattedDefinition;
            }
            formattedDefinition = position.formatTextToInsert(formattedDefinition, classDoc);

            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.insert(classDoc.uri, position, formattedDefinition);
            const deletionRange = getDeletionRange(definition);
            workspaceEdit.delete(definition.uri, deletionRange);
            return vscode.workspace.applyEdit(workspaceEdit);
        }
    }

    logger.alertWarning(failure.noFunctionDeclaration);
}

async function getNewPosition(targetDoc: SourceDocument, declaration?: SourceSymbol): Promise<ProposedPosition> {
    if (!declaration) {
        return targetDoc.findPositionForNewSymbol();
    }

    const declarationDoc = await SourceDocument.open(declaration.uri);
    return declarationDoc.findSmartPositionForFunctionDefinition(declaration, targetDoc);
}

function getDeletionRange(definition: CSymbol): vscode.Range {
    let deletionRange = definition.rangeWithLeadingComment();
    if (definition.document.lineAt(deletionRange.start.line - 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(deletionRange.start.line - 1).range);
    }
    if (definition.document.lineAt(deletionRange.end.line + 1).isEmptyOrWhitespace) {
        deletionRange = deletionRange.union(definition.document.lineAt(deletionRange.end.line + 1).range);
    }
    return deletionRange;
}
