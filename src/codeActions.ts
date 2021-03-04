import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './addDefinition';
import { failure as addDeclarationFailure, title as addDeclarationTitle } from './addDeclaration';
import { failure as moveDefinitionFailure, title as moveDefinitionTitle } from './moveDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './generateGetterSetter';
import { failure as createSourceFileFailure } from './createSourceFile';
import { failure as addHeaderGuardFailure } from './addHeaderGuard';
import { title as equalityTitle } from './generateEqualityOperators';
import { getMatchingSourceFile, pushDisposable } from './extension';
import { SourceFile } from './SourceFile';


export class CodeAction extends vscode.CodeAction {
    constructor(title: string, kind: vscode.CodeActionKind, command?: string) {
        super(title, kind);
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
        super(title, vscode.CodeActionKind.Refactor, command);
    }
}

export class SourceAction extends CodeAction {
    constructor(title: string, command?: string) {
        super(title, vscode.CodeActionKind.Source, command);
    }
}

export class CodeActionProvider implements vscode.CodeActionProvider {
    private addDefinitionEnabled: boolean = cfg.enableAddDefinition();
    private addDeclarationEnabled: boolean = cfg.enableAddDeclaration();
    private moveDefinitionEnabled: boolean = cfg.enableMoveDefinition();
    private generateGetterSetterEnabled: boolean = cfg.enableGenerateGetterSetter();

