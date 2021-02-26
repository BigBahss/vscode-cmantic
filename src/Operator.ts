import * as vscode from 'vscode';
import * as cfg from './configuration';
import * as util from './utility';
import { SourceDocument } from './SourceDocument';
import { CSymbol } from './CSymbol';
import { SourceSymbol } from './SourceSymbol';

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

    constructor(parent: CSymbol, memberVariables?: SourceSymbol[]) {
        this.parent = parent;
        this.name = 'operator==';
        this.returnType = 'bool ';
        this.parameter = 'const ' + parent.name + ' &other';
        this.body = '';
        if (memberVariables) {
            this.setMemberVariables(memberVariables);
        }
    }

    get declaration(): string {
        return this.returnType + this.name + '(' + this.parameter + ') const';
    }

    async definition(target: SourceDocument, position: vscode.Position, curlySeparator: string): Promise<string> {
        const eol = target.endOfLine;
        return this.returnType + await this.parent.scopeString(target, position) + this.name + '(' + this.parameter
                + ') const' + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }

    setMemberVariables(memberVariables: SourceSymbol[]): void {
        const eol = util.endOfLine(this.parent.document);
        const indent = util.indentation();

        if (this.body) {
            this.body = '';
        }

        const thisPointer = cfg.useExplicitThisPointer() ? 'this->' : '';
        memberVariables.forEach(memberVariable => {
            this.body += `${thisPointer}${memberVariable.name} == other.${memberVariable.name}${eol}${indent}${indent}&& `;
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
        this.parameter = 'const ' + parent.name + ' &other';
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
        return this.returnType + await this.parent.scopeString(target, position) + this.name + '(' + this.parameter
                + ') const' + curlySeparator + '{' + eol + util.indentation() + this.body + eol + '}';
    }
}
