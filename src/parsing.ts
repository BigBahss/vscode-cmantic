import * as vscode from 'vscode';
import * as xregexp from 'xregexp';
import CSymbol from './CSymbol';
import SubSymbol from './SubSymbol';
import { logger } from './extension';


export function masker(match: string): string { return ' '.repeat(match.length); }

const re_matchRecursiveError = /^Unbalanced (left|right) delimiter found in string at position (\d+)$/;

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
                    text = text.substring(0, match.start - 1)
                            + ' '.repeat(match.value.length + 2)
                            + text.substring(match.end + 1);
                }
            }
        });
    } catch (error) {
        if (error instanceof Error) {
            const unbalancedIndexMatch = error.message.match(re_matchRecursiveError);
            if (unbalancedIndexMatch !== null) {
                const unbalancedIndex: number = +unbalancedIndexMatch[2];
                if (unbalancedIndex < text.length) {
                    // There is an unbalanced delimiter, so we mask it and try again.
                    let maskedText = text.substring(0, unbalancedIndex) + ' ';
                    if (unbalancedIndex !== text.length - 1) {
                        maskedText += text.substring(unbalancedIndex + 1);
                    }
                    return maskBalanced(maskedText, left, right, keepEnclosingChars);
                }
            }

            logger.alertError(`Unknown parsing error: ${error.message}`);
        } else {
            logger.alertError('Unknown parsing error');
        }

        throw error;
    }

    return text;
}

export function maskComments(text: string, keepEnclosingChars: boolean = true): string {
    return replaceComments(text, keepEnclosingChars, masker);
}

export function removeComments(text: string): string {
    return replaceComments(text, false, '');
}

