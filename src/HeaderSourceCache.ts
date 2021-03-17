import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cfg from './configuration';
import * as util from './utility';


export default class HeaderSourceCache {
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

    delete(...uris: vscode.Uri[]): void {
        uris.forEach(uri => this.cache.delete(uri.toString()));
    }
}

async function findMatchingHeaderSource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return;
    }

    const p_matchingUris: Thenable<vscode.Uri[]>[] = [];
    getMatchingHeaderSourcePatterns(uri).forEach(pattern => {
        const relativePattern = new vscode.RelativePattern(workspaceFolder, pattern);
        p_matchingUris.push(vscode.workspace.findFiles(relativePattern));
    });
    const matchingUris = await Promise.all(p_matchingUris);

    return findBestMatchingUri(path.dirname(uri.fsPath), matchingUris.flat());
}

function getMatchingHeaderSourcePatterns(uri: vscode.Uri): string[] {
    const extension = util.fileExtension(uri.fsPath);
    const baseName = util.fileNameBase(uri.fsPath);

    if (cfg.headerExtensions(uri).includes(extension)) {
        return buildFilePatterns(cfg.sourceFolderPatterns(uri), baseName, cfg.sourceExtensions(uri));
    }

    if (cfg.sourceExtensions(uri).includes(extension)) {
        return buildFilePatterns(cfg.headerFolderPatterns(uri), baseName, cfg.headerExtensions(uri));
    }

    return [];
}

function buildFilePatterns(directoryPatterns: string[], baseName: string, extensions: string[]): string[] {
    const patterns: string[] = [];
    directoryPatterns.forEach(directoryPattern => {
        patterns.push(directoryPattern + `${baseName}.{${extensions.join(",")}}`);
    });
    return patterns;
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
