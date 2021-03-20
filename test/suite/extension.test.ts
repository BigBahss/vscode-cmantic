import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as parse from '../../src/parsing';
import SourceDocument from '../../src/SourceDocument';
import SourceSymbol from '../../src/SourceSymbol';
import CSymbol from '../../src/CSymbol';
import { CodeActionProvider } from '../../src/codeActions';
import { extensionId, commands } from '../../src/extension';

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
        const cpptools = vscode.extensions.getExtension('ms-vscode.cpptools');
        if (cpptools && !cpptools.isActive) {
            await cpptools.activate();
        }
        await vscode.commands.executeCommand('vscode.open', testFileUri);
    });

    test('Test CodeActionProvider', async () => {
        const editor = vscode.window.activeTextEditor;
        assert(editor);

        await wait(4000);

        const sourceDoc = new SourceDocument(editor.document);
        await sourceDoc.executeSourceSymbolProvider();
        assert(sourceDoc.symbols);

        const testClass = getClass(sourceDoc.symbols);
        assert(testClass.children.length > 0);

        for (const child of testClass.children) {
            const codeActions = await codeActionProvider.provideCodeActions(
                    sourceDoc, child.selectionRange, { diagnostics: [] });
            assert(codeActions.length > 0);

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

    interface ContributedCommand { command: string; title: string }

    test('Test Registered Commands', () => {
        const contributedCommands = vscode.extensions.getExtension(extensionId)?.packageJSON.contributes.commands;
        assert(contributedCommands instanceof Array);

        contributedCommands.forEach((contributedCommand: ContributedCommand) => {
            assert(
                Object.keys(commands).some(command => command === contributedCommand.command),
                `Add '${contributedCommand.command}' to commands in 'src/extension.ts' so that it gets registered.`
            );
        });
    });
});
