import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as parse from '../../src/parsing';
import SourceDocument from '../../src/SourceDocument';
import SourceSymbol from '../../src/SourceSymbol';
import CSymbol from '../../src/CSymbol';
import { CodeAction, CodeActionProvider } from '../../src/CodeActionProvider';
import {
    activeLanguageServer,
    commands,
    cpptoolsId,
    getMatchingHeaderSource,
    LanguageServer,
    setActiveLanguageServer
} from '../../src/extension';
import { getClass, re_validSymbolName, wait } from './helpers';


suite('Extension Test Suite', function () {
    this.timeout(60_000);

    const rootPath = path.resolve(__dirname, '..', '..', '..');
    const testWorkspacePath = path.join(rootPath, 'test', 'workspace');

    let sourceDoc: SourceDocument;

    suiteSetup(async function () {
        const cpptools = vscode.extensions.getExtension(cpptoolsId);
        assert(cpptools);
        if (!cpptools.isActive) {
            await cpptools.activate();
        }
        assert(cpptools.isActive);

        const testFilePath = path.join(testWorkspacePath, 'include', 'derived.h');
        const editor = await vscode.window.showTextDocument(vscode.Uri.file(testFilePath));
        const cppDoc = await vscode.languages.setTextDocumentLanguage(editor.document, 'cpp');
        sourceDoc = new SourceDocument(cppDoc);

        setActiveLanguageServer();

        // Wait until the language server is initialized.
        do {
            await wait(1_500);
            await sourceDoc.executeSourceSymbolProvider();
        } while (!sourceDoc.symbols);
    });

    test('Test setActiveLanguageServer()', function () {
        setActiveLanguageServer();
        assert.strictEqual(activeLanguageServer(), LanguageServer.cpptools);
    });

    test('Test getMatchingHeaderSource()', async function () {
        this.slow(400);

        const expectedPath = path.join(testWorkspacePath, 'src', 'derived.cpp');
        const matchingUri = await getMatchingHeaderSource(sourceDoc.uri);
        assert.strictEqual(matchingUri?.fsPath, expectedPath);

        const originalUri = await getMatchingHeaderSource(matchingUri);
        assert.strictEqual(originalUri?.fsPath, sourceDoc.uri.fsPath);
    });

    test('Test SourceSymbol Hierarchy', function () {
        assert(sourceDoc.symbols);

        function traverseSymbolTree(symbols: SourceSymbol[]): void {
            symbols.forEach(symbol => {
                assert.match(symbol.name, re_validSymbolName);

                symbol.children.forEach(child => {
                    assert.strictEqual(child.parent, symbol);
                });

                traverseSymbolTree(symbol.children);
            });
        }

        traverseSymbolTree(sourceDoc.symbols);
    });

    test('Test CodeActionProvider', async function () {
        this.slow(2_500);

        const codeActionProvider = new CodeActionProvider();

        const sourceActions: CodeAction[] = await codeActionProvider.provideCodeActions(
                sourceDoc, sourceDoc.rangeAt(0, 0), { diagnostics: [], only: vscode.CodeActionKind.Source });
        assert(sourceActions.length >= 3);
        assert.match(sourceActions[0].title, /^(Add|Amend) Header Guard$/);
        assert.strictEqual(sourceActions[1].title, 'Add Include');
        assert.strictEqual(sourceActions[2].title, 'Create Matching Source File');

        const testClass = getClass(sourceDoc);

        const refactorActions: CodeAction[] = await codeActionProvider.provideCodeActions(
                sourceDoc, testClass.selectionRange, { diagnostics: [], only: vscode.CodeActionKind.Refactor });
        assert(refactorActions.length >= 4);
        assert.strictEqual(refactorActions[0].title, `Generate Equality Operators for "${testClass.name}"`);
        assert.strictEqual(refactorActions[1].title, `Generate Relational Operators for "${testClass.name}"`);
        assert.strictEqual(refactorActions[2].title, `Generate Stream Output Operator for "${testClass.name}"`);
        assert.strictEqual(refactorActions[3].title, 'Add Definitions...');

        assert(testClass.children.length > 0);

        for (const child of testClass.children) {
            const codeActions: CodeAction[] = await codeActionProvider.provideCodeActions(
                    sourceDoc, child.selectionRange, { diagnostics: [] });

            const member = new CSymbol(child, sourceDoc);
            if (member.isFunctionDeclaration()) {
                assert(codeActions.length >= 2);
                if (member.isConstructor()) {
                    assert.match(codeActions[0].title, /^Generate Constructor in (".+"|matching source file)$/);
                    assert.strictEqual(codeActions[1].title, 'Generate Constructor in this file');
                } else {
                    assert.match(codeActions[0].title, /^Add Definition in (".+"|matching source file)$/);
                    assert.strictEqual(codeActions[1].title, 'Add Definition in this file');
                }
            } else if (member.isFunctionDefinition()) {
                assert(codeActions.length >= 3);
                assert.match(codeActions[0].title, /^Add Declaration/);
                assert.match(codeActions[1].title, /^Move Definition to (".+"|matching source file)$/);
                assert.strictEqual(codeActions[2].title, 'Move Definition below class body');
            } else if (member.isMemberVariable()) {
                assert(codeActions.length >= 3);
                assert.strictEqual(codeActions[0].title, `Generate Getter and Setter for "${member.name}"`);
                assert.strictEqual(codeActions[1].title, `Generate Getter for "${member.name}"`);
                assert.strictEqual(codeActions[2].title, `Generate Setter for "${member.name}"`);
            }
        }
    });

    test('Test Parsing Functions', function () {
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

    test('Test Command Registration', function () {
        const packageJsonPath = path.join(rootPath, 'package.json');
        const packageJson = fs.readFileSync(packageJsonPath, { encoding: 'utf8', flag: 'r' });

        const contributedCommands = JSON.parse(packageJson).contributes.commands;
        assert(contributedCommands instanceof Array);

        contributedCommands.forEach((contributedCommand: { command: string }) => {
            assert(
                Object.keys(commands).some(command => command === contributedCommand.command),
                `Add '${contributedCommand.command}' to commands in 'src/extension.ts' so that it gets registered.`
            );
        });
    });
});
