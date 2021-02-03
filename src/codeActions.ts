import * as vscode from 'vscode';
import { SourceDocument } from "./SourceDocument";
import { CSymbol } from "./CSymbol";
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './addDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './generateGetterSetter';
import { failure as createSourceFileFailure } from './createSourceFile';
import { failure as addHeaderGuardFailure } from './addHeaderGuard';
import { getMatchingSourceFile } from './extension';


export class CodeActionProvider implements vscode.CodeActionProvider
{
    private lastPositionProvided: vscode.Position | undefined;
    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[] | undefined> {
        if (this.lastPositionProvided && rangeOrSelection.contains(this.lastPositionProvided)) {
            return;
        }
        this.lastPositionProvided = rangeOrSelection.start;

        const sourceDoc = new SourceDocument(document);

        if (token.isCancellationRequested) {
            return [];
        }

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(rangeOrSelection.start)
        ]);

        if (token.isCancellationRequested) {
            return [];
        }

        const [refactorings, sourceActions] = await Promise.all([
            this.getRefactorings(symbol, sourceDoc, token, matchingUri),
            this.getSourceActions(sourceDoc, matchingUri)
        ]);

        return [...refactorings, ...sourceActions];
    }

    async resolveCodeAction(codeAction: vscode.CodeAction, token: vscode.CancellationToken): Promise<vscode.CodeAction>
    {
        return codeAction;
    }

    private async getRefactorings(
        symbol: CSymbol | undefined,
        sourceDoc: SourceDocument,
        token: vscode.CancellationToken,
        matchingUri?: vscode.Uri
    ): Promise<vscode.CodeAction[]> {
        const refactorings: vscode.CodeAction[] = [];
        if (symbol?.isFunctionDeclaration()) {
            refactorings.push(...await this.getFunctionDeclarationRefactorings(symbol, sourceDoc, matchingUri));
        } else if (symbol?.isMemberVariable()) {
            refactorings.push(...await this.getMemberVariableRefactorings(symbol, sourceDoc));
        }

        if (token.isCancellationRequested) {
            return [];
        }

        return refactorings;
    }

    private async getFunctionDeclarationRefactorings(
        symbol: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<vscode.CodeAction[]> {
        const existingDefinition = await symbol?.findDefinition();

        let addDefinitionInMatchingSourceFileTitle = addDefinitionTitle.matchingSourceFile;
        let addDefinitionInMatchingSourceFileDisabled: { readonly reason: string } | undefined;
        let addDefinitionInCurrentFileDisabled: { readonly reason: string } | undefined;

        if (symbol?.isInline()) {
            addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.isInline };
        }
        if (symbol?.isConstexpr()) {
            addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.isConstexpr };
        }
        if (existingDefinition) {
            addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.definitionExists };
            addDefinitionInCurrentFileDisabled = addDefinitionInMatchingSourceFileDisabled;
        }
        if (!sourceDoc.isHeader()) {
            addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.notHeaderFile };
        } else if (matchingUri) {
            // TODO: Elide the path if it is very long.
            addDefinitionInMatchingSourceFileTitle = 'Add Definition in "'
                    + vscode.workspace.asRelativePath(matchingUri, false) + '"';
        } else {
            addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.noMatchingSourceFile };
        }

        return [{
            title: addDefinitionInMatchingSourceFileTitle,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: addDefinitionInMatchingSourceFileTitle,
                command: 'cmantic.addDefinition',
                arguments: [symbol, sourceDoc, matchingUri]
            },
            disabled: addDefinitionInMatchingSourceFileDisabled
        }, {
            title: addDefinitionTitle.currentFile,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: addDefinitionTitle.currentFile,
                command: 'cmantic.addDefinition',
                arguments: [symbol, sourceDoc, sourceDoc.uri]
            },
            disabled: addDefinitionInCurrentFileDisabled
        }];
    }

    private async getMemberVariableRefactorings(
        symbol: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<vscode.CodeAction[]> {
        let generateGetterSetterDisabled: { readonly reason: string } | undefined;
        let generateGetterDisabled: { readonly reason: string } | undefined;
        let generateSetterDisabled: { readonly reason: string } | undefined;

        if (sourceDoc.document.languageId !== 'cpp') {
            generateGetterSetterDisabled = { reason: getterSetterFailure.notCpp };
            generateGetterDisabled = { reason: getterSetterFailure.notCpp };
            generateSetterDisabled = { reason: getterSetterFailure.notCpp };
        } else {
            const getter = symbol.parent?.findGetterFor(symbol);
            const setter = symbol.parent?.findSetterFor(symbol);

            generateGetterSetterDisabled = (getter || setter) ? { reason: getterSetterFailure.getterOrSetterExists } : undefined;
            generateGetterDisabled = getter ? { reason: getterSetterFailure.getterExists } : undefined;
            generateSetterDisabled = setter ? { reason: getterSetterFailure.setterExists } : undefined;

            if (symbol.isConst()) {
                generateGetterSetterDisabled = { reason: getterSetterFailure.isConst };
                generateSetterDisabled = { reason: getterSetterFailure.isConst };
            }
        }

        return [{
            title: getterSetterTitle.getterSetter,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: getterSetterTitle.getterSetter,
                command: 'cmantic.generateGetterSetterFor',
                arguments: [symbol, sourceDoc]
            },
            disabled: generateGetterSetterDisabled
        }, {
            title: getterSetterTitle.getter,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: getterSetterTitle.getter,
                command: 'cmantic.generateGetterFor',
                arguments: [symbol, sourceDoc]
            },
            disabled: generateGetterDisabled
        }, {
            title: getterSetterTitle.setter,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: getterSetterTitle.setter,
                command: 'cmantic.generateSetterFor',
                arguments: [symbol, sourceDoc]
            },
            disabled: generateSetterDisabled
        }];
    }

    private async getSourceActions(
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<vscode.CodeAction[]> {
        let createMatchingSourceFileDisabled: { readonly reason: string } | undefined;
        let addHeaderGuardDisabled: { readonly reason: string } | undefined;

        if (!sourceDoc.isHeader()) {
            createMatchingSourceFileDisabled = { reason: createSourceFileFailure.notHeaderFile };
            addHeaderGuardDisabled = { reason: addHeaderGuardFailure.notHeaderFile };
        } else if (matchingUri) {
            createMatchingSourceFileDisabled = { reason: createSourceFileFailure.sourceFileExists };
        }
        if (sourceDoc.hasHeaderGuard()) {
            addHeaderGuardDisabled = { reason: addHeaderGuardFailure.headerGuardExists };
        }

        return [{
            title: 'Add Header Guard',
            kind: vscode.CodeActionKind.Source,
            command: {
                title: 'Add Header Guard',
                command: 'cmantic.addHeaderGuard'
            },
            disabled: addHeaderGuardDisabled
        }, {
            title: 'Add Include',
            kind: vscode.CodeActionKind.Source,
            command: {
                title: 'Add Include',
                command: 'cmantic.addInclude'
            }
        }, {
            title: 'Create Matching Source File',
            kind: vscode.CodeActionKind.Source,
            command: {
                title: 'Create Matching Source File',
                command: 'cmantic.createMatchingSourceFile'
            },
            disabled: createMatchingSourceFileDisabled
        }];
    }
}
