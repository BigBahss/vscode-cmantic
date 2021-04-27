import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as process from 'process';
import * as parse from '../../src/parsing';
import SourceDocument from '../../src/SourceDocument';
import SourceSymbol from '../../src/SourceSymbol';
import CSymbol from '../../src/CSymbol';
import { promisify } from 'util';
import { CodeAction, CodeActionProvider } from '../../src/CodeActionProvider';
import { commands, cpptoolsId } from '../../src/extension';

const setTimeoutPromised = promisify(setTimeout);

function wait(ms: number): Promise<void> {
    return setTimeoutPromised(ms);
}

function getClass(symbols: SourceSymbol[]): SourceSymbol {
    for (const symbol of symbols) {
        if (symbol.isClass()) {
            return symbol;
        }
    }
    throw new Error('Class not found.');
}

suite('Extension Test Suite', function () {
    /* The CI will sometimes take a very long time to download cpptool's native binary,
     * which caused tests to timeout and fail. So we set the timeout to 5 minutes for
     * the CI (1 minute timeout for local tests). */
    this.timeout(process.env.CI ? 300_000 : 60_000);

    const rootPath = path.resolve(__dirname, '..', '..', '..');

    const packageJsonPath = path.join(rootPath, 'package.json');
    const packageJson = fs.readFileSync(packageJsonPath, { encoding: 'utf8', flag: 'r' });

	const testFilePath = path.join(rootPath, 'test', 'workspace', 'include', 'derived.h');
    const testFileUri = vscode.Uri.file(testFilePath);

    let sourceDoc: SourceDocument | undefined;

    suiteSetup(async () => {
        const cpptools = vscode.extensions.getExtension(cpptoolsId);
        assert(cpptools);
        if (!cpptools.isActive) {
            await cpptools.activate();
        }
        assert(cpptools.isActive);

        const editor = await vscode.window.showTextDocument(testFileUri);
        sourceDoc = new SourceDocument(editor.document);
    });

    test('Test CodeActionProvider', async () => {
        assert(sourceDoc);

        // Wait until the language server is initialized.
        const waitTime = process.env.CI ? 5_000 : 1_000;
        do {
            await wait(waitTime);
            await sourceDoc.executeSourceSymbolProvider();
        } while (!sourceDoc.symbols);

        const testClass = getClass(sourceDoc.symbols);
        assert(testClass.children.length > 0);

        const codeActionProvider = new CodeActionProvider();

        for (const child of testClass.children) {
            const codeActions: CodeAction[] = await codeActionProvider.provideCodeActions(
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
        const contributedCommands = JSON.parse(packageJson).contributes.commands;
        assert(contributedCommands instanceof Array);

        contributedCommands.forEach((contributedCommand: ContributedCommand) => {
            assert(
                Object.keys(commands).some(command => command === contributedCommand.command),
                `Add '${contributedCommand.command}' to commands in 'src/extension.ts' so that it gets registered.`
            );
        });
    });
});
