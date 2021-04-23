import * as vscode from 'vscode';


const closeButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('close'),
    tooltip: 'Close (Escape)'
};

export interface SingleQuickPickOptions<T extends vscode.QuickPickItem = vscode.QuickPickItem> {
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    title: string;
    buttons?: ReadonlyArray<vscode.QuickInputButton>;
    onDidTriggerButton?(button: vscode.QuickInputButton, quickPick: vscode.QuickPick<T>): any;
}

export function showSingleQuickPick<T extends vscode.QuickPickItem>(
    items: T[], options: SingleQuickPickOptions, token?: vscode.CancellationToken
): Promise<T | undefined> {
    const qp = vscode.window.createQuickPick<T>();
    qp.items = items;
    qp.canSelectMany = false;
    setSharedQuickPickOptions(qp, options);

    return new Promise(resolve => {
        const disposables: vscode.Disposable[] = [
            qp,
            qp.onDidAccept(() => {
                resolve(qp.activeItems[0]);
                qp.hide();
            }),
            qp.onDidHide(() => {
                disposables.forEach(disposable => disposable.dispose());
                resolve(undefined);
            }),
            qp.onDidTriggerButton(button => {
                if (button === closeButton) {
                    qp.hide();
                }
            })
        ];

        if (options.onDidTriggerButton) {
            disposables.push(qp.onDidTriggerButton(button => {
                options.onDidTriggerButton!(button, qp);
            }));
        }

        if (token) {
            disposables.push(token.onCancellationRequested(() => qp.hide()));
        }

        qp.show();
    });
}

export interface MultiQuickPickOptions<
    T extends vscode.QuickPickItem = vscode.QuickPickItem
> extends SingleQuickPickOptions {
    onDidChangeSelection?(items: T[], quickPick: vscode.QuickPick<T>): any;
}

export function showMultiQuickPick<T extends vscode.QuickPickItem>(
    items: T[], options: MultiQuickPickOptions<T>, token?: vscode.CancellationToken
): Promise<T[] | undefined> {
    const qp = vscode.window.createQuickPick<T>();
    qp.items = items;
    qp.canSelectMany = true;
    setSharedQuickPickOptions(qp, options);

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
            }),
            qp.onDidTriggerButton(button => {
                if (button === closeButton) {
                    qp.hide();
                }
            })
        ];

        if (options.onDidTriggerButton) {
            disposables.push(qp.onDidTriggerButton(button => {
                options.onDidTriggerButton!(button, qp);
            }));
        }

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

function setSharedQuickPickOptions(qp: vscode.QuickPick<any>, options: SingleQuickPickOptions | MultiQuickPickOptions): void {
    qp.matchOnDescription = !!options.matchOnDescription;
    qp.matchOnDetail = !!options.matchOnDetail;
    qp.placeholder = options.placeHolder;
    qp.ignoreFocusOut = !!options.ignoreFocusOut;
    qp.title = options.title;
    qp.buttons = options.buttons ? [...options.buttons, closeButton] : [closeButton];
}
