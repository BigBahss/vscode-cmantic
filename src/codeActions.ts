import * as vscode from 'vscode';
import * as c from './cmantics';
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
        // TODO: Clean up this mess.
        const sourceFile = new c.SourceFile(document);

        const [matchingUri, symbol] = await Promise.all([
            sourceFile.findMatchingSourceFile(),
            sourceFile.getSymbol(rangeOrSelection.start)
        ]);
        const existingDefinition = await symbol?.findDefinition();

        let sourceTitle = 'Add Definition';
        let sourceDisabled: { readonly reason: string } | undefined;
        let currentDisabled: { readonly reason: string } | undefined;
        let newSourceDisabled: { readonly reason: string } | undefined;

        if (symbol?.isConstexpr()) {
            sourceDisabled = { reason: failReason.isConstexpr };
        }
        if (symbol?.isInline()) {
            sourceDisabled = { reason: failReason.isInline };
        }
        if (!symbol?.isFunctionDeclaration()) {
            sourceDisabled = { reason: failReason.notFunctionDeclaration };
            currentDisabled = sourceDisabled;
        }
        if (existingDefinition) {
            sourceDisabled = { reason: failReason.definitionExists };
            currentDisabled = sourceDisabled;
        }
        if (!sourceFile.isHeader()) {
            sourceDisabled = { reason: failReason.notHeaderFile };
            newSourceDisabled = sourceDisabled;
            sourceTitle += ' in matching source file';
        } else if (matchingUri) {
            newSourceDisabled = { reason: 'A matching source file already exists' };
            // TODO: Elide the path if it is very long.
            sourceTitle += ' in "' + util.workspaceRelativePath(matchingUri.path) + '"';
        } else {
            sourceDisabled = { reason: failReason.noMatchingSourceFile };
            sourceTitle += ' in matching source file';
        }

        return [{
            title: sourceTitle,
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: sourceTitle,
                command: 'cmantic.addDefinition',
                arguments: [symbol, sourceFile, matchingUri]
            },
            disabled: sourceDisabled
        },
        {
            title: 'Add Definition in this file',
            kind: vscode.CodeActionKind.Refactor,
            command: {
                title: 'Add Definition in this file',
                command: 'cmantic.addDefinition',
                arguments: [symbol, sourceFile, sourceFile.uri]
            },
            disabled: currentDisabled
        },
        {
            title: 'Add Include',
            kind: vscode.CodeActionKind.Source,
            command: {
                title: 'Add Include',
                command: 'cmantic.addInclude'
            }
        },
        {
            title: 'Create Matching Source File',
            kind: vscode.CodeActionKind.Source,
            command: {
                title: 'Create Matching Source File',
                command: 'cmantic.createMatchingSourceFile'
            },
            disabled: newSourceDisabled
        }];
    }

    public resolveCodeAction(
        codeAction: vscode.CodeAction,
        token: vscode.CancellationToken,
    ): vscode.CodeAction {
        return codeAction;
    }
}
