import * as vscode from 'vscode';


export class Logger extends vscode.Disposable
{
    private readonly output: vscode.OutputChannel;

    constructor()
    {
        super(() => this.output.dispose());
        this.output = vscode.window.createOutputChannel('C-mantic');
    }

    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>
    {
        this.output.appendLine(message);
        return vscode.window.showInformationMessage(message, ...items);
    }

    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
    {
        this.output.appendLine(message);
        return vscode.window.showWarningMessage(message, ...items);
    }

    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>
    {
        this.output.appendLine(message);
        return vscode.window.showErrorMessage(message, ...items);
    }
}
