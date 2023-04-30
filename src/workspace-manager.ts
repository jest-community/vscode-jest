import * as vscode from 'vscode';
import * as path from 'path';
import { getPackageJson } from './helpers';

const ActivationFilePattern = [
  '**/jest.config.{js, ts, mjs, cjs, json}',
  '**/jest.json',
  '**/.vscode-jest',
];
const ActivationBinary = [
  'node_modules/.bin/jest',
  'node_modules/react-scripts/node_modules/.bin/jest',
  'node_modules/react-native-scripts',
];

export interface WorkspaceInfo {
  workspace: vscode.WorkspaceFolder;
  rootPath?: string;
  activation?: vscode.Uri;
}

export type WSJestConfigValidationType = 'deep-config' | 'shallow-config';
export type WSValidationType = WSJestConfigValidationType | 'binary' | 'jest-in-package';
interface ValidatePatternType {
  file: string[];
  binary: string[];
}

export const enabledWorkspaceFolders = (): vscode.WorkspaceFolder[] => {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }

  const windowConfig = vscode.workspace.getConfiguration('jest');
  const disabledWorkspaceFolders = windowConfig.get<string[]>('disabledWorkspaceFolders') ?? [];

  return vscode.workspace.workspaceFolders.filter((ws) => {
    if (disabledWorkspaceFolders.includes(ws.name)) {
      return false;
    }
    const config = vscode.workspace.getConfiguration('jest', ws);
    return config.get<boolean>('enable') ?? true;
  });
};

export const isSameWorkspace = (
  ws1: vscode.WorkspaceFolder,
  ws2: vscode.WorkspaceFolder
): boolean => ws1.uri.path === ws2.uri.path;
export class WorkspaceManager {
  /**
   * validate each workspace folder for jest run eligibility.
   * throw error if no workspace folder to validate.
   * @returns valid workspaceInfo array, [] if none is valid
   */
  async getValidWorkspaces(): Promise<WorkspaceInfo[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
      return Promise.reject(new Error('no workspace folder to validate'));
    }

    const validWorkspaces: Map<string, WorkspaceInfo> = new Map();
    for (const ws of enabledWorkspaceFolders()) {
      if (validWorkspaces.has(ws.uri.path)) {
        continue;
      }
      const list = await this.validateWorkspace(ws);
      list.forEach((info) => {
        if (!validWorkspaces.has(info.workspace.uri.path)) {
          validWorkspaces.set(info.workspace.uri.path, info);
        }
      });
    }
    return Array.from(validWorkspaces.values());
  }

  private toWorkspaceInfo(uri: vscode.Uri): WorkspaceInfo | undefined {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspace) {
      return;
    }
    let rootPath = path.dirname(uri.fsPath);
    if (rootPath.startsWith(workspace.uri.fsPath)) {
      rootPath = rootPath.replace(workspace.uri.fsPath, '.');
    }
    return {
      workspace,
      activation: uri,
      rootPath: rootPath === '.' ? undefined : rootPath,
    };
  }

  private toValidatePatterns(types: WSValidationType[]): ValidatePatternType {
    const result: ValidatePatternType = {
      file: [],
      binary: [],
    };
    types.forEach((type) => {
      switch (type) {
        case 'deep-config':
          result.file = ActivationFilePattern;
          break;
        case 'shallow-config':
          result.file = ActivationFilePattern.map((p) => p.replace('**/', ''));
          break;
        case 'binary':
          result.binary = ActivationBinary;
          break;
      }
    });
    return result;
  }
  /** validate if given workspace is a valid jest workspace
   * @retrun WorkspaceInfo if jest root is different from project root; otherwise undefined.
   */
  async validateWorkspace(
    workspace: vscode.WorkspaceFolder,
    types: WSValidationType[] = ['deep-config', 'binary', 'jest-in-package']
  ): Promise<WorkspaceInfo[]> {
    const validatePatterns = this.toValidatePatterns(types);

    // find activation files deeply outside of node_modules
    const activationFiles = validatePatterns.file.map((p) =>
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspace, p),
        '**/node_modules/**',
        100
      )
    );

    const results = await Promise.allSettled(activationFiles);
    const wsInfo = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .map((uri) => this.toWorkspaceInfo(uri))
      .filter((wsInfo) => wsInfo != null) as WorkspaceInfo[];

    if (wsInfo.length > 0 && wsInfo.find((info) => isSameWorkspace(info.workspace, workspace))) {
      return wsInfo;
    }

    // check jest binary
    for (const p of validatePatterns.binary) {
      const results = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspace, p),
        null,
        1
      );
      if (results.length > 0) {
        return [...wsInfo, { workspace }];
      }
    }

    // check jest config within wotkspace's package.json
    if (types.includes('jest-in-package')) {
      const packageJson = getPackageJson(workspace.uri.fsPath);
      if (packageJson && packageJson.jest) {
        return [...wsInfo, { workspace }];
      }
    }

    return wsInfo;
  }

  /**
   * retrieve monorepo workspaces(folders) info from investigate the file systems:
   * 1. if the project has a "workspaces" attribute in its package.json => use that
   * 2. otherwise, get all the folders with "package.json"
   * @returns list of uri of the folders found, throw exception if none can be found.
   */
  public async getFoldersFromFilesystem(workspace?: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    for (const [index, f] of [
      this.getFoldersByPackageWorkspaces,
      this.getFoldersByPackageFile,
    ].entries()) {
      try {
        const uris = await f(workspace);
        if (uris.length > 0) {
          return uris;
        }
      } catch (e) {
        console.warn(`get folder from file system attempt ${index + 1}-of-2 failed:`, e);
      }
    }

    // no monorepo workspaces found in file system
    return [];
  }
  private toDirUri = (uri: vscode.Uri): vscode.Uri => {
    const dir = path.dirname(uri.fsPath);
    return vscode.Uri.file(dir);
  };
  public getFoldersByPackageFile = async (
    workspace?: vscode.WorkspaceFolder
  ): Promise<vscode.Uri[]> => {
    const root = workspace ?? vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return Promise.resolve([]);
    }

    const results = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root, '**/package.json'),
      '**/node_modules/**'
    );
    return results.map((uri) => this.toDirUri(uri));
  };
  private getFoldersByPackageWorkspaces = async (
    workspace?: vscode.WorkspaceFolder
  ): Promise<vscode.Uri[]> => {
    const root = workspace ?? vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return Promise.resolve([]);
    }
    const pmWorkspaces = getPackageJson(root.uri.fsPath)?.workspaces;
    if (!pmWorkspaces || !Array.isArray(pmWorkspaces)) {
      // No package.json or no "workspaces" config in package.json
      return Promise.resolve([]);
    }

    const promises = pmWorkspaces.flatMap((ws) =>
      vscode.workspace.findFiles(
        new vscode.RelativePattern(root, `${ws}/**/package.json`),
        '**/node_modules/**',
        100
      )
    );

    const results = await Promise.allSettled(promises);
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.map((uri) => this.toDirUri(uri)) : []
    );
  };
}
