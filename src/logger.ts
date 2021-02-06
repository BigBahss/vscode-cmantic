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
        this.output.appendLine(`[${this.getTimeString()}  Info] ${message}`);
        return vscode.window.showInformationMessage(message, ...items);
    }

    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
    {
        this.output.appendLine(`[${this.getTimeString()}  Warn] ${message}`);
        return vscode.window.showWarningMessage(message, ...items);
    }

    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>
    {
        this.output.appendLine(`[${this.getTimeString()} Error] ${message}`);
        return vscode.window.showErrorMessage(message, ...items);
    }

    private getTimeString(): string
    {
        const date = new Date();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        return `${(hours < 10 ? '0' : '') + hours}:${(minutes < 10 ? '0' : '') + minutes}:${(seconds < 10 ? '0' : '') + seconds}`;
    }
}
