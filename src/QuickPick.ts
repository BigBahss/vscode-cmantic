import * as vscode from 'vscode';


const closeButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('close'),
    tooltip: 'Close (Escape)'
};

export interface QuickPickOptions<T extends vscode.QuickPickItem = vscode.QuickPickItem> {
    title: string;  // Required (Must not be empty)
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    placeHolder?: string;
    ignoreFocusOut?: boolean;
    value?: string;
    onDidChangeValue?(value: string, quickPick: vscode.QuickPick<T>): any;
    buttons?: ReadonlyArray<vscode.QuickInputButton>;
    onDidTriggerButton?(button: vscode.QuickInputButton, quickPick: vscode.QuickPick<T>): any;
    onWillAccept?(quickPick: vscode.QuickPick<T>): boolean;
}

export interface SingleQuickPickOptions<
    T extends vscode.QuickPickItem = vscode.QuickPickItem
> extends QuickPickOptions<T> {
    onDidChangeSelection?(item: T | undefined, quickPick: vscode.QuickPick<T>): any;
}

export function showSingleQuickPick<T extends vscode.QuickPickItem>(
    items: T[], options: SingleQuickPickOptions<T>, token?: vscode.CancellationToken
): Promise<T | undefined> {
    const qp = vscode.window.createQuickPick<T>();
    setSharedQuickPickOptions(qp, options);
    qp.canSelectMany = false;
    qp.items = items;

    return new Promise(resolve => {
        const disposables: vscode.Disposable[] = [
            qp,
            qp.onDidAccept(() => {
                const accepted = options.onWillAccept ? options.onWillAccept(qp) : true;
                if (accepted) {
                    resolve(qp.selectedItems[0]);
                    qp.hide();
                }
            }),
            qp.onDidHide(() => {
                disposables.forEach(disposable => disposable.dispose());
                resolve(undefined);
            }),
            qp.onDidTriggerButton(button => {
                if (options.onDidTriggerButton) {
                    options.onDidTriggerButton(button, qp);
                }
                if (button === closeButton) {
                    qp.hide();
                }
            })
        ];

        if (options.onDidChangeValue) {
            disposables.push(qp.onDidChangeValue(value => {
                options.onDidChangeValue!(value, qp);
            }));
        }

        if (options.onDidChangeSelection) {
            disposables.push(qp.onDidChangeSelection(items => {
                options.onDidChangeSelection!(items[0], qp);
            }));
        }

        if (token) {
            disposables.push(token.onCancellationRequested(() => qp.hide()));
        }

        qp.show();
        qp.value = options.value ?? '';
    });
}

export interface MultiQuickPickOptions<
    T extends vscode.QuickPickItem = vscode.QuickPickItem
> extends QuickPickOptions<T> {
    onDidChangeSelection?(items: T[], quickPick: vscode.QuickPick<T>): any;
}

export function showMultiQuickPick<T extends vscode.QuickPickItem>(
    items: T[], options: MultiQuickPickOptions<T>, token?: vscode.CancellationToken
): Promise<T[] | undefined> {
    const qp = vscode.window.createQuickPick<T>();
    setSharedQuickPickOptions(qp, options);
    qp.canSelectMany = true;
    qp.items = items;
    qp.selectedItems = qp.items.filter(item => item.picked);

    return new Promise(resolve => {
        const disposables: vscode.Disposable[] = [
            qp,
            qp.onDidAccept(() => {
                const accepted = options.onWillAccept ? options.onWillAccept(qp) : true;
                if (accepted) {
                    resolve(qp.selectedItems.slice());
                    qp.hide();
                }
            }),
            qp.onDidHide(() => {
                disposables.forEach(disposable => disposable.dispose());
                resolve(undefined);
            }),
            qp.onDidTriggerButton(button => {
                if (options.onDidTriggerButton) {
                    options.onDidTriggerButton(button, qp);
                }
                if (button === closeButton) {
                    qp.hide();
                }
            })
        ];

        if (options.onDidChangeValue) {
            disposables.push(qp.onDidChangeValue(value => {
                options.onDidChangeValue!(value, qp);
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
        qp.value = options.value ?? '';
    });
}

function setSharedQuickPickOptions<T extends vscode.QuickPickItem>(
    qp: vscode.QuickPick<T>, options: QuickPickOptions<T>
): void {
    qp.matchOnDescription = !!options.matchOnDescription;
    qp.matchOnDetail = !!options.matchOnDetail;
    qp.placeholder = options.placeHolder;
    qp.ignoreFocusOut = !!options.ignoreFocusOut;
    qp.title = options.title;
    qp.buttons = options.buttons ? [...options.buttons, closeButton] : [closeButton];
}
