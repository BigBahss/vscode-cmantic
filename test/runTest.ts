import * as path from 'path';
import * as fs from 'fs';
import * as process from 'process';

import { downloadAndUnzipVSCode, runTests } from 'vscode-test';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

        const extensionTestWorkspacePath = path.resolve(__dirname, 'workspace');

        const executablePath = await downloadAndUnzipVSCode();
        const executableDir = path.dirname(executablePath);
        const executableScriptPath = path.join(executableDir, 'bin', 'code');
        const dataDir = process.platform === 'darwin'
                ? path.join(executableDir, 'code-portable-data')
                : path.join(executableDir, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        /* We need to install cpptools to run tests, and for some reason the '--install-extension'
         * flag doesn't work with the executable, but does work with the 'code' script file.
         * Additionally, the script doesn't seem to actually open the window when installing an
         * extension, so we need to run this twice, later with the actual executable path in order
         * to run the tests. */
		await runTests({
            vscodeExecutablePath: executableScriptPath,
            extensionDevelopmentPath: extensionDevelopmentPath,
            extensionTestsPath: extensionTestsPath,
            launchArgs: ['--install-extension', 'ms-vscode.cpptools', '--force']
        });

        await runTests({
            vscodeExecutablePath: executablePath,
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
