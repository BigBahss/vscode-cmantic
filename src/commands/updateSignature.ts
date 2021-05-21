import * as vscode from 'vscode';
import * as parse from '../parsing';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';
import FunctionSignature from '../FunctionSignature';
import { logger } from '../extension';


export async function updateSignature(
    currentFunction: CSymbol,
    sourceDoc: SourceDocument,
    linkedLocation: vscode.Location
): Promise<boolean | undefined> {
    const linkedDoc = linkedLocation.uri.fsPath === sourceDoc.uri.fsPath
            ? sourceDoc
            : await SourceDocument.open(linkedLocation.uri);
    const linkedFunction = await linkedDoc.getSymbol(linkedLocation.range.start);

    if (currentFunction.isFunctionDeclaration()) {
        if (!linkedFunction?.isFunctionDefinition() || linkedFunction.name !== currentFunction.name) {
            logger.alertError('The linked definition could not be found.');
            return;
        }
    } else {
        if (!linkedFunction?.isFunctionDeclaration() || linkedFunction.name !== currentFunction.name) {
            logger.alertError('The linked declaration could not be found.');
            return;
        }
    }

    const currentSig = new FunctionSignature(currentFunction);
    const linkedSig = new FunctionSignature(linkedFunction);

    const workspaceEdit = new vscode.WorkspaceEdit();

    updateReturnType(currentSig, linkedSig, linkedDoc, workspaceEdit);
    updateParameters(currentSig, linkedSig, linkedDoc, workspaceEdit);
    updateSpecifiers(currentSig, linkedSig, linkedDoc, workspaceEdit);

    return vscode.workspace.applyEdit(workspaceEdit);
}

function updateReturnType(
    currentSig: FunctionSignature,
    linkedSig: FunctionSignature,
    linkedDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    if (currentSig.normalizedReturnType !== linkedSig.normalizedReturnType) {
        const nextCharEnd = linkedSig.returnTypeRange.end.translate(0, 1);
        const nextChar = linkedDoc.getText(new vscode.Range(linkedSig.returnTypeRange.end, nextCharEnd));
        const newReturnType = /[\w\d_]$/.test(currentSig.returnType) && /^[\w\d_]/.test(nextChar)
                ? currentSig.returnType + ' '
                : currentSig.returnType;
        workspaceEdit.replace(linkedDoc.uri, linkedSig.returnTypeRange, newReturnType);
    }
}

function updateParameters(
    currentSig: FunctionSignature,
    linkedSig: FunctionSignature,
    linkedDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    if (currentSig.parameters.typesEquals(linkedSig.parameters)) {
        return;
    }
}

