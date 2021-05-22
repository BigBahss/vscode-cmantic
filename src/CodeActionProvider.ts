import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as parse from './parsing';
import * as util from './utility';
import SourceFile from './SourceFile';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import FunctionSignature from './FunctionSignature';
import { failure as addDefinitionFailure, title as addDefinitionTitle } from './commands/addDefinition';
import { failure as addDeclarationFailure, title as addDeclarationTitle } from './commands/addDeclaration';
import { failure as moveDefinitionFailure, title as moveDefinitionTitle } from './commands/moveDefinition';
import { failure as getterSetterFailure, title as getterSetterTitle } from './commands/generateGetterSetter';
import { title as operatorTitle } from './commands/generateOperators';
import { failure as createSourceFileFailure } from './commands/createSourceFile';
import { failure as addHeaderGuardFailure, headerGuardMatchesConfiguredStyle } from './commands/addHeaderGuard';
import { getMatchingHeaderSource } from './extension';
import { CmanticCommand, CmanticCommandId } from './commands/commands';


export class CodeAction extends vscode.CodeAction {
    command: CmanticCommand;

    constructor(title: string, command: CmanticCommandId, kind?: vscode.CodeActionKind) {
        super(title, kind);
        this.title = title;
        this.command = { title: title, command: command };
        this.kind = kind;
    }

    setTitle(title: string): void {
        this.title = title;
        this.command.title = title;
    }

    setCommand(command: CmanticCommandId): void {
        this.command.command = command;
    }

    setArguments(...args: any[]): void {
        this.command.arguments = args;
    }

    disable(reason: string): void {
        this.disabled = { reason: reason };
    }
}

interface CodeActionDocumentation {
    kind: vscode.CodeActionKind;
    command: CmanticCommand;
}

export class RefactorAction extends CodeAction {
    static readonly documentation: CodeActionDocumentation = {
        kind: vscode.CodeActionKind.Refactor,
        command: {
            command: 'cmantic.openDocumentation',
            title: 'Learn more about C-mantic refactorings',
            arguments: [vscode.CodeActionKind.Refactor]
        }
    };

    constructor(title: string, command: CmanticCommandId) {
        super(title, command, vscode.CodeActionKind.Refactor);
    }
}

export class SourceAction extends CodeAction {
    static readonly documentation: CodeActionDocumentation = {
        kind: vscode.CodeActionKind.Source,
        command: {
            command: 'cmantic.openDocumentation',
            title: 'Learn more about C-mantic source actions',
            arguments: [vscode.CodeActionKind.Source]
        }
    };

    constructor(title: string, command: CmanticCommandId) {
        super(title, command, vscode.CodeActionKind.Source);
    }
}

class LinkedLocation extends vscode.Location {
    readonly linkedLocation: vscode.Location;

    constructor(symbol: CSymbol, linkedLocation: vscode.Location) {
        super(symbol.uri, declarationRange(symbol));
        this.linkedLocation = linkedLocation;
    }
}

export class CodeActionProvider extends vscode.Disposable implements vscode.CodeActionProvider {
    static readonly metadata: vscode.CodeActionProviderMetadata = {
        providedCodeActionKinds: [
            vscode.CodeActionKind.QuickFix,
            vscode.CodeActionKind.Refactor,
            vscode.CodeActionKind.Source
        ],
        documentation: [
            RefactorAction.documentation,
            SourceAction.documentation
        ]
    };

    private addDefinitionEnabled!: boolean;
    private addDeclarationEnabled!: boolean;
    private moveDefinitionEnabled!: boolean;
    private generateGetterSetterEnabled!: boolean;

    private previousSig?: FunctionSignature;
    private currentFunction?: LinkedLocation;
    private changedFunction?: LinkedLocation;

    private readonly disposables: vscode.Disposable[];

