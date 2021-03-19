import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import * as util from './utility';


export default class HeaderSourceCache {
    private readonly cache = new Map<string, vscode.Uri>();
    private readonly directories = new Map<string, CodeDirectories>();

    async findHeaderSourceDirectories(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        const newDirectories = await findHeaderSourceDirectories(
                workspaceFolder.uri, cfg.headerExtensions(), cfg.sourceExtensions());
        this.directories.set(workspaceFolder.uri.toString(), newDirectories);
    }

    /**
     * Gets the matching header/source uri from the cache, checking that the file still exists. If the uri
     * is not cached/no longer exists, this searches for one in the workspace, caches it, and returns it.
     * Returns undefined if not found.
     */
    async get(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const cachedMatchingUri = this.cache.get(uri.toString());
        if (cachedMatchingUri) {
            if (util.uriExists(cachedMatchingUri)) {
                return cachedMatchingUri;
            } else {
                this.delete(uri, cachedMatchingUri);
            }
        }

        return this.findAndSet(uri);
    }

    async add(uri: vscode.Uri): Promise<void> {
        await this.findAndSet(uri);
    }

    set(uri_a: vscode.Uri, uri_b: vscode.Uri): void {
        this.cache.set(uri_a.toString(), uri_b);
        this.cache.set(uri_b.toString(), uri_a);
    }

    delete(...uris: vscode.Uri[]): void {
        uris.forEach(uri => this.cache.delete(uri.toString()));
    }

    private async findAndSet(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return;
        }

        let directories = this.directories.get(workspaceFolder.uri.toString());
        if (!directories) {
            await this.findHeaderSourceDirectories(workspaceFolder);
            directories = this.directories.get(workspaceFolder.uri.toString())!;
        }

        const matchingUri = await findMatchingHeaderSource(uri, directories);
        if (!matchingUri) {
            return;
        }

        this.set(uri, matchingUri);

        return matchingUri;
    }
}

interface CodeDirectories {
    headers: string[];
    sources: string[];
}

async function findHeaderSourceDirectories(
    directoryUri: vscode.Uri, headerExtensions: string[], sourceExtensions: string[]
): Promise<CodeDirectories> {
    const headerDirectories: string[] = [];
    const sourceDirectories: string[] = [];
    const p_directories: Promise<CodeDirectories>[] = [];
    let foundHeader = false;
    let foundSource = false;

    (await vscode.workspace.fs.readDirectory(directoryUri)).forEach(fileSystemItem => {
        const ext = util.fileExtension(fileSystemItem[0]);
        if (fileSystemItem[1] === vscode.FileType.Directory) {
            p_directories.push(findHeaderSourceDirectories(
                    vscode.Uri.joinPath(directoryUri, fileSystemItem[0]), headerExtensions, sourceExtensions));
        } else if (!foundHeader && fileSystemItem[1] === vscode.FileType.File && headerExtensions.includes(ext)) {
            foundHeader = true;
            headerDirectories.push(getWorkspaceRelativePath(directoryUri));
        } else if (!foundSource && fileSystemItem[1] === vscode.FileType.File && sourceExtensions.includes(ext)) {
            foundSource = true;
            sourceDirectories.push(getWorkspaceRelativePath(directoryUri));
        }
    });

    (await Promise.all(p_directories)).forEach(directories => {
        headerDirectories.push(...directories.headers);
        sourceDirectories.push(...directories.sources);
    });

    return { headers: headerDirectories, sources: sourceDirectories };
}

function getWorkspaceRelativePath(directoryUri: vscode.Uri): string {
    const path = vscode.workspace.asRelativePath(directoryUri.path);
    if (path === directoryUri.path) {
        return '';
    }
    return path + '/';
}

async function findMatchingHeaderSource(
    uri: vscode.Uri, directories: CodeDirectories
): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return;
    }

    const p_matchingUris: Thenable<vscode.Uri[]>[] = [];
    getMatchingHeaderSourcePatterns(uri, directories).forEach(pattern => {
        const relativePattern = new vscode.RelativePattern(workspaceFolder, pattern);
        p_matchingUris.push(vscode.workspace.findFiles(relativePattern));
    });
    const matchingUris = await Promise.all(p_matchingUris);

    return findBestMatchingUri(path.dirname(uri.fsPath), matchingUris.flat());
}

function getMatchingHeaderSourcePatterns(uri: vscode.Uri, directories: CodeDirectories): string[] {
    const ext = util.fileExtension(uri.fsPath);
    const baseName = util.fileNameBase(uri.fsPath);

    if (cfg.headerExtensions(uri).includes(ext)) {
        return buildFilePatterns(directories.sources, baseName, cfg.sourceExtensions(uri));
    }

    if (cfg.sourceExtensions(uri).includes(ext)) {
        return buildFilePatterns(directories.headers, baseName, cfg.headerExtensions(uri));
    }

    return [];
}

function buildFilePatterns(directories: string[], baseName: string, extensions: string[]): string[] {
    const patterns: string[] = [];
    directories.forEach(directory => {
        patterns.push(directory + `${baseName}.{${extensions.join(",")}}`);
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
