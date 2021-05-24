import * as vscode from 'vscode';
import * as parse from './parsing';
import * as util from './utility';


export interface Parameter {
    readonly text: string;
    readonly type: string;
    readonly normalizedType: string;
    readonly name: string;
    readonly defaultValue: string;
    readonly range: vscode.Range;
    isEqual(other: Parameter): boolean;
    withName(name?: string): string;
}

export interface ParameterList extends ReadonlyArray<Parameter> {
    readonly range: vscode.Range;
    isEqual(other: ParameterList): boolean;
    isReordered(other: ParameterList): boolean;
    typesAreEqual(other: ParameterList): boolean;
    typesAreReordered(other: ParameterList): boolean;
}

export function parseParameterList(document: vscode.TextDocument, range: vscode.Range): ParameterList {
    const parameters = parse.maskNonSourceText(document.getText(range), false);
    // Mask anything that might contain commas or equals-signs.
    let maskedParameters = parse.maskParentheses(parameters);
    maskedParameters = parse.maskAngleBrackets(maskedParameters);
    maskedParameters = parse.maskBraces(maskedParameters);
    maskedParameters = parse.maskBrackets(maskedParameters);
    maskedParameters = parse.maskComparisonOperators(maskedParameters);

    const startOffset = document.offsetAt(range.start);

    const parameterList = new _ParameterList(range);
    for (const match of maskedParameters.matchAll(/(?<=^|,)(\s*)([^,]+)(?=,|$)/g)) {
        if (match.index !== undefined && !/^\s*$/.test(match[2])) {
            const index = match.index + match[1].length;
            const maskedParameter = match[2].trimEnd();
            const parameter = parameters.slice(index, index + maskedParameter.length);
            parameterList.push(parseParameter(parameter, maskedParameter, startOffset + index, document));
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

    const nameMatch = maskedParameter.match(/(?<=.+)\s*(\b[\w_][\w\d_]*)(\s*\[\s*\])*$/s);
    if (nameMatch) {
        const parameterType = parameter.slice(0, -nameMatch[0].length);
        if (parameterType.length !== 0 && nameMatch[1] !== 'const' && nameMatch[1] !== 'volatile'
                && !/^(const|volatile)(\s+(const|volatile))?\s*$/.test(parameterType)) {
            return new _Parameter(
                rawParameter,
                parameterType + (nameMatch[2] ? parameter.slice(-nameMatch[2].length) : ''),
                parameterType.length,
                nameMatch[1],
                defaultValue,
                range
            );
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
                    return new _Parameter(
                        rawParameter,
                        parameterType,
                        nestedNameMatch.index,
                        nestedNameMatch[0],
                        defaultValue,
                        range
                    );
                } else {
                    return new _Parameter(
                        rawParameter,
                        parameter,
                        deepestRightParen,
                        '',
                        defaultValue,
                        range
                    );
                }
            }
        }
    }

    const arrayIndex = parameter.search(/\[\s*\](\s*\[\s*\])*/);

    return new _Parameter(
        rawParameter,
        parameter,
        arrayIndex !== -1 ? arrayIndex : parameter.length,
        '',
        defaultValue,
        range
    );
}

class _ParameterList extends Array<Parameter> implements ParameterList {
    readonly range: vscode.Range;

    constructor(range: vscode.Range) {
        super();
        this.range = range;
    }

    isEqual(other: ParameterList): boolean {
        return util.arraysAreEqual(this, other, (a, b) => a.isEqual(b));
    }

    isReordered(other: ParameterList): boolean {
        if (this.length !== other.length || this.isEqual(other)) {
            return false;
        }

        const sorted = this.slice().sort(compareParameterTypes);
        const otherSorted = other.slice().sort(compareParameterTypes);

        return util.arraysAreEqual(sorted, otherSorted, (a, b) => a.isEqual(b));
    }

    typesAreEqual(other: ParameterList): boolean {
        return util.arraysAreEqual(this, other, (a, b) => a.normalizedType === b.normalizedType);
    }

    typesAreReordered(other: ParameterList): boolean {
        if (this.length !== other.length || this.typesAreEqual(other)) {
            return false;
        }

        const sortedTypes = this.map(parameter => parameter.normalizedType).sort();
        const otherSortedTypes = other.map(parameter => parameter.normalizedType).sort();

        return util.arraysAreEqual(sortedTypes, otherSortedTypes);
    }
}

function compareParameterTypes(a: Parameter, b: Parameter): number {
    return a.normalizedType < b.normalizedType ? -1 : (a.normalizedType > b.normalizedType ? 1 : 0);
}

class _Parameter implements Parameter {
    private _normalizedType?: string;

    get normalizedType(): string {
        return this._normalizedType ?? (this._normalizedType = parse.normalizeSourceText(this.type));
    }

    constructor(
        readonly text: string,
        readonly type: string,
        readonly indexOfName: number,
        readonly name: string,
        readonly defaultValue: string,
        readonly range: vscode.Range
    ) { }

    isEqual(other: Parameter): boolean {
        return this.normalizedType === other.normalizedType && this.name === other.name;
    }

    withName(name: string = this.name): string {
        const typeSnippet = this.type.slice(0, this.indexOfName);
        return /[\w\d_][^\w\d_\s]*$/.test(typeSnippet) && name.length !== 0
                ? typeSnippet + ' ' + name + this.type.slice(this.indexOfName)
                : typeSnippet + name + this.type.slice(this.indexOfName);
    }
}