    constructor() {
        super(() => this.disposables.forEach(disposable => disposable.dispose()));
        this.updateEnabledCodeActions();
        this.disposables = [
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration(cfg.extensionKey)) {
                    this.updateEnabledCodeActions();
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.fsPath === this.currentFunction?.uri.fsPath) {
                    for (const change of event.contentChanges) {
                        if (change.range.intersection(this.currentFunction.range)) {
                            this.currentFunction.range = this.currentFunction.range.union(change.range);
                            this.changedFunction = this.currentFunction;
                        }
                    }
                }
            })
        ];
    }

    updateEnabledCodeActions(): void {
        this.addDefinitionEnabled = cfg.enableAddDefinition();
        this.addDeclarationEnabled = cfg.enableAddDeclaration();
        this.moveDefinitionEnabled = cfg.enableMoveDefinition();
        this.generateGetterSetterEnabled = cfg.enableGenerateGetterSetter();
    }

    async provideCodeActions(
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token?: vscode.CancellationToken
    ): Promise<CodeAction[]> {
        const sourceDoc = new SourceDocument(document);

        const [matchingUri, symbol] = await Promise.all([
            getMatchingHeaderSource(sourceDoc.uri),
            sourceDoc.getSymbol(rangeOrSelection.start)
        ]);

        if (token?.isCancellationRequested) {
            return [];
        }

        const codeActions = context.only?.contains(vscode.CodeActionKind.Source)
                ? await this.getSourceActions(rangeOrSelection, context, sourceDoc, matchingUri)
                : await this.getRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri);

        setImmediate(() => this.updateTrackedFunction(symbol));

        return codeActions;
    }

    resolveCodeAction(codeAction: CodeAction): CodeAction {
        if (codeAction.command.command === 'cmantic.updateSignature') {
            this.changedFunction = undefined;
            this.previousSig = undefined;
        }
        return codeAction;
    }

    private async updateTrackedFunction(symbol: CSymbol | undefined): Promise<void> {
        if (symbol?.isFunctionDeclaration()) {
            const definitionLocation = await symbol.findDefinition();
            this.currentFunction = definitionLocation ? new LinkedLocation(symbol, definitionLocation) : undefined;
        } else if (symbol?.isFunctionDefinition()) {
            const declarationLocation = await symbol.findDeclaration();
            this.currentFunction = declarationLocation ? new LinkedLocation(symbol, declarationLocation) : undefined;
        } else {
            this.currentFunction = undefined;
        }

        if (symbol?.isFunction() && !this.previousSig?.range.intersection(symbol.selectionRange)
                && (this.previousSig?.uri.fsPath === symbol.uri.fsPath || !this.previousSig)) {
            this.previousSig = new FunctionSignature(symbol);
        }
    }

    private async getRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol | undefined,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!symbol) {
            return this.getFileRefactorings(context, sourceDoc, matchingUri);
        }

        const refactorActions = await Promise.all([
            this.getUpdateSignatureRefactoring(rangeOrSelection, context, symbol, sourceDoc),
            this.getAddDefinitionRefactorings(context, symbol, sourceDoc, matchingUri),
            this.getAddDeclarationRefactoring(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getMoveDefinitionRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getGetterSetterRefactorings(rangeOrSelection, context, symbol, sourceDoc, matchingUri),
            this.getClassRefactorings(context, symbol, sourceDoc),
            this.getFileRefactorings(context, sourceDoc, matchingUri)
        ]);

        return refactorActions.flat().filter((action): action is RefactorAction => action !== undefined);
    }

    private shouldProvideAddDefinition(
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDeclaration()
            && (this.addDefinitionEnabled || !!context.only?.contains(vscode.CodeActionKind.Refactor));
    }

    private shouldProvideAddDeclaration(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDefinition()
            && (this.addDeclarationEnabled && symbol.selectionRange.contains(rangeOrSelection.start)
                || !!context.only?.contains(vscode.CodeActionKind.Refactor));
    }

    private shouldProvideMoveDefinition(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.isFunctionDefinition()
            && ((this.moveDefinitionEnabled && symbol.selectionRange.contains(rangeOrSelection.start))
                || !!context.only?.contains(vscode.CodeActionKind.Refactor));
    }

    private shouldProvideGetterSetter(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.document.languageId === 'cpp' && symbol.isMemberVariable()
            && ((this.generateGetterSetterEnabled && symbol.selectionRange.contains(rangeOrSelection.start))
                || !!context.only?.contains(vscode.CodeActionKind.Refactor));
    }

    private shouldProvideClassRefactorings(
        context: vscode.CodeActionContext,
        symbol: CSymbol
    ): boolean {
        return symbol.document.languageId === 'cpp'
            && (symbol.isClassType() || !!symbol.parent?.isClassType())
            && !!context.only?.contains(vscode.CodeActionKind.Refactor);
    }

    private async getUpdateSignatureRefactoring(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        symbol: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<RefactorAction | undefined> {
        if (!this.changedFunction || !this.previousSig) {
            return;
        }

        const range = declarationRange(symbol);
        if (!range.intersection(this.changedFunction.range) || !range.intersection(rangeOrSelection)) {
            return;
        }
        this.changedFunction.range = range;

        let title: string;
        if (symbol.isFunctionDeclaration()) {
            if (await symbol.findDefinition()) {
                const currentSig = new FunctionSignature(symbol);
                if (currentSig.isEqual(this.previousSig)) {
                    this.changedFunction = undefined;
                    return;
                }
            }
            title = 'Update Function Definition';
        } else if (symbol.isFunctionDefinition()) {
            if (await symbol.findDeclaration()) {
                const currentSig = new FunctionSignature(symbol);
                if (currentSig.isEqual(this.previousSig)) {
                    this.changedFunction = undefined;
                    return;
                }
            }
            title = 'Update Function Declaration';
        } else {
            return;
        }

        const updateSignature = new RefactorAction(title, 'cmantic.updateSignature');
        updateSignature.setArguments(symbol, this.previousSig, sourceDoc, this.changedFunction.linkedLocation);

        if (!context.only?.contains(vscode.CodeActionKind.Refactor)) {
            updateSignature.kind = vscode.CodeActionKind.QuickFix;
            updateSignature.isPreferred = true;
            updateSignature.diagnostics = [...context.diagnostics];
        }

        return updateSignature;
    }

    private async getAddDefinitionRefactorings(
        context: vscode.CodeActionContext,
        declaration: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[] | undefined> {
        if (!this.shouldProvideAddDefinition(context, declaration)) {
            return;
        }

        const p_existingDefinition = declaration.findDefinition();

        const addDefinitionInMatchingSourceFile = new RefactorAction(
                addDefinitionTitle.matchingSourceFile, 'cmantic.addDefinition');
        const addDefinitionInCurrentFile = new RefactorAction(
                addDefinitionTitle.currentFile, 'cmantic.addDefinition');

        addDefinitionInMatchingSourceFile.setArguments(declaration, sourceDoc, matchingUri, true);
        addDefinitionInCurrentFile.setArguments(declaration, sourceDoc, sourceDoc.uri, true);

        if (declaration.isConstructor()) {
            addDefinitionInCurrentFile.setTitle(addDefinitionTitle.constructorCurrentFile);
            addDefinitionInMatchingSourceFile.setTitle(addDefinitionTitle.constructorMatchingSourceFile);
        }

        if (declaration.isInline()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isInline);
        } else if (declaration.isConstexpr()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isConstexpr);
        } else if (declaration.isConsteval()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.isConsteval);
        } else if (declaration.hasUnspecializedTemplate()) {
            addDefinitionInMatchingSourceFile.disable(addDefinitionFailure.hasUnspecializedTemplate);
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

    private async getAddDeclarationRefactoring(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        definition: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction | undefined> {
        if (!this.shouldProvideAddDeclaration(rangeOrSelection, context, definition)) {
            return;
        }

        const p_existingDeclaration = definition.findDeclaration();

        const addDeclaration = new RefactorAction(
                addDeclarationTitle.matchingHeaderFile, 'cmantic.addDeclaration');

        const declaration = await async function (): Promise<CSymbol | undefined> {
            const existingDeclaration = await p_existingDeclaration;
            if (existingDeclaration) {
                const declarationDoc = (existingDeclaration.uri.fsPath === sourceDoc.uri.fsPath)
                        ? sourceDoc
                        : await SourceDocument.open(existingDeclaration.uri);
                return declarationDoc.getSymbol(existingDeclaration.range.start);
            }
        } ();

        if ((declaration?.matches(definition) && SourceFile.isHeader(declaration.uri))
                || definition.parent?.isClassType()) {
            addDeclaration.disable(addDeclarationFailure.declarationExists);
        } else {
            const parentClass = await definition.getParentClass();
            if (parentClass) {
                const scopeName = parentClass.templatedName(true);
                if (parentClass.isClass()) {
                    addDeclaration.setTitle(`Add Declaration in class "${scopeName}"`);
                } else {
                    addDeclaration.setTitle(`Add Declaration in struct "${scopeName}"`);
                }
                addDeclaration.setArguments(definition, sourceDoc, parentClass.uri);
                if (!context.only?.contains(vscode.CodeActionKind.Refactor)) {
                    addDeclaration.kind = vscode.CodeActionKind.QuickFix;
                    addDeclaration.isPreferred = true;
                    addDeclaration.diagnostics = [...context.diagnostics];
                }
            } else if (matchingUri && SourceFile.isHeader(matchingUri)) {
                const displayPath = util.formatPathToDisplay(matchingUri);
                addDeclaration.setTitle(`Add Declaration in "${displayPath}"`);
                addDeclaration.setArguments(definition, sourceDoc, matchingUri);
            } else {
                addDeclaration.setTitle(addDeclarationTitle.currentFile);
                addDeclaration.setArguments(definition, sourceDoc, sourceDoc.uri);
            }
        }

        return addDeclaration;
    }

    private async getMoveDefinitionRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        definition: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[] | undefined> {
        // FIXME: This function is an absolute mess.
        if (!this.shouldProvideMoveDefinition(rangeOrSelection, context, definition)) {
            return;
        }

        const moveDefinitionToMatchingSourceFile = new RefactorAction(
                moveDefinitionTitle.matchingSourceFile, 'cmantic.moveDefinitionToMatchingSourceFile');
        const moveDefinitionIntoOrOutOfClass = new RefactorAction(
                moveDefinitionTitle.intoOrOutOfClass, 'cmantic.moveDefinitionIntoOrOutOfClass');

        let declaration: CSymbol | undefined;
        let declarationDoc: SourceDocument | undefined;

        if (definition.parent?.isClassType()) {
            if (definition.parent.isClass()) {
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

                if (declaration?.parent?.isClass()) {
                    const scopeName = declaration.parent.templatedName(true);
                    moveDefinitionIntoOrOutOfClass.setTitle(
                            `${moveDefinitionTitle.intoClass} "${scopeName}"`);
                } else if (declaration?.parent?.isStruct()) {
                    const scopeName = declaration.parent.templatedName(true);
                    moveDefinitionIntoOrOutOfClass.setTitle(
                            `${moveDefinitionTitle.intoStruct} "${scopeName}"`);
                } else {
                    moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, undefined);
                    const parentClass = await definition.getParentClass();
                    if (parentClass) {
                        declarationDoc = parentClass.document;
                        const scopeName = parentClass.templatedName(true);
                        if (parentClass.isClass()) {
                            moveDefinitionIntoOrOutOfClass.setTitle(
                                    `${moveDefinitionTitle.intoClass} "${scopeName}"`);
                        } else {
                            moveDefinitionIntoOrOutOfClass.setTitle(
                                    `${moveDefinitionTitle.intoStruct} "${scopeName}"`);
                        }
                        if (!context.only?.contains(vscode.CodeActionKind.Refactor)) {
                            moveDefinitionIntoOrOutOfClass.kind = vscode.CodeActionKind.QuickFix;
                            moveDefinitionIntoOrOutOfClass.diagnostics = [...context.diagnostics];
                        }
                    } else {
                        moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notMemberFunction);
                    }
                }
            } else {
                moveDefinitionIntoOrOutOfClass.setArguments(definition, declarationDoc, undefined);
                const parentClass = await definition.getParentClass();
                if (parentClass) {
                    declarationDoc = parentClass.document;
                    const scopeName = parentClass.templatedName(true);
                    if (parentClass.isClass()) {
                        moveDefinitionIntoOrOutOfClass.setTitle(
                                `${moveDefinitionTitle.intoClass} "${scopeName}"`);
                    } else {
                        moveDefinitionIntoOrOutOfClass.setTitle(
                                `${moveDefinitionTitle.intoStruct} "${scopeName}"`);
                    }
                    if (!context.only?.contains(vscode.CodeActionKind.Refactor)) {
                        moveDefinitionIntoOrOutOfClass.kind = vscode.CodeActionKind.QuickFix;
                        moveDefinitionIntoOrOutOfClass.diagnostics = [...context.diagnostics];
                    }
                } else {
                    moveDefinitionIntoOrOutOfClass.disable(moveDefinitionFailure.notMemberFunction);
                }
            }
        }

        if (definition.isInline() && (!declaration || declaration.isInline())) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isInline);
        } else if (definition.isConstexpr()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isConstexpr);
        } else if (definition.isConsteval()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isConsteval);
        } else if (declaration?.isUnspecializedTemplate()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isTemplate);
        } else if (declaration?.parent?.isUnspecializedTemplate() || definition?.parent?.isUnspecializedTemplate()) {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.isClassTemplate);
        }

        if (matchingUri) {
            const displayPath = util.formatPathToDisplay(matchingUri);
            moveDefinitionToMatchingSourceFile.setTitle(`Move Definition to "${displayPath}"`);
        } else {
            moveDefinitionToMatchingSourceFile.disable(moveDefinitionFailure.noMatchingSourceFile);
        }

        moveDefinitionToMatchingSourceFile.setArguments(definition, matchingUri, declaration);

        if (sourceDoc.languageId === 'cpp') {
            return [moveDefinitionToMatchingSourceFile, moveDefinitionIntoOrOutOfClass];
        } else {
            return [moveDefinitionToMatchingSourceFile];
        }
    }

    private async getGetterSetterRefactorings(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        memberVariable: CSymbol,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[] | undefined> {
        if (!this.shouldProvideGetterSetter(rangeOrSelection, context, memberVariable)) {
            return;
        }

        const titleSnippet = ` for "${memberVariable.name}"`;
        const generateGetterSetter = new RefactorAction(
                getterSetterTitle.getterSetter + titleSnippet, 'cmantic.generateGetterSetterFor');
        const generateGetter = new RefactorAction(
                getterSetterTitle.getter + titleSnippet, 'cmantic.generateGetterFor');
        const generateSetter = new RefactorAction(
                getterSetterTitle.setter + titleSnippet, 'cmantic.generateSetterFor');

        generateGetterSetter.setArguments(memberVariable, sourceDoc, matchingUri);
        generateGetter.setArguments(memberVariable, sourceDoc, matchingUri);
        generateSetter.setArguments(memberVariable, sourceDoc, matchingUri);

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

        return [generateGetterSetter, generateGetter, generateSetter];
    }

    private async getClassRefactorings(
        context: vscode.CodeActionContext,
        symbol: CSymbol,
        sourceDoc: SourceDocument
    ): Promise<RefactorAction[] | undefined> {
        if (!this.shouldProvideClassRefactorings(context, symbol)) {
            return;
        }

        const classSymbol = symbol.isClassType() && !symbol.isAnonymous() ? symbol : symbol.firstNamedParent();
        if (!classSymbol) {
            return;
        }
        const titleSnippet = ` for "${classSymbol.name}"`;

        const generateEqualityOperators = new RefactorAction(
                operatorTitle.equality + titleSnippet, 'cmantic.generateEqualityOperators');
        const generateRelationalOperators = new RefactorAction(
                operatorTitle.relational + titleSnippet, 'cmantic.generateRelationalOperators');
        const generateStreamOutputOperator = new RefactorAction(
                operatorTitle.streamOutput + titleSnippet, 'cmantic.generateStreamOutputOperator');

        generateEqualityOperators.setArguments(classSymbol, sourceDoc);
        generateRelationalOperators.setArguments(classSymbol, sourceDoc);
        generateStreamOutputOperator.setArguments(classSymbol, sourceDoc);

        return [generateEqualityOperators, generateRelationalOperators, generateStreamOutputOperator];
    }

    private async getFileRefactorings(
        context: vscode.CodeActionContext,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<RefactorAction[]> {
        if (!context.only?.contains(vscode.CodeActionKind.Refactor)) {
            return [];
        }

        const addDefinitions = new RefactorAction(addDefinitionTitle.multiple, 'cmantic.addDefinitions');
        addDefinitions.setArguments(sourceDoc, matchingUri);

        return [addDefinitions];
    }

    private async getSourceActions(
        rangeOrSelection: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        sourceDoc: SourceDocument,
        matchingUri?: vscode.Uri
    ): Promise<SourceAction[]> {
        const addHeaderGuard = new SourceAction('Add Header Guard', 'cmantic.addHeaderGuard');
        const addInclude = new SourceAction('Add Include', 'cmantic.addInclude');
        const createMatchingSourceFile = new SourceAction(
                'Create Matching Source File', 'cmantic.createMatchingSourceFile');

        addHeaderGuard.setArguments(sourceDoc);
        addInclude.setArguments(sourceDoc);
        createMatchingSourceFile.setArguments(sourceDoc);

        if (!sourceDoc.isHeader()) {
            addHeaderGuard.disable(addHeaderGuardFailure.notHeaderFile);
            createMatchingSourceFile.disable(createSourceFileFailure.notHeaderFile);
        } else if (matchingUri) {
            createMatchingSourceFile.disable(createSourceFileFailure.sourceFileExists);
        }

        if (sourceDoc.hasHeaderGuard) {
            addHeaderGuard.setTitle('Amend Header Guard');
            if (headerGuardMatchesConfiguredStyle(sourceDoc)) {
                addHeaderGuard.disable(addHeaderGuardFailure.headerGuardMatches);
            } else if (!context.only?.contains(vscode.CodeActionKind.Source)) {
                for (const directive of sourceDoc.headerGuardDirectives) {
                    if (directive.range.contains(rangeOrSelection)) {
                        addHeaderGuard.kind = vscode.CodeActionKind.QuickFix;
                        addHeaderGuard.isPreferred = true;
                        break;
                    }
                }
            }
        }

        return [addHeaderGuard, addInclude, createMatchingSourceFile];
    }
}

function declarationRange(symbol: CSymbol): vscode.Range {
    const maskedText = parse.maskParentheses(symbol.parsableText);
    const startOffset = symbol.startOffset();
    const nameEndIndex = symbol.document.offsetAt(symbol.selectionRange.end) - startOffset;
    const bodyStartIndex = maskedText.substring(nameEndIndex).search(/{|;$/);
    if (bodyStartIndex === -1) {
        return new vscode.Range(symbol.declarationStart(), symbol.range.end);
    }

    if (!symbol.isConstructor()) {
        return new vscode.Range(
                symbol.declarationStart(), symbol.document.positionAt(startOffset + nameEndIndex + bodyStartIndex));
    }

    // Get the start of the constructor's member initializer list, if one is present.
    const initializerIndex = maskedText.substring(nameEndIndex, bodyStartIndex + nameEndIndex).search(/:(?!:)/);
    if (initializerIndex === -1) {
        return new vscode.Range(
                symbol.declarationStart(), symbol.document.positionAt(startOffset + nameEndIndex + bodyStartIndex));
    }
    return new vscode.Range(
            symbol.declarationStart(), symbol.document.positionAt(startOffset + nameEndIndex + initializerIndex));
}