function updateSpecifiers(
    currentSig: FunctionSignature,
    linkedSig: FunctionSignature,
    linkedDoc: SourceDocument,
    workspaceEdit: vscode.WorkspaceEdit
): void {
    const declaration = parse.maskComments(linkedDoc.getText(linkedSig.range), true);
    const startOffset = linkedDoc.offsetAt(linkedSig.range.start);

    function removeLeadingSpecifier(re_specifier: RegExp): void {
        const match = declaration.match(re_specifier);
        if (match?.index !== undefined) {
            const matchOffset = startOffset + match.index;
            const range = linkedDoc.rangeAt(matchOffset, matchOffset + match[0].length);
            workspaceEdit.replace(linkedDoc.uri, range, '');
        }
    }

    if (currentSig.isConstexpr && !linkedSig.isConstexpr) {
        workspaceEdit.insert(linkedDoc.uri, linkedSig.range.start, 'constexpr ');
    } else if (!currentSig.isConstexpr && linkedSig.isConstexpr) {
        removeLeadingSpecifier(/\bconstexpr\b[ \t]*/);
    }

    if (currentSig.isConsteval && !linkedSig.isConsteval) {
        workspaceEdit.insert(linkedDoc.uri, linkedSig.range.start, 'consteval ');
    } else if (!currentSig.isConsteval && linkedSig.isConsteval) {
        removeLeadingSpecifier(/\bconsteval\b[ \t]*/);
    }

    let trailingSpecifiers = linkedDoc.getText(linkedSig.trailingSpecifierRange);
    let maskedSpecifiers = parse.maskComments(trailingSpecifiers, true);
    maskedSpecifiers = parse.maskRawStringLiterals(maskedSpecifiers, true);
    maskedSpecifiers = parse.maskQuotes(maskedSpecifiers, true);
    maskedSpecifiers = parse.maskAttributes(maskedSpecifiers, true);
    maskedSpecifiers = parse.maskParentheses(maskedSpecifiers, true);

    if (currentSig.isConst && !linkedSig.isConst) {
        const specifier = /^[\w\d_]/.test(trailingSpecifiers) ? ' const ' : ' const';
        trailingSpecifiers = specifier + trailingSpecifiers;
        maskedSpecifiers = specifier + maskedSpecifiers;
    } else if (!currentSig.isConst && linkedSig.isConst) {
        const match = maskedSpecifiers.match(/(?<!\n)[ \t]*\bconst\b/);
        if (match?.index !== undefined) {
            trailingSpecifiers = trailingSpecifiers.slice(0, match.index)
                    + trailingSpecifiers.slice(match.index + match[0].length);
            maskedSpecifiers = maskedSpecifiers.slice(0, match.index)
                    + maskedSpecifiers.slice(match.index + match[0].length);
        }
    }

    if (currentSig.isVolatile && !linkedSig.isVolatile) {
        const specifier = /^[\w\d_]/.test(trailingSpecifiers) ? ' volatile ' : ' volatile';
        trailingSpecifiers = specifier + trailingSpecifiers;
        maskedSpecifiers = specifier + maskedSpecifiers;
    } else if (!currentSig.isVolatile && linkedSig.isVolatile) {
        const match = maskedSpecifiers.match(/(?<!\n)[ \t]*\bvolatile\b/);
        if (match?.index !== undefined) {
            trailingSpecifiers = trailingSpecifiers.slice(0, match.index)
                    + trailingSpecifiers.slice(match.index + match[0].length);
            maskedSpecifiers = maskedSpecifiers.slice(0, match.index)
                    + maskedSpecifiers.slice(match.index + match[0].length);
        }
    }

    if (currentSig.refQualifier !== linkedSig.refQualifier) {
        if (linkedSig.refQualifier.length !== 0) {
            trailingSpecifiers = trailingSpecifiers.replace(linkedSig.refQualifier, currentSig.refQualifier);
            maskedSpecifiers = maskedSpecifiers.replace(linkedSig.refQualifier, currentSig.refQualifier);
        } else {
            const match = maskedSpecifiers.match(/^[\s\/\*]*(const|volatile)([\s\/\*]*(const|volatile))?/);
            if (match) {
                trailingSpecifiers = trailingSpecifiers.slice(0, match[0].length)
                        + ' ' + currentSig.refQualifier + trailingSpecifiers.slice(match[0].length);
                maskedSpecifiers = match[0] + ' ' + currentSig.refQualifier + maskedSpecifiers.slice(match[0].length);
            } else {
                trailingSpecifiers = ' ' + currentSig.refQualifier + trailingSpecifiers;
                maskedSpecifiers = ' ' + currentSig.refQualifier + maskedSpecifiers;
            }
        }
    }

    if (currentSig.normalizedNoexcept !== linkedSig.normalizedNoexcept) {
        if (linkedSig.normalizedNoexcept.length === 0) {
            trailingSpecifiers += currentSig.noexcept;
        } else {
            const match = maskedSpecifiers.match(/(?<!\n)([ \t]*)\bnoexcept\b(\s*\(\s*\))?/);
            if (match?.index !== undefined) {
                trailingSpecifiers = trailingSpecifiers.slice(0, match.index + match[1].length)
                        + currentSig.noexcept + trailingSpecifiers.slice(match.index + match[0].length);
            }
        }
    }

    workspaceEdit.replace(linkedDoc.uri, linkedSig.trailingSpecifierRange, trailingSpecifiers);
}
