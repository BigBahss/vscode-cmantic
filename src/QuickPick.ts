import * as vscode from 'vscode';


export interface QuickPick<Item extends vscode.QuickPickItem, DesiredProp> extends vscode.QuickPick<Item> {
    promptUser(): Promise<DesiredProp[] | undefined>;
}

export function createMultiQuickPick<Item extends vscode.QuickPickItem, DesiredProp>(
    keyOfDesiredProp: string
): QuickPick<Item, DesiredProp> {
    const quickPick = vscode.window.createQuickPick<Item>() as QuickPick<Item, DesiredProp>;
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;

    quickPick.promptUser = (): Promise<DesiredProp[] | undefined> => {
        quickPick.show();

        return new Promise(resolve => {
            quickPick.onDidHide(() => resolve(undefined));
            quickPick.onDidAccept(() => {
                const selectedProperties: DesiredProp[] = [];
                quickPick.selectedItems.forEach(item => {
                    Object.entries(item).forEach(([key, prop]) => {
                        if (key === keyOfDesiredProp) {
                            selectedProperties.push(prop);
                        }
                    });
                });
                resolve(selectedProperties);
                quickPick.hide();
                quickPick.selectedItems = [];
                quickPick.value = '';
            });
        });
    };

    return quickPick;
}
