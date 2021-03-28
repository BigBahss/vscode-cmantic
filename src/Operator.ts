import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';


export type Operand = CSymbol | SubSymbol;

export interface Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameters: string;
    body: string;
    declaration: string;
    definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string>;
}

export class OpEqual implements Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameters: string;
    body: string;

    constructor(parent: CSymbol, operands?: Operand[]) {
        this.parent = parent;
        this.name = 'operator==';
        this.returnType = 'bool ';
        this.parameters = `const ${parent.templatedName()} &other`;
        this.body = '';
        if (operands) {
            this.setOperands(operands);
        }
    }

    get declaration(): string {
        return `${this.returnType + this.name}(${this.parameters}) const`;
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol, true) + inlineSpecifier + this.returnType
                + await this.parent.scopeString(target, position) + this.name + '(' + this.parameters + ') const'
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
    parameters: string;
    body: string;

    constructor(parent: CSymbol) {
        this.parent = parent;
        this.name = 'operator!=';
        this.returnType = 'bool ';
        this.parameters = `const ${parent.templatedName()} &other`;
        if (cfg.useExplicitThisPointer()) {
            this.body = 'return !(*this == other);';
        } else {
            this.body = 'return !operator==(other);';
        }
    }

    get declaration(): string {
        return `${this.returnType + this.name}(${this.parameters}) const`;
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol, true) + inlineSpecifier + this.returnType
                + await this.parent.scopeString(target, position) + this.name + '(' + this.parameters + ') const'
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}


export class StreamOutputOperator implements Operator {
    readonly parent: CSymbol;
    name: string;
    returnType: string;
    parameters: string;
    body: string;

    constructor(parent: CSymbol, operands?: Operand[]) {
        this.parent = parent;
        this.name = 'operator<<';
        this.returnType = 'std::ostream &';
        this.parameters = `std::ostream &os, const ${parent.templatedName()} &rhs`;
        this.body = '';
        if (operands) {
            this.setOperands(operands);
        }
    }

    get declaration(): string {
        return `friend ${this.returnType + this.name}(${this.parameters})`;
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol) + inlineSpecifier + this.returnType
                + await this.parent.scopeString(target, position, true) + this.name + '(' + this.parameters + ')'
                + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }

    setOperands(operands: Operand[]): void {
        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const alignment = indent.includes(' ') ? '   ' : indent;

        this.body = '';

        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                this.body += `<< static_cast<const ${operand.name} &>(rhs)${eol}${indent}${alignment}`;
            } else {
                this.body += `<< " ${operand.name}: " << rhs.${operand.name}${eol}${indent}${alignment}`;
            }
        });

        if (this.body.length > 0) {
            this.body = `os ${this.body.trimEnd()};${eol}${indent}return os;`;
        }
    }
}
