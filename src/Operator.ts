import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import SourceDocument from './SourceDocument';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';


export type Operand = CSymbol | SubSymbol;

export abstract class Operator {
    readonly parent: CSymbol;
    abstract isFriend: boolean;
    abstract name: string;
    abstract returnType: string;
    abstract parameters: string;
    body: string;

    constructor(parent: CSymbol) {
        this.parent = parent;
        this.body = '';
    }

    get declaration(): string {
        return (this.isFriend ? 'friend ' : '') + this.returnType + this.name
                + '(' + this.parameters + ')' + (this.isFriend ? '' : ' const');
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        const friendSpecifier =
            this.isFriend && (util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'friend '
                : '';
        const inlineSpecifier =
            (!util.containsExclusive(this.parent.range, position)
            && this.parent.document.fileName === target.fileName)
                ? 'inline '
                : '';
        return this.parent.combinedTemplateStatements(true, eol, !this.isFriend) + friendSpecifier
                + inlineSpecifier + this.returnType + await this.parent.scopeString(target, position, this.isFriend)
                + this.name + '('+ this.parameters + ')' + (this.isFriend ? '' : ' const') + curlySeparator + '{'
                + eol + util.indentation() + this.body + eol + '}';
    }
}

export class ComparisonOperator extends Operator {
    isFriend: boolean;
    name: string;
    returnType: string;
    parameters: string;

    constructor(parent: CSymbol, name: string) {
        super(parent);
        this.isFriend = cfg.friendComparisonOperators(parent.uri);
        this.name = name;
        this.returnType = 'bool ';
        const type = `const ${parent.templatedName()} &`;
        this.parameters = this.isFriend ? `${type}lhs, ${type}rhs` : `${type}other`;
    }
}

export class EqualsOperator extends ComparisonOperator {
    constructor(parent: CSymbol, operands?: Operand[]) {
        super(parent, 'operator==');
        if (operands) {
            this.setOperands(operands);
        }
    }

    setOperands(operands: Operand[]): void {
        this.body = '';
        if (operands.length === 0) {
            return;
        }

        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const alignment = indent.includes(' ') ? '    ' : indent;
        const lhs = cfg.useExplicitThisPointer(this.parent.uri) && !this.isFriend
                ? 'this->' : (this.isFriend ? 'lhs.' : '');
        const lhsCast = this.isFriend ? '(lhs)' : '(*this)';
        const rhs = this.isFriend ? 'rhs.' : 'other.';
        const rhsCast = this.isFriend ? '(rhs)' : '(other)';

        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                const cast = `static_cast<const ${operand.name} &>`;
                this.body += `${cast + lhsCast} == ${cast + rhsCast + eol + indent + alignment}&& `;
            } else {
                this.body += `${lhs + operand.name} == ${rhs + operand.name + eol + indent + alignment}&& `;
            }
        });

        if (this.body.length > 3) {
            this.body = `return ${this.body.slice(0, -3).trimEnd()};`;
        }
    }
}

export class NotEqualsOperator extends ComparisonOperator {
    constructor(parent: CSymbol) {
        super(parent, 'operator!=');
        if (cfg.useExplicitThisPointer(parent.uri) && !this.isFriend) {
            this.body = 'return !(*this == other);';
        } else if (this.isFriend) {
            this.body = 'return !(lhs == rhs);';
        } else {
            this.body = 'return !operator==(other);';
        }
    }
}

export class LessThanOperator extends ComparisonOperator {
    constructor(parent: CSymbol, operands?: Operand[]) {
        super(parent, 'operator<');
        if (operands) {
            this.setOperands(operands);
        }
    }

    setOperands(operands: Operand[]): void {
        this.body = '';
        if (operands.length === 0) {
            return;
        }

        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const lhs = cfg.useExplicitThisPointer(this.parent.uri) && !this.isFriend
                ? 'this->' : (this.isFriend ? 'lhs.' : '');
        const lhsCast = this.isFriend ? '(lhs)' : '(*this)';
        const rhs = this.isFriend ? 'rhs.' : 'other.';
        const rhsCast = this.isFriend ? '(rhs)' : '(other)';
        const returnTrue = eol + indent + indent + 'return true;' + eol + indent;
        const returnFalse = eol + indent + indent + 'return false;' + eol + indent;

        const lastOperand = operands.pop()!;
        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                const cast = `static_cast<const ${operand.name} &>`;
                this.body += `if (${cast + lhsCast} < ${cast + rhsCast})${returnTrue}`
                           + `if (${cast + rhsCast} < ${cast + lhsCast})${returnFalse}`;
            } else {
                this.body += `if (${lhs + operand.name} < ${rhs + operand.name})${returnTrue}`
                           + `if (${rhs + operand.name} < ${lhs + operand.name})${returnFalse}`;
            }
        });

        if (lastOperand instanceof SubSymbol) {
            const cast = `static_cast<const ${lastOperand.name} &>`;
            this.body += `return ${cast + lhsCast} < ${cast + rhsCast};`;
        } else {
            this.body += `return ${lhs + lastOperand.name} < ${rhs + lastOperand.name};`;
        }
    }
}

export class StreamOutputOperator extends Operator {
    isFriend: boolean;
    name: string;
    returnType: string;
    parameters: string;

    constructor(parent: CSymbol, operands?: Operand[]) {
        super(parent);
        this.isFriend = true;
        this.name = 'operator<<';
        this.returnType = 'std::ostream &';
        this.parameters = `std::ostream &os, const ${parent.templatedName()} &rhs`;
        if (operands) {
            this.setOperands(operands);
        }
    }

    setOperands(operands: Operand[]): void {
        this.body = '';
        if (operands.length === 0) {
            return;
        }

        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const alignment = indent.includes(' ') ? '   ' : indent;
        let spacer = '';

        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                this.body += `<< static_cast<const ${operand.name} &>(rhs)${eol + indent + alignment}`;
            } else {
                this.body += `<< "${spacer + operand.name}: " << rhs.${operand.name + eol + indent + alignment}`;
            }
            spacer = ' ';
        });

        if (this.body.length > 0) {
            this.body = `os ${this.body.trimEnd()};${eol + indent}return os;`;
        }
    }
}
