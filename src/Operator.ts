import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import SourceSymbol from './SourceSymbol';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';


export type Operand = CSymbol | SubSymbol;

export interface Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameter: string;
    body: string;
    declaration: string;
    definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string>;
}

export class OpEqual implements Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameter: string;
    body: string;

    constructor(parent: CSymbol, operands?: Operand[]) {
        this.parent = parent;
        this.name = 'operator==';
        this.returnType = 'bool ';
        this.parameter = 'const ' + parent.templatedName() + ' &other';
        this.body = '';
        if (operands) {
            this.setOperands(operands);
        }
    }

    get declaration(): string {
        return this.returnType + this.name + '(' + this.parameter + ') const';
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol, true) + inlineSpecifier + this.returnType
                + await this.parent.scopeString(target, position) + this.name + '(' + this.parameter + ') const'
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }

    setOperands(operands: Operand[]): void {
        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const thisPointer = cfg.useExplicitThisPointer() ? 'this->' : '';

        this.body = '';

        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                this.body += `static_cast<const ${operand.name} &>(*this) == static_cast<const ${operand.name} &>(other)${eol}${indent}${indent}&& `;
            } else {
                this.body += `${thisPointer}${operand.name} == other.${operand.name}${eol}${indent}${indent}&& `;
            }
        });

        if (this.body.length > 3) {
            this.body = 'return ' + this.body.slice(0, -3).trimEnd() + ';';
        }
    }
}

export class OpNotEqual implements Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameter: string;
    body: string;

    constructor(parent: CSymbol) {
        this.parent = parent;
        this.name = 'operator!=';
        this.returnType = 'bool ';
        this.parameter = 'const ' + parent.templatedName() + ' &other';
        if (cfg.useExplicitThisPointer()) {
            this.body = 'return !(*this == other);';
        } else {
            this.body = 'return !operator==(other);';
        }
    }

    get declaration(): string {
        return this.returnType + this.name + '(' + this.parameter + ') const';
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol, true) + inlineSpecifier + this.returnType
                + await this.parent.scopeString(target, position) + this.name + '(' + this.parameter + ') const'
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}
