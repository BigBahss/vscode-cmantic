import * as vscode from 'vscode';
import * as xregexp from 'xregexp';
import CSymbol from './CSymbol';
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
                    text = text.substring(0, unbalancedIndex) + ' ';
                    if (unbalancedIndex !== text.length - 1) {
                        text += text.substring(unbalancedIndex + 1);
                    }
                    return maskBalanced(text, left, right, keepEnclosingChars);
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

export function maskNonSourceText(text: string): string {
    text = maskComments(text, false);
    text = maskRawStringLiterals(text);
    text = maskQuotes(text);
    return maskAttributes(text);
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

export function normalize(text: string): string {
    return text.replace(/\b\s+\B|\B\s+\b|\B\s+\B/g, '').replace(/\s+/g, ' ');
}

/**
 * Different language servers format DocumentSymbol.name differently. For instance, cpptools
 * puts function signatures in DocumentSymbol.name. The name might also be scope-qualified.
 * Returns the bare, unqualified name of the symbol.
 */
export function getNormalizedSymbolName(documentSymbolName: string): string {
    // Used to trim function and template parameters from the end of the name (if present).
    function trimDelimitedFromEndOfName(name: string, leftDelim: string, rightDelim: string): string {
        let indexOfLeftDelim = name.indexOf(leftDelim);
        const lastIndexOfRightDelim = name.lastIndexOf(rightDelim);

        if (indexOfLeftDelim > 0 && lastIndexOfRightDelim > indexOfLeftDelim) {
            let trimmedName = name.slice(0, indexOfLeftDelim).trimEnd();
            if (trimmedName === 'operator' || trimmedName.endsWith('::operator')) {
                indexOfLeftDelim = name.indexOf(leftDelim, indexOfLeftDelim);
                if (indexOfLeftDelim > 0) {
                    trimmedName = name.slice(0, indexOfLeftDelim).trimEnd();
                } else {
                    trimmedName = name;
                }
            }
            name = trimmedName;
        }

        return name;
    }

    documentSymbolName = trimDelimitedFromEndOfName(documentSymbolName, '(', ')');

    documentSymbolName = trimDelimitedFromEndOfName(documentSymbolName, '<', '>');

    const lastIndexOfScopeResolution = documentSymbolName.lastIndexOf('::');
    if (lastIndexOfScopeResolution !== -1 && !documentSymbolName.endsWith('::')) {
        documentSymbolName = documentSymbolName.slice(lastIndexOfScopeResolution + 2);
    }

    return documentSymbolName;
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

export function getRangeOfSymbolName(symbol: CSymbol): vscode.Range {
    if (symbol.document.getText(symbol.selectionRange) === symbol.name) {
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

    return strippedParameters.substring(0, strippedParameters.length - 1);
}

const re_primitiveTypes = /\b(void|bool|char|wchar_t|char8_t|char16_t|char32_t|int|short|long|signed|unsigned|float|double)\b/;

export function matchesPrimitiveType(text: string): boolean {
    return !(text.includes('<') && text.includes('>')) && re_primitiveTypes.test(text);
}
