import * as vscode from 'vscode';


export interface MultiQuickPickOptions<T extends vscode.QuickPickItem = vscode.QuickPickItem> {
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    title?: string;
    onDidChangeSelection?(items: T[], quickPick: vscode.QuickPick<T>): any;
}

export function showMultiQuickPick<T extends vscode.QuickPickItem>(
    items: T[], options: MultiQuickPickOptions, token?: vscode.CancellationToken
): Promise<T[] | undefined> {
    const qp = vscode.window.createQuickPick<T>();
    qp.items = items;
    qp.canSelectMany = true;
    qp.matchOnDescription = !!options.matchOnDescription;
    qp.matchOnDetail = !!options.matchOnDetail;
    qp.placeholder = options.placeHolder;
    qp.ignoreFocusOut = !!options.ignoreFocusOut;
    qp.title = options.title;

    return new Promise(resolve => {
        const disposables: vscode.Disposable[] = [
            qp,
            qp.onDidAccept(() => {
                resolve(qp.selectedItems.slice());
                qp.hide();
            }),
            qp.onDidHide(() => {
                disposables.forEach(disposable => disposable.dispose());
                resolve(undefined);
            })
        ];

        if (options.onDidChangeSelection) {
            disposables.push(qp.onDidChangeSelection(items => {
                options.onDidChangeSelection!(items, qp);
            }));
        }

        if (token) {
            disposables.push(token.onCancellationRequested(() => qp.hide()));
        }

        qp.show();
    });
}
