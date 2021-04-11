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

export class EqualsOperator extends Operator {
    isFriend: boolean;
    name: string;
    returnType: string;
    parameters: string;

    constructor(parent: CSymbol, operands?: Operand[]) {
        super(parent);
        this.isFriend = cfg.friendComparisonOperators(parent.uri);
        this.name = 'operator==';
        this.returnType = 'bool ';
        const type = `const ${parent.templatedName()} &`;
        this.parameters = this.isFriend ? `${type}lhs, ${type}rhs` : `${type}other`;
        if (operands) {
            this.setOperands(operands);
        }
    }

    setOperands(operands: Operand[]): void {
        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const alignment = indent.includes(' ') ? '    ' : indent;
        const lhs = cfg.useExplicitThisPointer(this.parent.uri) && !this.isFriend
                ? 'this->'
                : this.isFriend
                    ? 'lhs.'
                    : '';
        const rhs = this.isFriend
                ? 'rhs.'
                : 'other.';

        this.body = '';

        operands.forEach(operand => {
            if (operand instanceof SubSymbol) {
                const cast = `static_cast<const ${operand.name} &>`;
                if (this.isFriend) {
                    this.body += `${cast}(lhs) == ${cast}(rhs)${eol + indent + alignment}&& `;
                } else {
                    this.body += `${cast}(*this) == ${cast}(other)${eol + indent + alignment}&& `;
                }
            } else {
                this.body += `${lhs + operand.name} == ${rhs + operand.name + eol + indent + alignment}&& `;
            }
        });

        if (this.body.length > 3) {
            this.body = 'return ' + this.body.slice(0, -3).trimEnd() + ';';
        }
    }
}

export class NotEqualsOperator extends Operator {
    isFriend: boolean;
    name: string;
    returnType: string;
    parameters: string;

    constructor(parent: CSymbol) {
        super(parent);
        this.isFriend = cfg.friendComparisonOperators(parent.uri);
        this.name = 'operator!=';
        this.returnType = 'bool ';
        const type = `const ${parent.templatedName()} &`;
        this.parameters = this.isFriend ? `${type}lhs, ${type}rhs` : `${type}other`;
        if (cfg.useExplicitThisPointer(parent.uri) && !this.isFriend) {
            this.body = 'return !(*this == other);';
        } else if (this.isFriend) {
            this.body = 'return !(lhs == rhs);';
        } else {
            this.body = 'return !operator==(other);';
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
        const eol = this.parent.document.endOfLine;
        const indent = util.indentation();
        const alignment = indent.includes(' ') ? '   ' : indent;

        this.body = '';
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
