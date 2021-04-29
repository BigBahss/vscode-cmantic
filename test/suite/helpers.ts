import * as xregexp from 'xregexp';
import SourceSymbol from '../../src/SourceSymbol';
import { promisify } from 'util';

const setTimeoutPromised = promisify(setTimeout);

export function wait(ms: number): Promise<void> {
    return setTimeoutPromised(ms);
}

export function getClass(symbols: SourceSymbol[]): SourceSymbol {
    for (const symbol of symbols) {
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

const re_operators = xregexp.union(operators);

export const re_validSymbolName = xregexp.build(
        '^(~?[\\w_][\\w\\d_]*|operator\\s*({{operators}}))(?<!^operator)$', { operators: re_operators });
