import * as vscode from 'vscode';
import * as xregexp from 'xregexp';
import { logger } from './logger';
import { CSymbol } from './CSymbol';


export function masker(match: string): string { return ' '.repeat(match.length); }

/**
 * Performs a balanced mask of text between left and right, accounting for depth.
 * Should only be used with single characters.
 */
function maskBalanced(text: string, left: string, right: string, keepEnclosingChars: boolean): string {
    try {
        xregexp.matchRecursive(text, left, right, 'gm', {
            valueNames: ['outer', 'left', 'inner', 'right'],
            escapeChar: '\\'
        }).forEach(match => {
            if (match.name === 'inner') {
                if (keepEnclosingChars) {
                    text = text.substring(0, match.start) + masker(match.value) + text.substring(match.end);
                } else {
                    text = text.substring(0, match.start - left.length)
                            + masker(left.length + match.value + right.length)
                            + text.substring(match.end + right.length);
                }
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : error as string;
        const unbalancedIndexMatch = message.match(/\d+/);
        if (unbalancedIndexMatch !== null) {
            // There is an unbalanced delimiter, so we mask it and try again.
            const unbalancedIndex: number = +unbalancedIndexMatch[0];
            text = text.substring(0, unbalancedIndex) + ' ' + text.substring(unbalancedIndex + 1);
            text = maskBalanced(text, left, right, keepEnclosingChars);
        } else {
            // This shouldn't happen, but log the error just in case.
            logger.alertError(`Unknown parsing error: ${message}`);
        }
    } finally {
        return text;
    }
}

export function maskComments(text: string, keepEnclosingChars: boolean = true): string {
    if (keepEnclosingChars) {
        text = text.replace(/(?<=\/\/).*/gm, masker);
        text = text.replace(/(?<=\/\*)(\*(?!\/)|[^*])*(?=\*\/)/gm, masker);
    } else {
        text = text.replace(/\/\/.*/gm, masker);
        text = text.replace(/\/\*(\*(?!\/)|[^*])*\*\//gm, masker);
    }
    return text;
}

export function maskRawStringLiterals(text: string, keepEnclosingChars: boolean = true): string {
    if (keepEnclosingChars) {
        return text.replace(/(?<=R")(?<delimiter>.*)\(.*\)\k<delimiter>(?=")/gs, masker);
    }
    return text.replace(/R"(?<delimiter>.*)\(.*\)\k<delimiter>"/gs, masker);
}

export function maskQuotes(text: string, keepEnclosingChars: boolean = true): string {
    if (keepEnclosingChars) {
        text = text.replace(/(?<=').*(?=')(?<!\\)/g, masker);
        text = text.replace(/(?<=").*(?=")(?<!\\)/g, masker);
    } else {
        text = text.replace(/'.*'(?<!\\)/g, masker);
        text = text.replace(/".*"(?<!\\)/g, masker);
    }
    return text;
}

export function maskParentheses(text: string, keepEnclosingChars: boolean = true): string {
    return maskBalanced(text, '\\(', '\\)', keepEnclosingChars);
};

export function maskBraces(text: string, keepEnclosingChars: boolean = true): string {
    return maskBalanced(text, '{', '}', keepEnclosingChars);
}

export function maskBrackets(text: string, keepEnclosingChars: boolean = true): string {
    return maskBalanced(text, '\\[', '\\]', keepEnclosingChars);
}

export function maskAngleBrackets(text: string, keepEnclosingChars: boolean = true): string {
    return maskBalanced(text, '\\<', '\\>', keepEnclosingChars);
}

export function maskComparisonOperators(text: string): string {
    return text.replace(/[^\w\d_\s]=(?!=)/g, masker);
}

/**
 * DocumentSymbol ranges don't always include the final semi-colon.
 */
export function getEndOfStatement(document: vscode.TextDocument, position: vscode.Position): vscode.Position {
    const text = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));
    const index = text.search(/(?<=^\s*);/);
    if (index === -1) {
        return position;
    }
    return document.positionAt(document.offsetAt(position) + index + 1);
}

export function getIndentationRegExp(symbol: CSymbol): RegExp {
    const line = symbol.document.lineAt(symbol.trueStart);
    const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    return new RegExp('^' + indentation, 'gm');
}
