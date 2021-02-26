import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { SourceDocument } from '../../src/SourceDocument';
import { SourceSymbol } from '../../src/SourceSymbol';
import { CSymbol } from '../../src/CSymbol';
import { CodeActionProvider } from '../../src/codeActions';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

function getClass(symbols: SourceSymbol[]): SourceSymbol {
    for (const documentSymbol of symbols) {
        if (documentSymbol.kind === vscode.SymbolKind.Class) {
            return documentSymbol;
        }
    }
    throw new Error('Class not found.');
}

async function getCodeActions(uri: vscode.Uri, rangeOrSelection: vscode.Range | vscode.Selection): Promise<vscode.CodeAction[]> {
    const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider', uri, rangeOrSelection);
    if (!codeActions) {
        throw new Error('CodeActions[] are undefined.');
    }
    return codeActions;
}

suite('Extension Test Suite', function () {
    this.timeout(60000);
    vscode.window.showInformationMessage('Start all tests.');

    const rootPath = path.resolve(__dirname, '../../../');
	const testFilePath = rootPath + '/test/workspace/include/derived.h';
    const testFileUri = vscode.Uri.file(testFilePath);

    const codeActionProvider = new CodeActionProvider();

    suiteSetup(async () => {
        const cpptools = vscode.extensions.getExtension("ms-vscode.cpptools");
        if (cpptools && !cpptools.isActive) {
            await cpptools.activate();
        }
        await vscode.commands.executeCommand('vscode.open', testFileUri);
    });

    test('Test CodeActionProvider', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('Active text editor is undefined.');
        }

        await wait(4000);

        const sourceDoc = new SourceDocument(editor.document);
        await sourceDoc.executeSourceSymbolProvider();
        if (!sourceDoc.symbols) {
            throw new Error('sourceDoc.symbols is undefined.');
        }

        const testClass = getClass(sourceDoc.symbols);
        if (testClass.children.length === 0) {
            throw new Error('Class has no children.');
        }

        for (const child of testClass.children) {
            const codeActions = await codeActionProvider.provideCodeActions(sourceDoc, child.selectionRange, { diagnostics: [] });
            if (codeActions.length === 0) {
                throw new Error('CodeActions[] are empty.');
            }

            const member = new CSymbol(child, sourceDoc);
            if (member.isFunctionDeclaration()) {
                if (member.isConstructor()) {
                    assert.match(codeActions[0].title, /^Generate Constructor/i);
                } else {
                    assert.match(codeActions[0].title, /^Add Definition/i);
                }
                assert.strictEqual(codeActions.length, 5);
            } else if (member.isFunctionDefinition()) {
                assert.match(codeActions[0].title, /^Move Definition/i);
                assert.strictEqual(codeActions.length, 5);
            } else if (member.isMemberVariable()) {
                assert.match(codeActions[0].title, /^Generate Getter/i);
                assert.strictEqual(codeActions.length, 6);
            }
        }

        console.log('Success');
    });
});