function replaceComments(text: string, keepEnclosingChars: boolean = true, replacer: any): string {
    if (keepEnclosingChars) {
        text = text.replace(/(?<=\/\/).*/gm, replacer);
        text = text.replace(/(?<=\/\*)(\*(?!\/)|[^*])*(?=\*\/)/gm, replacer);
    } else {
        text = text.replace(/\/\/.*/gm, replacer);
        text = text.replace(/\/\*(\*(?!\/)|[^*])*\*\//gm, replacer);
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

export function maskAttributes(text: string, keepEnclosingChars: boolean = true): string {
    return replaceAttributes(text, keepEnclosingChars, masker);
}

export function removeAttributes(text: string): string {
    return replaceAttributes(text, false, '');
}

function replaceAttributes(text: string, keepEnclosingChars: boolean = true, replacer: any): string {
    if (keepEnclosingChars) {
        return text.replace(/(?<=\[\[).*(?=\]\])/g, replacer);
    }
    return text.replace(/\[\[.*\]\]/g, replacer);
}

export function maskNonSourceText(text: string, keepAttributeBrackets: boolean = true): string {
    text = maskComments(text, false);
    text = maskRawStringLiterals(text);
    text = maskQuotes(text);
    return maskAttributes(text, keepAttributeBrackets);
}

export function maskParentheses(text: string, keepEnclosingChars: boolean = true): string {
    return maskBalanced(text, '\\(', '\\)', keepEnclosingChars);
}

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
 * Removes all whitespace except for whitespace that exists between 2 adjacent word boundaries,
 * and normalizes that whitespace to be single spaces.
 */
export function normalizeWhitespace(text: string): string {
    return text.replace(/\b\s+\B|\B\s+\b|\B\s+\B/g, '').replace(/\s+/g, ' ');
}

export function normalizeSourceText(sourceText: string): string {
    sourceText = removeComments(sourceText);
    sourceText = removeAttributes(sourceText);
    return normalizeWhitespace(sourceText);
}

/**
 * DocumentSymbol.range doesn't always include the final semi-colon, so this finds the end of the last semi-colon.
 */
export function getEndOfStatement(document: vscode.TextDocument, position: vscode.Position): vscode.Position {
    const text = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));
    const match = text.match(/^(\s*;)*/);
    if (!match || match.length === 0 || !match[0]) {
        return position;
    }
    return document.positionAt(document.offsetAt(position) + match[0].length);
}

export function getRangeOfSymbolName(symbol: CSymbol | SubSymbol): vscode.Range {
    if (symbol.document.getText(symbol.selectionRange) === symbol.name
            || symbol.selectionRange.isEqual(symbol.range)) {
        return symbol.selectionRange;
    }

    const operatorMatch = symbol.name.match(/(?<=^operator\s*)\S+/);
    if (operatorMatch) {
        const nameToEndText = symbol.document.getText(new vscode.Range(symbol.selectionRange.start, symbol.range.end));
        const indexOfOperator = nameToEndText.indexOf(operatorMatch[0], 8);
        if (indexOfOperator !== -1) {
            const nameStartOffset = symbol.document.offsetAt(symbol.selectionRange.start);
            const nameEndOffset = nameStartOffset + indexOfOperator + operatorMatch[0].length;
            return symbol.document.rangeAt(nameStartOffset, nameEndOffset);
        }

    }

    const nameEnd = symbol.selectionRange.start.translate(0, symbol.name.length);
    return symbol.selectionRange.with(symbol.selectionRange.start, nameEnd);
}

export function getIndentationRegExp(symbol: CSymbol): RegExp {
    const line = symbol.document.lineAt(symbol.trueStart);
    const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
    return new RegExp('^' + indentation, 'gm');
}

export function stripDefaultValues(parameters: string): string {
    // Mask anything that might contain commas or equals-signs.
    let maskedParameters = maskNonSourceText(parameters);
    maskedParameters = maskParentheses(maskedParameters);
    maskedParameters = maskAngleBrackets(maskedParameters);
    maskedParameters = maskBraces(maskedParameters);
    maskedParameters = maskBrackets(maskedParameters);
    maskedParameters = maskComparisonOperators(maskedParameters);

    const splitParameters = maskedParameters.split(',');
    let strippedParameters = '';
    let charPos = 0;
    for (const parameter of splitParameters) {
        if (parameter.includes('=')) {
            strippedParameters += parameters.substring(charPos, charPos + parameter.indexOf('=')).trimEnd() + ',';
        } else {
            strippedParameters += parameters.substring(charPos, charPos + parameter.length) + ',';
        }
        charPos += parameter.length + 1;
    }

    return strippedParameters.slice(0, -1);
}

export function getParameterTypes(parameters: string): string[] {
    parameters = maskNonSourceText(parameters, false);
    // Mask anything that might contain commas or equals-signs.
    let maskedParameters = maskParentheses(parameters);
    maskedParameters = maskAngleBrackets(maskedParameters);
    maskedParameters = maskBraces(maskedParameters);
    maskedParameters = maskBrackets(maskedParameters);
    maskedParameters = maskComparisonOperators(maskedParameters);

    const parameterTypes: string[] = [];
    for (const match of maskedParameters.matchAll(/(?<=^|,)[^=,]+(?==|,|$)/g)) {
        if (match.index !== undefined && !/^\s*$/.test(match[0])) {
            const maskedParameter = match[0].trimEnd();
            const parameter = parameters.slice(match.index, match.index + maskedParameter.length);

            const nameMatch = maskedParameter.match(/(?<=.+)(\b[\w_][\w\d_]*)(\s*\[\s*\])*$/s);
            if (nameMatch) {
                const parameterType = parameter.slice(0, -nameMatch[0].length).trimStart();
                if (parameterType.length !== 0 && nameMatch[1] !== 'const' && nameMatch[1] !== 'volatile'
                        && !/^(const|volatile)(\s+(const|volatile))?\s*$/.test(parameterType)) {
                    parameterTypes.push(parameterType + (nameMatch[2] ? parameter.slice(-nameMatch[2].length) : ''));

                    continue;
                }
            } else {
                const nestedDeclaratorIndex = maskedParameter.search(/\(\s*\)(\s*\(\s*\)|(\s*\[\s*\])+)$/);
                if (nestedDeclaratorIndex !== -1) {
                    const deepestRightParen = parameter.indexOf(')', nestedDeclaratorIndex);
                    if (deepestRightParen !== -1) {
                        const trimmedParameter = parameter.slice(0, deepestRightParen);
                        const parameterType = trimmedParameter.replace(/\b[\w_][\w\d_]*(?=\s*$)/, match => {
                            return (match !== 'const' && match !== 'volatile') ? '' : match;
                        }) + parameter.slice(deepestRightParen);
                        parameterTypes.push(parameterType.trimStart());

                        continue;
                    }
                }
            }

            parameterTypes.push(parameter.trimStart());
        }
    }

    return parameterTypes;
}

export function getLeadingReturnType(leadingText: string): string {
    const maskedLeadingText = maskAngleBrackets(maskNonSourceText(leadingText));

    const identifierMatches: RegExpMatchArray[] = [];
    for (const match of maskedLeadingText.matchAll(/\b[\w_][\w\d_]*\b(\s*::\s*[\w_][\w\d_]*\b)*/g)) {
        identifierMatches.push(match);
    }

    let startOfType: number | undefined;
    for (let i = identifierMatches.length - 1; i >= 0; --i) {
        if ((startOfType === undefined
                && identifierMatches[i][0] !== 'const' && identifierMatches[i][0] !== 'volatile')
            || (startOfType !== undefined
                && (identifierMatches[i][0] === 'const' || identifierMatches[i][0] === 'volatile'))) {
            startOfType = identifierMatches[i].index;
        }
    }

    return leadingText.slice(startOfType);
}

const re_trailingReturnTypeFragments =
        /\b[\w_][\w\d_]*\b(\s*::\s*[\w_][\w\d_]*\b)*(\s*<\s*>)?(\s*\(\s*\)){0,2}|&{1,2}|\*{1,}/g;
const re_constVolatileRefPtr = /^(const|volatile|&{1,2}|\*{1,})$/;

export function getTrailingReturnType(trailingText: string): string {
    const maskedTrailingText = maskAngleBrackets(maskParentheses(maskNonSourceText(trailingText)));

    let endOfType: number | undefined;
    for (const match of maskedTrailingText.matchAll(re_trailingReturnTypeFragments)) {
        if ((endOfType === undefined && !re_constVolatileRefPtr.test(match[0]))
                || (endOfType !== undefined && re_constVolatileRefPtr.test(match[0]))) {
            endOfType = match.index !== undefined ? match.index + match[0].length : undefined;
        }
    }

    return trailingText.slice(0, endOfType);
}

const re_primitiveTypes =
        /\b(void|bool|char|wchar_t|char8_t|char16_t|char32_t|int|short|long|signed|unsigned|float|double)\b/;

export function matchesPrimitiveType(text: string): boolean {
    return !(text.includes('<') && text.includes('>')) && re_primitiveTypes.test(text);
}
