import * as vscode from 'vscode';
import { CSymbol, SourceFile } from './cmantics';
import * as util from './utility';
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './addDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './generateGetterSetter';


export class CodeActionProvider implements vscode.CodeActionProvider
{
    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        const sourceFile = new SourceFile(document);

        const [matchingUri, symbol] = await Promise.all([
            sourceFile.findMatchingSourceFile(),
            sourceFile.getSymbol(rangeOrSelection.start)
        ]);

        const [refactorings, sourceActions] = await Promise.all([
            getRefactorings(symbol, sourceFile, matchingUri),
            getSourceActions(sourceFile, matchingUri)
        ]);

        return [...refactorings, ...sourceActions];
    }

    resolveCodeAction(
        codeAction: vscode.CodeAction,
        token: vscode.CancellationToken,
    ): vscode.CodeAction {
        return codeAction;
    }
}


async function getRefactorings(
    symbol: CSymbol | undefined,
    sourceFile: SourceFile,
    matchingUri?: vscode.Uri
): Promise<vscode.CodeAction[]> {
    if (symbol?.isFunctionDeclaration()) {
        return await getFunctionDeclarationRefactorings(symbol, sourceFile, matchingUri);
    } else if (symbol?.isMemberVariable()) {
        return await getMemberVariableRefactorings(symbol, sourceFile, matchingUri);
    }
    return [];
}

async function getFunctionDeclarationRefactorings(
    symbol: CSymbol,
    sourceFile: SourceFile,
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
    if (!sourceFile.isHeader()) {
        addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.notHeaderFile };
    } else if (matchingUri) {
        // TODO: Elide the path if it is very long.
        addDefinitionInMatchingSourceFileTitle = 'Add Definition in "' + util.workspaceRelativePath(matchingUri.path) + '"';
    } else {
        addDefinitionInMatchingSourceFileDisabled = { reason: addDefinitionFailure.noMatchingSourceFile };
    }

    return [{
        title: addDefinitionInMatchingSourceFileTitle,
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: addDefinitionInMatchingSourceFileTitle,
            command: 'cmantic.addDefinition',
            arguments: [symbol, sourceFile, matchingUri]
        },
        disabled: addDefinitionInMatchingSourceFileDisabled
    },
    {
        title: addDefinitionTitle.currentFile,
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: addDefinitionTitle.currentFile,
            command: 'cmantic.addDefinition',
            arguments: [symbol, sourceFile, sourceFile.uri]
        },
        disabled: addDefinitionInCurrentFileDisabled
    }];
}

async function getMemberVariableRefactorings(
    symbol: CSymbol,
    sourceFile: SourceFile,
    matchingUri?: vscode.Uri
): Promise<vscode.CodeAction[]> {
    let generateGetterSetterDisabled: { readonly reason: string } | undefined;
    let generateGetterDisabled: { readonly reason: string } | undefined;
    let generateSetterDisabled: { readonly reason: string } | undefined;

    if (sourceFile.document.languageId !== 'cpp') {
        generateGetterSetterDisabled = { reason: getterSetterFailure.notCpp };
        generateGetterDisabled = { reason: getterSetterFailure.notCpp };
        generateSetterDisabled = { reason: getterSetterFailure.notCpp };
    } else {
        const getter = symbol.parent?.findGetterFor(symbol);
        const setter = symbol.parent?.findSetterFor(symbol);

        generateGetterSetterDisabled = (getter || setter) ? { reason: getterSetterFailure.getterSetterExists } : undefined;
        generateGetterDisabled = getter ? { reason: getterSetterFailure.getterExists } : undefined;
        generateSetterDisabled = setter ? { reason: getterSetterFailure.setterExists } : undefined;
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

async function getSourceActions(
    sourceFile: SourceFile,
    matchingUri?: vscode.Uri
): Promise<vscode.CodeAction[]> {
    let createMatchingSourceFileDisabled: { readonly reason: string } | undefined;
    let addHeaderGuardDisabled: { readonly reason: string } | undefined;

    if (!sourceFile.isHeader()) {
        createMatchingSourceFileDisabled = { reason: addDefinitionFailure.notHeaderFile };
        addHeaderGuardDisabled = createMatchingSourceFileDisabled;
    } else if (matchingUri) {
        createMatchingSourceFileDisabled = { reason: 'A matching source file already exists.' };
    }
    if (await sourceFile.hasHeaderGuard()) {
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
