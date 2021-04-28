import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from 'vscode-test';


async function main(): Promise<void> {
	try {
		const rootPath = path.resolve(__dirname, '..', '..');
		const extensionTestsPath = path.join(__dirname, 'suite', 'index');
        const testWorkspacePath = path.join(rootPath, 'test', 'workspace');

        const executablePath = await downloadAndUnzipVSCode(process.env.CODE_VERSION);
        const cliPath = resolveCliPathFromVSCodeExecutablePath(executablePath);

        // Install a C/C++ language server extension needed to run tests, in this case cpptools.
        cp.spawnSync(cliPath, ['--install-extension', 'ms-vscode.cpptools', '--force'], {
            encoding: 'utf-8',
            stdio: 'inherit'
        });

        await runTests({
            vscodeExecutablePath: executablePath,
            extensionDevelopmentPath: rootPath,
            extensionTestsPath: extensionTestsPath,
            launchArgs: [
                testWorkspacePath,
                '--user-data-dir',
                path.join(__dirname, '.test_data_dir')
            ],
            version: process.env.CODE_VERSION
        });
	} catch (error) {
		console.error(`Failed to run tests: ${error.message}`);
		process.exit(1);
	}
}

main();
