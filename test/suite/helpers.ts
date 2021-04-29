import * as assert from 'assert';
import * as process from 'process';
import * as xregexp from 'xregexp';
import SourceDocument from '../../src/SourceDocument';
import SourceSymbol from '../../src/SourceSymbol';
import { promisify } from 'util';
import { cclsId, clangdId, cpptoolsId, LanguageServer } from '../../src/common';


export function languageServerExtensionId(): string {
    switch (process.env.LANGUAGE_SERVER) {
    default:
        return cpptoolsId;
    case 'clangd':
        return clangdId;
    case 'ccls':
        return cclsId;
    }
}

const disableExtension = '--disable-extension';

export function disableExtensionsFlags(): string[] {
    switch (process.env.LANGUAGE_SERVER) {
    default:
        return [disableExtension, clangdId, disableExtension, cclsId];
    case 'clangd':
        return [disableExtension, cpptoolsId, disableExtension, cclsId];
    case 'ccls':
        return [disableExtension, cpptoolsId, disableExtension, clangdId];
    }
}

export function expectedLanguageServer(): LanguageServer {
    switch (process.env.LANGUAGE_SERVER) {
    default:
        return LanguageServer.cpptools;
    case 'clangd':
        return LanguageServer.clangd;
    case 'ccls':
        return LanguageServer.ccls;
    }
}

const setTimeoutPromised = promisify(setTimeout);

export function wait(ms: number): Promise<void> {
    return setTimeoutPromised(ms);
}

export function getClass(sourceDoc: SourceDocument): SourceSymbol {
    assert(sourceDoc.symbols);

    for (const symbol of sourceDoc.symbols) {
        if (symbol.isClass()) {
            return symbol;
        }
    }

    throw new Error('Class not found.');
}

const operators: xregexp.Pattern[] = [
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '&',
    '|',
    '~',
    '!',
    '=',
    '<',
    '>',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '^=',
    '&=',
    '|=',
    '<<',
    '>>',
    '>>=',
    '<<=',
    '==',
    '!=',
    '<=',
    '>=',
    '<=>',
    '&&',
    '||',
    '++',
    '--',
    ',',
    '->*',
    '->',
    /\(\s*\)/,
    /\[\s*\]/,
    /\s+[\w_][\w\d_]*/,
    /\s+new/,
    /\s+new\s*\[\s*\]/,
    /\s+delete/,
    /\s+delete\s*\[\s*\]/,
    /""\s*[\w_][\w\d_]*/,
    /\s+co_await/
];

export const re_validSymbolName = xregexp.build(
        '^(~?[\\w_][\\w\\d_]*|operator\\s*({{operators}}))(?<!^operator)$', { operators: xregexp.union(operators) });
