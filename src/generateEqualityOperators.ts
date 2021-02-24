import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { logger } from './logger';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { ProposedPosition } from './ProposedPosition';


export const title = 'Generate equality operators';

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noDocumentSymbol: 'No document symbol detected.',
    notHeaderFile: 'This file is not a header file.',
    noClassOrStruct: 'No class or struct detected.',
    operatorExists: 'An equality operator already exists.'
};

interface MemberVariableQuickPickItem extends vscode.QuickPickItem {
    memberVariable: CSymbol;
}

export async function generateEqualityOperators(
    classOrStruct: CSymbol,
    classDoc: SourceDocument,
    matchingUri: vscode.Uri
): Promise<void> {
    const memberVariables = classOrStruct.memberVariables();

    const memberVariablesItems: MemberVariableQuickPickItem[] = [];
    memberVariables.forEach(memberVariable => {
        const convertedMemberVariable = new CSymbol(memberVariable, classOrStruct.document);
        memberVariablesItems.push({
            label: '$(symbol-field) ' + convertedMemberVariable.name,
            description: convertedMemberVariable.text(),
            memberVariable: convertedMemberVariable,
            picked: true
        });
    });

    const selectedIems = await vscode.window.showQuickPick<MemberVariableQuickPickItem>(memberVariablesItems, {
        matchOnDescription: true,
        placeHolder: 'What member variables would you like to compare?',
        canPickMany: true
    });

    if (!selectedIems) {
        return;
    }

    const selectedMemberVariables: CSymbol[] = [];
    selectedIems.forEach(item => selectedMemberVariables.push(item.memberVariable));

    const position = classOrStruct.findPositionForNewMemberFunction();
    if (!position) {
        return;
    }

    const definition = constructEqualityOperators(classOrStruct, classDoc, selectedMemberVariables, position);
    if (!definition) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.insert(classDoc.uri, position, definition);
    await vscode.workspace.applyEdit(workspaceEdit);
}

function constructEqualityOperators(
    classOrStruct: CSymbol,
    classDoc: SourceDocument,
    memberVariables: CSymbol[],
    position: ProposedPosition
): string | undefined {
    const eol = classDoc.endOfLine;
    const indentation = util.indentation();
    const curlySeparator = (cfg.functionCurlyBraceFormat('cpp') === cfg.CurlyBraceFormat.NewLine) ? eol : ' ';

    let definitions = 'bool operator==(const ' + classOrStruct.name + ' &other) const' + curlySeparator + '{' + eol + indentation;
    let expression = '';
    memberVariables.forEach(memberVariable => {
        expression += memberVariable.name + ' == other.' + memberVariable.name + eol + indentation + indentation + '&& ';
    });

    if (expression) {
        expression = expression.slice(0, -3).trimEnd();
        definitions += 'return ' + expression + ';';
    }
    definitions += eol + '}' + eol + 'bool operator!=(const ' + classOrStruct.name + ' &other) const { return !operator==(other); }';

    return position.formatTextToInsert(definitions, classDoc);
}
