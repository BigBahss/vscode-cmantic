import * as vscode from 'vscode';
import * as util from './utility';
import { SourceDocument } from "./SourceDocument";
import { SourceFile } from "./SourceFile";
import { CSymbol } from "./CSymbol";
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './addDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './generateGetterSetter';
import { getMatchingSourceFile } from './extension';


export class CodeActionProvider implements vscode.CodeActionProvider
{
    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        // TODO: Returning commands from a CodeActionProvider is deprecated.
        // Refactor to implement CodeAction's and return them instead.
        const sourceDoc = new SourceDocument(document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(rangeOrSelection.start)
        ]);

        const [refactorings, sourceActions] = await Promise.all([
            this.getRefactorings(symbol, sourceDoc, matchingUri),
            this.getSourceActions(sourceDoc, matchingUri)
        ]);

        return [...refactorings, ...sourceActions];
    }

    private async getRefactorings(
        symbol: CSymbol | undefined,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<vscode.CodeAction[]> {
        if (symbol?.isFunctionDeclaration()) {
            return await this.getFunctionDeclarationRefactorings(symbol, sourceDoc, matchingUri);
        } else if (symbol?.isMemberVariable()) {
            return await this.getMemberVariableRefactorings(symbol, sourceDoc, matchingUri);
        }
        return [];
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
        },
        {
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
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
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
                arguments: [symbol]
            },
            disabled: generateGetterSetterDisabled
        },
        {
            title: getterSetterTitle.getter,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: getterSetterTitle.getter,
                command: 'cmantic.generateGetterFor',
                arguments: [symbol]
            },
            disabled: generateGetterDisabled
        },
        {
            title: getterSetterTitle.setter,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: getterSetterTitle.setter,
                command: 'cmantic.generateSetterFor',
                arguments: [symbol]
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
            createMatchingSourceFileDisabled = { reason: addDefinitionFailure.notHeaderFile };
            addHeaderGuardDisabled = createMatchingSourceFileDisabled;
        } else if (matchingUri) {
            createMatchingSourceFileDisabled = { reason: 'A matching source file already exists.' };
        }
        if (sourceDoc.hasHeaderGuard()) {
            addHeaderGuardDisabled = { reason: 'A header guard already exists.'};
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