    constructor() {
        pushDisposable(vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration(cfg.baseConfigurationString)) {
                this.addDefinitionEnabled = cfg.enableAddDefinition();
                this.addDeclarationEnabled = cfg.enableAddDeclaration();
                this.moveDefinitionEnabled = cfg.enableMoveDefinition();
                this.generateGetterSetterEnabled = cfg.enableGenerateGetterSetter();
            }
        }));
    }

    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token?: vscode.CancellationToken
    ): Promise<CodeAction[]> {
        const sourceDoc = new SourceDocument(document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingSourceFile(sourceDoc.uri),
            sourceDoc.getSymbol(rangeOrSelection.start)
        ]);

        if (token?.isCancellationRequested) {
            return [];
        }

        const [refactorings, sourceActions] = await Promise.all([
            this.getRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getSourceActions(sourceDoc, matchingUri)
        ]);

        if (token?.isCancellationRequested) {
            return [];
        }

        return [...refactorings, ...sourceActions];
    }

    private async getRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol | undefined,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!symbol) {
            return [];
        }

        const refactorActionArrays = await Promise.all([
            this.getAddDefinitionRefactorings(context, symbol, sourceDoc, matchingUri),
            this.getAddDeclarationRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getMoveDefinitionRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getGetterSetterRefactorings(rangeOrSelection, context, symbol, sourceDoc),
            this.getClassRefactorings(context, symbol, sourceDoc)
        ]);

        const refactorActions: RefactorAction[] = [];
        refactorActionArrays.forEach(refactorActionArray => refactorActions.push(...refactorActionArray));

        return refactorActions;
    }

    private shouldProvideAddDefinition(
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDeclaration()
            && (this.addDefinitionEnabled || context.only?.contains(vscode.CodeActionKind.Refactor) === true);
    }

    private shouldProvideAddDeclaration(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDefinition()
            && (this.addDeclarationEnabled && symbol.selectionRange.contains(rangeOrSelection.start)
                || context.only?.contains(vscode.CodeActionKind.Refactor) === true);
    }

    private shouldProvideMoveDefinition(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDefinition()
            && ((this.moveDefinitionEnabled && symbol.selectionRange.contains(rangeOrSelection.start))
                || context.only?.contains(vscode.CodeActionKind.Refactor) === true);
    }

    private shouldProvideGetterSetter(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isMemberVariable()
            && ((this.generateGetterSetterEnabled && symbol.selectionRange.contains(rangeOrSelection.start))
                || context.only?.contains(vscode.CodeActionKind.Refactor) === true);
    }

    private shouldProvideClassRefactorings(
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return (symbol.isClassOrStruct() || symbol.parent?.isClassOrStruct() === true)
            && context.only?.contains(vscode.CodeActionKind.Refactor) === true;
    }

    private async getAddDefinitionRefactorings(
        context: vscode.CodeActionContext,
        declaration: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!this.shouldProvideAddDefinition(context, declaration)) {
            return [];
        }

        const p_existingDefinition = declaration.findDefinition();

        const addDefinitionInMatchingSourceFile = new RefactorAction(
                addDefinitionTitle.matchingSourceFile, 'cmantic.addDefinition');
        const addDefinitionInCurrentFile = new RefactorAction(
                addDefinitionTitle.currentFile, 'cmantic.addDefinition');

        addDefinitionInMatchingSourceFile.setArguments(declaration, sourceDoc, matchingUri);
        addDefinitionInCurrentFile.setArguments(declaration, sourceDoc, sourceDoc.uri);

        if (declaration.isConstructor()) {
            addDefinitionInCurrentFile.setTitle(addDefinitionTitle.constructorCurrentFile);
            addDefinitionInMatchingSourceFile.setTitle(addDefinitionTitle.constructorMatchingSourceFile);
        }

        if (declaration.isInline()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isInline);
        } else if (declaration.isConstexpr()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isConstexpr);
        } else if (declaration?.isTemplate()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isTemplate);
        } else if (declaration?.parent?.isTemplate()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isClassTemplate);
        }

        if (await p_existingDefinition !== undefined) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.definitionExists);
            addDefinitionInCurrentFile.disable(addDefinitionFailure.definitionExists);
        }

        if (!sourceDoc.isHeader()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.notHeaderFile);
        } else if (matchingUri) {
            const displayPath = util.formatPathToDisplay(matchingUri);
            if (declaration.isConstructor()) {
                addDefinitionInMatchingSourceFile.setTitle(`Generate Constructor in "${displayPath}"`);
            } else {
                addDefinitionInMatchingSourceFile.setTitle(`Add Definition in "${displayPath}"`);
            }
        } else {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.noMatchingSourceFile);
        }

        return [addDefinitionInMatchingSourceFile, addDefinitionInCurrentFile];
    }

    private async getAddDeclarationRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        definition: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!this.shouldProvideAddDeclaration(rangeOrSelection, context, definition)) {
            return [];
        }

        const p_existingDeclaration = definition.findDeclaration();

        const addDeclaration = new RefactorAction(
                addDeclarationTitle.matchingHeaderFile, 'cmantic.addDeclaration');

        if (matchingUri) {
            const displayPath = util.formatPathToDisplay(matchingUri);
            addDeclaration.setTitle(`Add Declaration in "${displayPath}"`);
        }

        const declaration = await async function (): Promise<CSymbol | undefined> {
            const existingDeclaration = await p_existingDeclaration;
            if (existingDeclaration) {
                const declarationDoc = (existingDeclaration.uri.fsPath === sourceDoc.uri.fsPath)
                        ? sourceDoc
                        : await SourceDocument.open(existingDeclaration.uri);
                return declarationDoc.getSymbol(existingDeclaration.range.start);
            }
        } ();

        if ((declaration?.equals(definition) && SourceFile.isHeader(declaration.uri))
                || definition.parent?.isClassOrStruct()) {
            addDeclaration.disable(addDeclarationFailure.declarationExists);
        } else {
            const parentClass = await definition.getParentClass();
            if (parentClass) {
                if (parentClass.kind === vscode.SymbolKind.Class) {
                    addDeclaration.setTitle(`Add Declaration in class "${parentClass.name}"`);
                } else {
                    addDeclaration.setTitle(`Add Declaration in struct "${parentClass.name}"`);
                }
                addDeclaration.setArguments(definition, sourceDoc, parentClass.uri);
                addDeclaration.kind = vscode.CodeActionKind.QuickFix;
                addDeclaration.isPreferred = true;
                addDeclaration.diagnostics = [...context.diagnostics];
            } else if (matchingUri && SourceFile.isHeader(matchingUri)) {
                addDeclaration.setArguments(definition, sourceDoc, matchingUri);
            } else {
                addDeclaration.setArguments(definition, sourceDoc, sourceDoc.uri);
            }
        }

        return [addDeclaration];
    }

    private async getMoveDefinitionRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        definition: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!this.shouldProvideMoveDefinition(rangeOrSelection, context, definition)) {
            return [];
        }

        const moveDefinitionToMatchingSourceFile = new RefactorAction(
                moveDefinitionTitle.matchingSourceFile, 'cmantic.moveDefinitionToMatchingSourceFile');
        const moveDefinitionIntoOrOutOfClass = new RefactorAction(
                moveDefinitionTitle.intoOrOutOfClass, 'cmantic.moveDefinitionIntoOrOutOfClass');

        let declaration: CSymbol | undefined;
        let declarationDoc: SourceDocument | undefined;

        if (definition.parent?.isClassOrStruct()) {
            if (definition.parent.kind === vscode.SymbolKind.Class) {
                moveDefinitionIntoOrOutOfClass.setTitle(moveDefinitionTitle.outOfClass);
            } else {
                moveDefinitionIntoOrOutOfClass.setTitle(moveDefinitionTitle.outOfStruct);
            }
            declarationDoc = sourceDoc;
            moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, undefined);
        } else {
            const declarationLocation = await definition.findDeclaration();
            if (declarationLocation !== undefined
                    && (declarationLocation?.uri.fsPath === definition.uri.fsPath
                    || declarationLocation?.uri.fsPath === matchingUri?.fsPath)) {
                declarationDoc = declarationLocation.uri.fsPath === sourceDoc.uri.fsPath
                        ? sourceDoc
                        : await SourceDocument.open(declarationLocation.uri);
                declaration = await declarationDoc.getSymbol(declarationLocation.range.start);
                moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, declaration);

                if (declaration?.parent?.kind === vscode.SymbolKind.Class) {
                    moveDefinitionIntoOrOutOfClass.setTitle(
                            `${moveDefinitionTitle.intoClass} "${declaration.parent.name}"`);
                } else if (declaration?.parent?.kind === vscode.SymbolKind.Struct) {
                    moveDefinitionIntoOrOutOfClass.setTitle(
                            `${moveDefinitionTitle.intoStruct} "${declaration.parent.name}"`);
                } else {
                    moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, undefined);
                    const parentClass = await definition.getParentClass();
                    if (parentClass) {
                        declarationDoc = parentClass.document;
                        if (parentClass.kind === vscode.SymbolKind.Class) {
                            moveDefinitionIntoOrOutOfClass.setTitle(
                                    `${moveDefinitionTitle.intoClass} "${parentClass.name}"`);
                        } else {
                            moveDefinitionIntoOrOutOfClass.setTitle(
                                    `${moveDefinitionTitle.intoStruct} "${parentClass.name}"`);
                        }
                        moveDefinitionIntoOrOutOfClass.kind = vscode.CodeActionKind.QuickFix;
                        moveDefinitionIntoOrOutOfClass.isPreferred = true;
                        moveDefinitionIntoOrOutOfClass.diagnostics = [...context.diagnostics];
                    }
                }
            } else {
                moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, undefined);
                const parentClass = await definition.getParentClass();
                if (parentClass) {
                    declarationDoc = parentClass.document;
                    if (parentClass.kind === vscode.SymbolKind.Class) {
                        moveDefinitionIntoOrOutOfClass.setTitle(
                                `${moveDefinitionTitle.intoClass} "${parentClass.name}"`);
                    } else {
                        moveDefinitionIntoOrOutOfClass.setTitle(
                                `${moveDefinitionTitle.intoStruct} "${parentClass.name}"`);
                    }
                    moveDefinitionIntoOrOutOfClass.kind = vscode.CodeActionKind.QuickFix;
                    moveDefinitionIntoOrOutOfClass.isPreferred = true;
                    moveDefinitionIntoOrOutOfClass.diagnostics = [...context.diagnostics];
                } else {
                    moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notMemberFunction);
                }
            }
        }

        if (sourceDoc.languageId !== 'cpp') {
            moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notCpp);
        }

        if (definition.isInline() && (!declaration || declaration.isInline())) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isInline);
        } else if (definition.isConstexpr()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isConstexpr);
        } else if (declaration?.isTemplate()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isTemplate);
        } else if (declaration?.parent?.isTemplate() || definition?.parent?.isTemplate()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isClassTemplate);
        }

        if (matchingUri) {
            const displayPath = util.formatPathToDisplay(matchingUri);
            moveDefinitionToMatchingSourceFile.setTitle(`Move Definition to "${displayPath}"`);
        } else {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.noMatchingSourceFile);
        }

        moveDefinitionToMatchingSourceFile.setArguments(definition, matchingUri, declaration);

        return [moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass];
    }

    private async getGetterSetterRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        memberVariable: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<RefactorAction[]> {
        if (!this.shouldProvideGetterSetter(rangeOrSelection, context, memberVariable)) {
            return [];
        }

        const generateGetterSetter = new RefactorAction(
                getterSetterTitle.getterSetter, 'cmantic.generateGetterSetterFor');
        const generateGetter = new RefactorAction(getterSetterTitle.getter, 'cmantic.generateGetterFor');
        const generateSetter = new RefactorAction(getterSetterTitle.setter, 'cmantic.generateSetterFor');

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

    private async getClassRefactorings(
        context: vscode.CodeActionContext,
        symbol: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<RefactorAction[]> {
        if (!this.shouldProvideClassRefactorings(context, symbol)) {
            return [];
        }

        const classOrStruct = symbol.isClassOrStruct() ? symbol : symbol.parent;
        const generateEqualityOperators = new RefactorAction(equalityTitle, 'cmantic.generateEqualityOperators');
        generateEqualityOperators.setArguments(classOrStruct, sourceDoc);
        return [generateEqualityOperators];
    }

    private async getSourceActions(
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<SourceAction[]> {
        const addHeaderGuard = new SourceAction('Add Header Guard', 'cmantic.addHeaderGuard');
        const addInclude = new SourceAction('Add Include', 'cmantic.addInclude');
        const createMatchingSourceFile = new SourceAction(
                'Create Matching Source File', 'cmantic.createMatchingSourceFile');

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
}
