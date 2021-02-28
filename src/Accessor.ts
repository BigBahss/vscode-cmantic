import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';


const re_qualifiers = /\b(static|const|volatile|mutable)\b/g;

/**
 * Represents a new accessor member function for a member variable.
 */
export interface Accessor {
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;
    declaration: string;
    definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string>;
}

/**
 * Represents a new getter member function for a member variable.
 */
export class Getter implements Accessor {
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;

    constructor(memberVariable: CSymbol) {
        const leadingText = memberVariable.parsableLeadingText;
        this.memberVariable = memberVariable;
        this.name = memberVariable.getterName();
        this.isStatic = memberVariable.isStatic();

        const templateParamStart = leadingText.indexOf('<');
        const templateParamEnd = leadingText.lastIndexOf('>');
        if (templateParamStart !== -1 && templateParamEnd !== -1) {
            this.returnType = leadingText.slice(0, templateParamStart).replace(re_qualifiers, '')
                    + leadingText.slice(templateParamStart, templateParamEnd + 1)
                    + leadingText.slice(templateParamEnd + 1).replace(re_qualifiers, '');
            this.returnType = this.returnType.replace(/\s{2,}/g, ' ').trimStart();
        } else {
            this.returnType = leadingText.replace(re_qualifiers, '').replace(/\s{2,}/g, ' ').trimStart();
        }

        this.parameter = '';
        const thisPointer = (cfg.useExplicitThisPointer() && !this.isStatic) ? 'this->' : '';
        this.body = 'return ' + thisPointer + memberVariable.name + ';';
    }

    get declaration(): string {
        return (this.isStatic ? 'static ' : '') + this.returnType + this.name + '()' + (this.isStatic ? '' : ' const');
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
                (!this.memberVariable.parent?.range.contains(position)
                        && this.memberVariable.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return inlineSpecifier + this.returnType + await this.memberVariable.scopeString(target, position)
                + this.name + '()' + (this.isStatic ? '' : ' const') + curlySeparator + '{'
                + eol + util.indentation() + this.body + eol + '}';
    }
}

/**
 * Represents a new setter member function for a member variable.
 */
export class Setter implements Accessor {
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;

    /**
     * This builder method is necessary since CSymbol.isPrimitive() is asynchronous.
     */
    static async create(memberVariable: CSymbol): Promise<Setter> {
        const setter = new Setter(memberVariable);
        const type = memberVariable.parsableLeadingText.replace(/\b(static|mutable)\s*/g, '').trimStart();

        if (!await memberVariable.isPrimitive() && !memberVariable.isPointer()) {
            setter.parameter = (memberVariable.isReference()
                ? 'const ' + type
                : 'const ' + type + '&'
            ) + 'value';
        } else {
            setter.parameter = type.replace(/&(?!.*>)/, '') + 'value';
        }

        return setter;
    }

    private constructor(memberVariable: CSymbol) {
        this.memberVariable = memberVariable;
        this.name = memberVariable.setterName();
        this.isStatic = memberVariable.isStatic();
        this.returnType = 'void ';
        this.parameter = '';
        const thisPointer = (cfg.useExplicitThisPointer() && !this.isStatic) ? 'this->' : '';
        this.body = thisPointer + memberVariable.name + ' = value;';
    }

    get declaration(): string {
        return (this.isStatic ? 'static ' : '') + 'void ' + this.name + '(' + this.parameter + ')';
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
                (!this.memberVariable.parent?.range.contains(position)
                        && this.memberVariable.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return inlineSpecifier + this.returnType + await this.memberVariable.scopeString(target, position)
                + this.name + '(' + this.parameter + ')' + curlySeparator + '{'
                + eol + util.indentation() + this.body + eol + '}';
    }
}
