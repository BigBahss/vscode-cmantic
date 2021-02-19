import * as vscode from 'vscode';
import * as cfg from './configuration';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './addDefinition';
import { failure as moveDefinitionFailure, title as moveDefinitionTitle } from './moveDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './generateGetterSetter';
import { failure as createSourceFileFailure } from './createSourceFile';
import { failure as addHeaderGuardFailure } from './addHeaderGuard';
import { getMatchingSourceFile, pushDisposable } from './extension';


export class CodeAction implements vscode.CodeAction {
    title: string;
    edit?: vscode.WorkspaceEdit;
    diagnostics?: vscode.Diagnostic[];
    command?: vscode.Command;
    kind?: vscode.CodeActionKind;
    isPreferred?: boolean;
    disabled?: { readonly reason: string };

    constructor(kind: vscode.CodeActionKind, title: string, command?: string) {
        this.kind = kind;
        this.title = title;
        if (command) {
            this.command = { title: title, command: command };
        }
    }

    setTitle(title: string): void {
        this.title = title;
        if (this.command) {
            this.command.title = title;
        }
    }

    setCommand(command: string): void {
        if (!this.command) {
            this.command = { title: this.title, command: command };
        } else {
            this.command.command = command;
        }
    }

    setArguments(...args: any[]): void {
        if (this.command) {
            this.command.arguments = args;
        }
    }

    disable(reason: string): void { this.disabled = { reason: reason }; }
}

export class RefactorAction extends CodeAction {
    constructor(title: string, command?: string) {
        super(vscode.CodeActionKind.Refactor, title, command);
    }
}

export class SourceAction extends CodeAction {
    constructor(title: string, command?: string) {
        super(vscode.CodeActionKind.Source, title, command);
    }
}

export class CodeActionProvider implements vscode.CodeActionProvider {
    private addDefinitionEnabled: boolean = cfg.enableAddDefinition();
    private moveDefinitionEnabled: boolean = cfg.enableMoveDefinition();
    private generateGetterSetterEnabled: boolean = cfg.enableGenerateGetterSetter();

