import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';


const re_qualifiers = /\b(static|const|volatile|mutable)\b/g;

enum MemberFunctionQualifier {
    None,
    Const,
    Static
}

/**
 * Represents a new accessor member function for a member variable.
 */
export abstract class Accessor {
    readonly memberVariable: CSymbol;
    readonly parent?: CSymbol;
    protected qualifier: MemberFunctionQualifier;

    abstract name: string;
    abstract returnType: string;
    abstract parameter: string;
    abstract body: string;

    constructor(memberVariable: CSymbol) {
        this.memberVariable = memberVariable;
        this.parent = memberVariable.parent;
        this.qualifier = memberVariable.isStatic() ? MemberFunctionQualifier.Static : MemberFunctionQualifier.None;
    }

    get isConst(): boolean { return this.qualifier === MemberFunctionQualifier.Const; }

    get isStatic(): boolean { return this.qualifier === MemberFunctionQualifier.Static; }

    get declaration(): string {
        return (this.isStatic ? 'static ' : '') + this.returnType + this.name
                + '(' + this.parameter + ')' + (this.isConst ? ' const' : '');
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            ((!this.parent || !util.containsExclusive(this.parent.range, position))
            && this.memberVariable.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.memberVariable.combinedTemplateStatements(true, eol) + inlineSpecifier
                + this.returnType + await this.memberVariable.scopeString(target, position)
                + this.name + '(' + this.parameter + ')' + (this.isConst ? ' const' : '')
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }

    protected memberPrefix(): string {
        if (cfg.useExplicitThisPointer(this.memberVariable.uri) && !this.isStatic) {
            return 'this->';
        } else if (this.isStatic && this.parent) {
            return this.parent.name + '::';
        } else {
            return '';
        }
    }
}

/**
 * Represents a new getter member function for a member variable.
 */
export class Getter extends Accessor {
    name: string;
    returnType: string;
    parameter: string;
    body: string;

    constructor(memberVariable: CSymbol) {
        super(memberVariable);
        this.qualifier = this.isStatic ? this.qualifier : MemberFunctionQualifier.Const;
        const leadingText = memberVariable.parsableLeadingText.replace('[[', '').replace(']]', '');
        this.name = memberVariable.getterName();

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
        this.body = `return ${this.memberPrefix() + memberVariable.name};`;
    }
}

/**
 * Represents a new setter member function for a member variable.
 */
export class Setter extends Accessor {
    name: string;
    returnType: string;
    parameter: string;
    body: string;
    private parameterName: string;

    /**
     * This builder method is necessary since CSymbol.isPrimitive() is asynchronous.
     */
    static async create(memberVariable: CSymbol): Promise<Setter> {
        const setter = new Setter(memberVariable);
        const type = memberVariable.parsableLeadingText.replace(/\b(static|mutable)\s*/g, '')
                .replace('[[', '').replace(']]', '').replace(/\s+/g, ' ').trimStart();

        if (!memberVariable.isPointer() && !(await memberVariable.isPrimitive(cfg.resolveTypes(memberVariable.uri)))) {
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
        super(memberVariable);
        this.name = memberVariable.setterName();
        this.returnType = 'void ';
        let baseName = memberVariable.baseName();
        if (baseName !== memberVariable.name) {
            this.parameterName = baseName;
        } else {
            baseName = cfg.formatToCaseStyle(baseName, memberVariable.uri);
            if (baseName !== memberVariable.name) {
                this.parameterName = baseName;
            } else {
                this.parameterName = baseName + '_';
            }
        }
        this.parameter = '';
        this.body = `${this.memberPrefix() + memberVariable.name} = ${this.parameterName};`;
    }
}
