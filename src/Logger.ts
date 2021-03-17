import * as vscode from 'vscode';
import * as cfg from './configuration';


export default class Logger extends vscode.Disposable {
    private readonly output: vscode.OutputChannel;

    constructor(name: string) {
        super(() => this.output.dispose());
        this.output = vscode.window.createOutputChannel(name);
    }

    logInfo(message: string): void { this.output.appendLine(`[${this.getTimeString()}  Info] ${message}`); }

    logWarn(message: string): void { this.output.appendLine(`[${this.getTimeString()}  Warn] ${message}`); }

    logError(message: string): void { this.output.appendLine(`[${this.getTimeString()} Error] ${message}`); }

    async alertInformation(message: string): Promise<void> {
        this.logInfo(message);
        if (cfg.alertLevel() === cfg.AlertLevel.Info) {
            await vscode.window.showInformationMessage(message);
        }
    }

    async alertWarning(message: string): Promise<void> {
        this.logWarn(message);
        if (cfg.alertLevel() >= cfg.AlertLevel.Warn) {
            await vscode.window.showWarningMessage(message);
        }
    }

    async alertError(message: string): Promise<void> {
        this.logError(message);
        await vscode.window.showErrorMessage(message);
    }

    private getTimeString(): string {
        const date = new Date();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        return `${(hours < 10 ? '0' : '') + hours}:${(minutes < 10 ? '0' : '') + minutes}:${(seconds < 10 ? '0' : '') + seconds}`;
    }
}