    constructor() {
        pushDisposable(vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration(cfg.baseConfigurationString)) {
                this.addDefinitionEnabled = cfg.enableAddDefinition();
                this.moveDefinitionEnabled = cfg.enableMoveDefinition();
                this.generateGetterSetterEnabled = cfg.enableGenerateGetterSetter();
            }
        }));
    }

    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        _context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        const sourceDoc = new SourceDocument(document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(rangeOrSelection.start)
        ]);

        const [refactorings, sourceActions] = await Promise.all([
            this.getRefactorings(symbol, rangeOrSelection, sourceDoc, matchingUri),
            this.getSourceActions(sourceDoc, matchingUri)
        ]);

        return [...refactorings, ...sourceActions];
    }

    private async getRefactorings(
        symbol: CSymbol | undefined,
        rangeOrSelection: vscode.Range | vscode.Selection,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (this.addDefinitionEnabled && symbol?.isFunctionDeclaration()) {
            return await this.getFunctionDeclarationRefactorings(symbol, sourceDoc, matchingUri);
        } else if (this.moveDefinitionEnabled && symbol?.selectionRange.contains(rangeOrSelection.start)
                && symbol.isFunctionDefinition()) {
            return await this.getFunctionDefinitionRefactorings(symbol, sourceDoc, matchingUri);
        } else if (this.generateGetterSetterEnabled && symbol?.selectionRange.contains(rangeOrSelection.start)
                && symbol.isMemberVariable()) {
            return await this.getMemberVariableRefactorings(symbol, sourceDoc);
        }
        return [];
    }

    private async getFunctionDeclarationRefactorings(
        declaration: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        const existingDefinition = await declaration.findDefinition();

        const addDefinitionInMatchingSourceFile = new RefactorAction(addDefinitionTitle.matchingSourceFile);
        const addDefinitionInCurrentFile = new RefactorAction(addDefinitionTitle.currentFile);
        addDefinitionInMatchingSourceFile.setCommand('cmantic.addDefinition');
        addDefinitionInCurrentFile.setCommand('cmantic.addDefinition');
        addDefinitionInMatchingSourceFile.setArguments(declaration, sourceDoc, matchingUri);
        addDefinitionInCurrentFile.setArguments(declaration, sourceDoc, sourceDoc.uri);

        if (declaration.isInline()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isInline);
        } else if (declaration.isConstexpr()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isConstexpr);
        }

        if (existingDefinition) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.definitionExists);
            addDefinitionInCurrentFile.disable(addDefinitionFailure.definitionExists);
        }

        if (!sourceDoc.isHeader()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.notHeaderFile);
        } else if (matchingUri) {
            const displayPath = this.formatPathToDisplay(matchingUri);
            addDefinitionInMatchingSourceFile.setTitle(`Add Definition in "${displayPath}"`);
        } else {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.noMatchingSourceFile);
        }

        return [addDefinitionInMatchingSourceFile, addDefinitionInCurrentFile];
    }

    private async getFunctionDefinitionRefactorings(
        definition: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        const moveDefinitionToMatchingSourceFile = new RefactorAction(moveDefinitionTitle.matchingSourceFile);
        const moveDefinitionIntoOrOutOfClass = new RefactorAction(moveDefinitionTitle.intoOrOutOfClass);
        moveDefinitionToMatchingSourceFile.setCommand('cmantic.moveDefinitionToMatchingSourceFile');
        moveDefinitionIntoOrOutOfClass.setCommand('cmantic.moveDefinitionIntoOrOutOfClass');

        let declaration: CSymbol | undefined;
        let declarationDoc: SourceDocument | undefined;

        if (definition.parent?.isClassOrStruct()) {
            if (definition.parent.kind === vscode.SymbolKind.Class) {
                moveDefinitionIntoOrOutOfClass.setTitle(moveDefinitionTitle.outOfClass);
            } else {
                moveDefinitionIntoOrOutOfClass.setTitle(moveDefinitionTitle.outOfStruct);
            }
            declarationDoc = sourceDoc;
        } else {
            const declarationLocation = await definition.findDeclaration();
            if (declarationLocation !== undefined
                    && (declarationLocation?.uri.fsPath === definition.uri.fsPath
                    || declarationLocation?.uri.fsPath === matchingUri?.fsPath)) {
                declarationDoc = declarationLocation.uri.fsPath === sourceDoc.uri.fsPath
                        ? sourceDoc
                        : await SourceDocument.open(declarationLocation.uri);
                declaration = await declarationDoc.getSymbol(declarationLocation.range.start);

                if (declaration?.parent?.kind === vscode.SymbolKind.Class) {
                    moveDefinitionIntoOrOutOfClass.setTitle(`${moveDefinitionTitle.intoClass} "${declaration.parent.name}"`);
                } else if (declaration?.parent?.kind === vscode.SymbolKind.Struct) {
                    moveDefinitionIntoOrOutOfClass.setTitle(`${moveDefinitionTitle.intoStruct} "${declaration.parent.name}"`);
                } else {
                    moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notMemberFunction);
                }
            } else {
                moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notMemberFunction);
            }
        }

        if (sourceDoc.languageId !== 'cpp') {
            moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notCpp);
        }

        if (definition.isInline()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isInline);
        } else if (definition.isConstexpr()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isConstexpr);
        }

        if (matchingUri) {
            const displayPath = this.formatPathToDisplay(matchingUri);
            moveDefinitionToMatchingSourceFile.setTitle(`Move Definition to "${displayPath}"`);
        } else {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.noMatchingSourceFile);
        }

        moveDefinitionToMatchingSourceFile.setArguments(definition, matchingUri, declaration);
        moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, declaration);

        return [moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass];
    }

    private async getMemberVariableRefactorings(
        memberVariable: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<RefactorAction[]> {
        const generateGetterSetter = new RefactorAction(getterSetterTitle.getterSetter);
        const generateGetter = new RefactorAction(getterSetterTitle.getter);
        const generateSetter = new RefactorAction(getterSetterTitle.setter);
        generateGetterSetter.setCommand('cmantic.generateGetterSetterFor');
        generateGetter.setCommand('cmantic.generateGetterFor');
        generateSetter.setCommand('cmantic.generateSetterFor');
        generateGetterSetter.setArguments(memberVariable, sourceDoc);
        generateGetter.setArguments(memberVariable, sourceDoc);
        generateSetter.setArguments(memberVariable, sourceDoc);

        if (sourceDoc.languageId !== 'cpp') {
            generateGetterSetter.disable(getterSetterFailure.notCpp);
            generateGetter.disable(getterSetterFailure.notCpp);
            generateSetter.disable(getterSetterFailure.notCpp);
        } else {
            const getter = memberVariable.parent?.findGetterFor(memberVariable);
            const setter = memberVariable.parent?.findSetterFor(memberVariable);

            if (getter) {
                generateGetterSetter.disable(getterSetterFailure.getterOrSetterExists);
                generateGetter.disable(getterSetterFailure.getterExists);
            }

            if (setter) {
                generateGetterSetter.disable(getterSetterFailure.getterOrSetterExists);
                generateSetter.disable(getterSetterFailure.setterExists);
            } else if (memberVariable.isConst()) {
                generateGetterSetter.disable(getterSetterFailure.isConst);
                generateSetter.disable(getterSetterFailure.isConst);
            }
        }

        return [generateGetterSetter, generateGetter, generateSetter];
    }

    private async getSourceActions(
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<SourceAction[]> {
        const addHeaderGuard = new SourceAction('Add Header Guard');
        const addInclude = new SourceAction('Add Include');
        const createMatchingSourceFile = new SourceAction('Create Matching Source File');
        addHeaderGuard.setCommand('cmantic.addHeaderGuard');
        addInclude.setCommand('cmantic.addInclude');
        createMatchingSourceFile.setCommand('cmantic.createMatchingSourceFile');

        if (!sourceDoc.isHeader()) {
            addHeaderGuard.disable(addHeaderGuardFailure.notHeaderFile);
            createMatchingSourceFile.disable(createSourceFileFailure.notHeaderFile);
        } else if (matchingUri) {
            createMatchingSourceFile.disable(createSourceFileFailure.sourceFileExists);
        }

        if (sourceDoc.hasHeaderGuard()) {
            addHeaderGuard.disable(addHeaderGuardFailure.headerGuardExists);
        }

        return [addHeaderGuard, addInclude, createMatchingSourceFile];
    }

    private formatPathToDisplay(uri: vscode.Uri): string {
        const relativePath = vscode.workspace.asRelativePath(uri);
        // Arbitrary limit, as to not display a path that's running all the way across the screen.
        if (relativePath.length > 60) {
            const length = relativePath.length;
            return relativePath.substring(0, 28) + '....' + relativePath.substring(length - 28, length);
        }
        return relativePath;
    }
}
