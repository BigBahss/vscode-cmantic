import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cfg from './configuration';
import * as util from './utility';


export class HeaderSourceCache {
    private readonly cache = new Map<string, vscode.Uri>();

    /**
     * Gets the matching header/source file from the cache. If not cached, searches for one in the
     * workspace, caches it, and returns it. Returns undefined if not found.
     */
    async get(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const cachedMatchingUri = this.cache.get(uri.toString());
        if (cachedMatchingUri) {
            if (fs.existsSync(cachedMatchingUri.fsPath)) {
                return cachedMatchingUri;
            } else {
                this.delete(uri, cachedMatchingUri);
            }
        }

        const matchingUri = await findMatchingHeaderSource(uri);
        if (!matchingUri) {
            return;
        }

        this.set(uri, matchingUri);

        return matchingUri;
    }

    async add(uri: vscode.Uri): Promise<void> {
        await this.get(uri);
    }

    set(uri_a: vscode.Uri, uri_b: vscode.Uri): void {
        this.cache.set(uri_a.toString(), uri_b);
        this.cache.set(uri_b.toString(), uri_a);
    }

    delete(uri_a: vscode.Uri, uri_b?: vscode.Uri): void {
        if (!uri_b) {
            uri_b = this.cache.get(uri_a.toString());
        }

        this.cache.delete(uri_a.toString());
        if (uri_b) {
            this.cache.delete(uri_b.toString());
        }
    }
}

async function findMatchingHeaderSource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return;
    }

    const extension = util.fileExtension(uri.fsPath);
    const baseName = util.fileNameBase(uri.fsPath);
    const directory = path.dirname(uri.fsPath);
    const parentDirectory = path.dirname(directory);
    const headerExtensions = cfg.headerExtensions();
    const sourceExtensions = cfg.sourceExtensions();

    let globPattern: string;
    if (headerExtensions.includes(extension)) {
        globPattern = `**/${baseName}.{${sourceExtensions.join(",")}}`;
    } else if (sourceExtensions.includes(extension)) {
        globPattern = `**/${baseName}.{${headerExtensions.join(",")}}`;
    } else {
        return;
    }

    const parentDirRelativePattern = new vscode.RelativePattern(parentDirectory, globPattern);
    const parentDirRelativeUris = await vscode.workspace.findFiles(parentDirRelativePattern);
    const bestParentDirRelativeMatch = findBestMatchingUri(directory, parentDirRelativeUris);
    if (bestParentDirRelativeMatch) {
        return bestParentDirRelativeMatch;
    }

    const workspaceRelativePattern = new vscode.RelativePattern(workspaceFolder, globPattern);
    const workspaceRelativeUris = await vscode.workspace.findFiles(workspaceRelativePattern, parentDirectory);
    return findBestMatchingUri(directory, workspaceRelativeUris);
}

function findBestMatchingUri(directoryToCompare: string, uris: vscode.Uri[]): vscode.Uri | undefined {
    let bestMatch: vscode.Uri | undefined;
    let smallestDiff: number | undefined;

    for (const uri of uris) {
        if (uri.scheme !== 'file') {
            continue;
        }

        const diff = util.compareDirectoryPaths(path.dirname(uri.fsPath), directoryToCompare);
        if (smallestDiff === undefined || diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = uri;
        }
    }

    return bestMatch;
}