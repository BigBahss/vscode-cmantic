import * as path from 'path';
import * as fs from 'fs';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from 'vscode-test';


async function main() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../');
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const extensionTestWorkspacePath = path.resolve(__dirname, 'workspace');

        const executablePath = await downloadAndUnzipVSCode();
        const cliPath = resolveCliPathFromVSCodeExecutablePath(executablePath);
        const dataDir = process.platform === 'darwin'
                ? path.join(path.dirname(executablePath), 'code-portable-data')
                : path.join(path.dirname(executablePath), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        // Install a C/C++ language server extension needed to run tests, in this case cpptools.
        cp.spawnSync(cliPath, ['--install-extension', 'ms-vscode.cpptools', '--force'], {
            encoding: 'utf-8',
            stdio: 'inherit'
        });

        await runTests({
            vscodeExecutablePath: executablePath,
            extensionDevelopmentPath: extensionDevelopmentPath,
            extensionTestsPath: extensionTestsPath,
            launchArgs: [extensionTestWorkspacePath]
        });
	} catch (error) {
		console.error(`Failed to run tests: ${error.message}`);
		process.exit(1);
	}
}

main();
