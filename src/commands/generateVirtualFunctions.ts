import * as vscode from 'vscode';
import SourceDocument from '../SourceDocument';
import CSymbol from '../CSymbol';
import SubSymbol from '../SubSymbol';
import FunctionSignature from '../FunctionSignature';


export const title = 'Implement Functions...';

export const failure = {
    noActiveTextEditor: 'No active text editor detected.',
    noClassOrStruct: 'No class or struct detected.'
};

export async function implementFunctions(
    parentClass: CSymbol,
    classDoc: SourceDocument,
    baseClasses: SubSymbol[]
): Promise<boolean | undefined> {
    const pureVirtualFunctions = await getPureVirtualFunctionsOfClassHierarchy(baseClasses);

    return;
}

async function getPureVirtualFunctionsOfClassHierarchy(baseClasses: SubSymbol[]): Promise<CSymbol[]> {
    const definitions = await getDefinitionLocations(baseClasses);

    const classSymbols = await getDefinitionSymbols(definitions);

    const p_members: Promise<CSymbol[]>[] = [];
    classSymbols.forEach(classSymbol => {
        p_members.push(getPureVirtualFunctionsOfClassHierarchy(classSymbol.baseClasses()));
    });
    const members = (await Promise.all(p_members)).flat();

    classSymbols.forEach(classSymbol => {
        classSymbol.children.forEach(child => {
            const childCSymbol = new CSymbol(child, classSymbol.document);
            if (childCSymbol.isPureVirtual()) {
                members.push(childCSymbol);
            } else if (childCSymbol.isFunction()) {
                for (let i = 0; i < members.length; ++i) {
                    if (members[i].name === childCSymbol.name) {
                        const memberSig = new FunctionSignature(members[i]);
                        const currentSig = new FunctionSignature(childCSymbol);

                        if (currentSig.isEqual(memberSig)) {
                            members.splice(i, 1);
                        }
                    }
                }
            }
        });
    });

    return members;
}

async function getDefinitionLocations(baseClasses: SubSymbol[]): Promise<vscode.Location[]> {
    const p_definitions: Promise<vscode.Location | undefined>[] = [];
    baseClasses.forEach(baseClass => p_definitions.push(async function () {
        const definitions = await baseClass.findDefinitions();
        return definitions[0];
    } ()));
    const definitions = await Promise.all(p_definitions);

    return definitions.filter((definition): definition is vscode.Location => {
        return definition !== undefined;
    });
}

async function getDefinitionSymbols(definitions: vscode.Location[]): Promise<CSymbol[]> {
    const p_classSymbols: Promise<CSymbol | undefined>[] = [];
    definitions.forEach(definition => {
        p_classSymbols.push(SourceDocument.getSymbol(definition));
    });
    const classSymbols = await Promise.all(p_classSymbols);

    return classSymbols.filter((classSymbol): classSymbol is CSymbol => {
        return classSymbol !== undefined;
    });
}
