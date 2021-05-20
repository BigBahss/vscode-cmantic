import * as vscode from 'vscode';
import * as parse from './parsing';


export interface Parameter {
    readonly raw: string;
    readonly type: string;
    readonly name: string;
    readonly defaultValue: string;
    readonly range: vscode.Range;
}

export type ParameterList = ReadonlyArray<Parameter>;

export function parseParameterList(
    parameters: string, startOffset: number, document: vscode.TextDocument
): ParameterList {
    parameters = parse.maskNonSourceText(parameters, false);
    // Mask anything that might contain commas or equals-signs.
    let maskedParameters = parse.maskParentheses(parameters);
    maskedParameters = parse.maskAngleBrackets(maskedParameters);
    maskedParameters = parse.maskBraces(maskedParameters);
    maskedParameters = parse.maskBrackets(maskedParameters);
    maskedParameters = parse.maskComparisonOperators(maskedParameters);

    const parameterList: Parameter[] = [];
    for (const match of maskedParameters.matchAll(/(?<=^|,)(\s*)([^,]+)\s*(?=,|$)/g)) {
        if (match.index !== undefined && !/^\s*$/.test(match[2])) {
            const index = match.index + match[1].length;
            const parameter = parameters.slice(index, index + match[2].length);
            parameterList.push(parseParameter(parameter, match[2], startOffset + index, document));
        }
    }

    return parameterList;
}

function parseParameter(
    rawParameter: string, maskedParameter: string, startOffset: number, document: vscode.TextDocument
): Parameter {
    const defaultValueMatch = maskedParameter.match(/(\s*=\s*)(.+)$/);
    const defaultValue = defaultValueMatch ? defaultValueMatch[2] : '';
    const parameter = rawParameter.slice(0, defaultValueMatch?.index);
    maskedParameter = maskedParameter.slice(0, parameter.length);

    const start = document.positionAt(startOffset);
    const end = document.positionAt(rawParameter.length + startOffset);
    const range = new vscode.Range(start, end);

    const nameMatch = maskedParameter.match(/(?<=.+)(\b[\w_][\w\d_]*)(\s*\[\s*\])*$/s);
    if (nameMatch) {
        const parameterType = parameter.slice(0, -nameMatch[0].length).trim();
        if (parameterType.length !== 0 && nameMatch[1] !== 'const' && nameMatch[1] !== 'volatile'
                && !/^(const|volatile)(\s+(const|volatile))?\s*$/.test(parameterType)) {
            return {
                raw: rawParameter.trim(),
                type: parameterType + (nameMatch[2] ? parameter.slice(-nameMatch[2].length) : ''),
                name: nameMatch[1],
                defaultValue: defaultValue,
                range: range
            };
        }
    } else {
        const nestedDeclaratorIndex = maskedParameter.search(/\(\s*\)(\s*\(\s*\)|(\s*\[\s*\])+)$/);
        if (nestedDeclaratorIndex !== -1) {
            const deepestRightParen = parameter.indexOf(')', nestedDeclaratorIndex);
            if (deepestRightParen !== -1) {
                const trimmedParameter = parameter.slice(0, deepestRightParen);
                const nestedNameMatch = trimmedParameter.match(/\b[\w_][\w\d_]*(?=\s*$)/);
                if (nestedNameMatch?.index !== undefined
                        && nestedNameMatch[0] !== 'const' && nestedNameMatch[0] !== 'volatile') {
                    const parameterType = trimmedParameter.slice(0, nestedNameMatch.index)
                            + trimmedParameter.slice(nestedNameMatch.index + nestedNameMatch[0].length)
                            + parameter.slice(deepestRightParen);
                    return {
                        raw: rawParameter.trim(),
                        type: parameterType.trim(),
                        name: nestedNameMatch[0],
                        defaultValue: defaultValue,
                        range: range
                    };
                }
            }
        }
    }

    return {
        raw: rawParameter.trim(),
        type: parameter.trim(),
        name: '',
        defaultValue: defaultValue,
        range: range
    };
}
