import * as vscode from 'vscode';
import { CSymbol, SourceFile } from './cmantics';
import * as util from './utility';
import { failReason } from './addDefinition';


export class CodeActionProvider implements vscode.CodeActionProvider
{
    public async provideCodeActions(
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

    public resolveCodeAction(
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

    let addDefinitionInMatchingSourceFileTitle = 'Add Definition';
    let addDefinitionInMatchingSourceFileDisabled: { readonly reason: string } | undefined;
    let addDefinitionInCurrentFileDisabled: { readonly reason: string } | undefined;

    if (symbol?.isInline()) {
        addDefinitionInMatchingSourceFileDisabled = { reason: failReason.isInline };
    }
    if (symbol?.isConstexpr()) {
        addDefinitionInMatchingSourceFileDisabled = { reason: failReason.isConstexpr };
    }
    if (existingDefinition) {
        addDefinitionInMatchingSourceFileDisabled = { reason: failReason.definitionExists };
        addDefinitionInCurrentFileDisabled = addDefinitionInMatchingSourceFileDisabled;
    }
    if (!sourceFile.isHeader()) {
        addDefinitionInMatchingSourceFileDisabled = { reason: failReason.notHeaderFile };
        addDefinitionInMatchingSourceFileTitle += ' in matching source file';
    } else if (matchingUri) {
        // TODO: Elide the path if it is very long.
        addDefinitionInMatchingSourceFileTitle += ' in "' + util.workspaceRelativePath(matchingUri.path) + '"';
    } else {
        addDefinitionInMatchingSourceFileDisabled = { reason: failReason.noMatchingSourceFile };
        addDefinitionInMatchingSourceFileTitle += ' in matching source file';
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
        title: 'Add Definition in this file',
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: 'Add Definition in this file',
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
    return [{
        title: 'Generate \'get\' and \'set\' methods',
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: 'Generate \'get\' and \'set\' methods',
            command: 'cmantic.generateGetterSetterFor',
            arguments: [symbol]
        }
    },
    {
        title: 'Generate \'get\' method',
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: 'Generate \'get\' method',
            command: 'cmantic.generateGetterFor',
            arguments: [symbol]
        }
    },
    {
        title: 'Generate \'set\' method',
        kind: vscode.CodeActionKind.Refactor,
        command: {
            title: 'Generate \'set\' method',
            command: 'cmantic.generateSetterFor',
            arguments: [symbol]
        }
    }];
}

async function getSourceActions(
    sourceFile: SourceFile,
    matchingUri?: vscode.Uri
): Promise<vscode.CodeAction[]> {
    let createMatchingSourceFileDisabled: { readonly reason: string } | undefined;
    let addHeaderGuardDisabled: { readonly reason: string } | undefined;

    if (!sourceFile.isHeader()) {
        createMatchingSourceFileDisabled = { reason: failReason.notHeaderFile };
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
