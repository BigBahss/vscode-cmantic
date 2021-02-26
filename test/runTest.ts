import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

        const extensionTestWorkspacePath = path.resolve(__dirname, 'workspace');

		// Download VS Code, unzip it and run the integration test
		await runTests({
            extensionDevelopmentPath: extensionDevelopmentPath,
            extensionTestsPath: extensionTestsPath,
            launchArgs: [extensionTestWorkspacePath]
        });
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
