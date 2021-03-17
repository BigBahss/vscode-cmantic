import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as xregexp from 'xregexp';
import { SourceDocument } from '../../src/SourceDocument';
import { SourceSymbol } from '../../src/SourceSymbol';
import { CSymbol } from '../../src/CSymbol';
import { CodeActionProvider } from '../../src/codeActions';
import * as parse from '../../src/parsing';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

function getClass(symbols: SourceSymbol[]): SourceSymbol {
    for (const documentSymbol of symbols) {
        if (documentSymbol.kind === vscode.SymbolKind.Class) {
            return documentSymbol;
        }
    }
    throw new Error('Class not found.');
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
            const codeActions = await codeActionProvider.provideCodeActions(
                    sourceDoc, child.selectionRange, { diagnostics: [] });
            if (codeActions.length === 0) {
                throw new Error('CodeActions[] are empty.');
            }

            const member = new CSymbol(child, sourceDoc);
            if (member.isFunctionDeclaration()) {
                if (member.isConstructor()) {
                    assert.match(codeActions[0].title, /^Generate Constructor/);
                } else {
                    assert.match(codeActions[0].title, /^Add Definition/);
                }
                assert.strictEqual(codeActions.length, 5);
            } else if (member.isFunctionDefinition()) {
                assert.match(codeActions[0].title, /^Add Declaration/);
                assert.match(codeActions[1].title, /^Move Definition/);
                assert.strictEqual(codeActions.length, 6);
            } else if (member.isMemberVariable()) {
                assert.match(codeActions[0].title, /^Generate Getter/);
                assert.strictEqual(codeActions.length, 6);
            }
        }
    });

    test('Test Parsing Functions', () => {
        /* Since we depend on the specific error message thrown from XRegExp.matchRecursive() in
         * order to mask unbalanced delimiters, we meed to test wether the error message has
         * changed in new versions. If the error message has changed then these functions will
         * throw and fail the test. */

        const parentheses = parse.maskParentheses('(foo))');
        assert.strictEqual(parentheses, '(   ) ');

        const braces = parse.maskBraces('{foo}}');
        assert.strictEqual(braces, '{   } ');

        const brackets = parse.maskBrackets('[foo]]');
        assert.strictEqual(brackets, '[   ] ');

        const angleBrackets = parse.maskAngleBrackets('<foo>>');
        assert.strictEqual(angleBrackets, '<   > ');
    });
});
