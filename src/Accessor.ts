import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';


const re_qualifiers = /\b(static|const|volatile|mutable)\b/g;

/**
 * Represents a new accessor member function for a member variable.
 */
export interface Accessor {
    readonly parent?: CSymbol;
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
    readonly parent?: CSymbol;
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameter: string;
    body: string;

    constructor(memberVariable: CSymbol) {
        const leadingText = memberVariable.parsableLeadingText.replace('[[', '').replace(']]', '');
        this.parent = memberVariable.parent;
        this.memberVariable = memberVariable;
        this.name = memberVariable.getterName();
        this.isStatic = memberVariable.isStatic();

        const templateParamStart = leadingText.indexOf('<');
        const templateParamEnd = leadingText.lastIndexOf('>');
        if (templateParamStart !== -1 && templateParamEnd !== -1) {
            this.returnType = leadingText.slice(0, templateParamStart).replace(re_qualifiers, '')
                    + leadingText.slice(templateParamStart, templateParamEnd + 1)
                    + leadingText.slice(templateParamEnd + 1).replace(re_qualifiers, '');
            this.returnType = this.returnType.replace(/\s+/g, ' ').trimStart();
        } else {
            this.returnType = leadingText.replace(re_qualifiers, '').replace(/\s+/g, ' ').trimStart();
        }

        this.parameter = '';
        let memberPrefix = '';
        if (cfg.useExplicitThisPointer() && !this.isStatic) {
            memberPrefix = 'this->';
        } else if (this.isStatic && memberVariable.parent) {
            memberPrefix = memberVariable.parent.name + '::';
        }
        this.body = 'return ' + memberPrefix + memberVariable.name + ';';
    }

    get declaration(): string {
        return (this.isStatic ? 'static ' : '') + this.returnType + this.name + '()' + (this.isStatic ? '' : ' const');
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            ((!this.parent || !util.containsExclusive(this.parent.range, position))
            && this.memberVariable.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.memberVariable.combinedTemplateStatements(true, eol) + inlineSpecifier + this.returnType
                + await this.memberVariable.scopeString(target, position) + this.name + '()'
                + (this.isStatic ? '' : ' const') + curlySeparator + '{'
                + eol + util.indentation() + this.body + eol + '}';
    }
}

/**
 * Represents a new setter member function for a member variable.
 */
export class Setter implements Accessor {
    readonly parent?: CSymbol;
    readonly memberVariable: CSymbol;
    name: string;
    isStatic: boolean;
    returnType: string;
    parameterName: string;
    parameter: string;
    body: string;

    /**
     * This builder method is necessary since CSymbol.isPrimitive() is asynchronous.
     */
    static async create(memberVariable: CSymbol): Promise<Setter> {
        const setter = new Setter(memberVariable);
        const type = memberVariable.parsableLeadingText.replace(/\b(static|mutable)\s*/g, '')
                .replace('[[', '').replace(']]', '').replace(/\s+/g, ' ').trimStart();

        if (!await memberVariable.isPrimitive() && !memberVariable.isPointer()) {
            setter.parameter = (memberVariable.isReference()
                ? 'const ' + type
                : 'const ' + type + '&'
            ) + setter.parameterName;
        } else {
            setter.parameter = type.replace(/&(?!.*>)/, '') + setter.parameterName;
        }

        return setter;
    }

    private constructor(memberVariable: CSymbol) {
        this.parent = memberVariable.parent;
        this.memberVariable = memberVariable;
        this.name = memberVariable.setterName();
        this.isStatic = memberVariable.isStatic();
        this.returnType = 'void ';
        let baseName = memberVariable.baseName();
        if (baseName !== memberVariable.name) {
            this.parameterName = baseName;
        } else {
            baseName = cfg.formatToCaseStyle(baseName);
            if (baseName !== memberVariable.name) {
                this.parameterName = baseName;
            } else {
                this.parameterName = baseName + '_';
            }
        }
        this.parameter = '';
        let memberPrefix = '';
        if (cfg.useExplicitThisPointer() && !this.isStatic) {
            memberPrefix = 'this->';
        } else if (this.isStatic && memberVariable.parent) {
            memberPrefix = memberVariable.parent.name + '::';
        }
        this.body = `${memberPrefix + memberVariable.name} = ${this.parameterName};`;
    }

    get declaration(): string {
        return (this.isStatic ? 'static ' : '') + 'void ' + this.name + '(' + this.parameter + ')';
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            ((!this.parent || !util.containsExclusive(this.parent.range, position))
            && this.memberVariable.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.memberVariable.combinedTemplateStatements(true, eol) + inlineSpecifier + this.returnType
                + await this.memberVariable.scopeString(target, position) + this.name + '(' + this.parameter + ')'
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}
