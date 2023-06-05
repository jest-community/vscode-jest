import * as vscode from 'vscode';
import * as path from 'path';
import { getPackageJson } from './helpers';
import { VirtualWorkspaceFolder, isVirtualWorkspaceFolder } from './virtual-workspace-folder';
import { VirtualFolderSettings } from './Settings';

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

export interface WorkspaceFolderInfo {
  folder: vscode.WorkspaceFolder;
  rootPath?: string;
  activation?: vscode.Uri;
}

export type WSJestConfigValidationType = 'deep-config' | 'shallow-config';
export type WSValidationType = WSJestConfigValidationType | 'binary' | 'jest-in-package';
interface ValidatePatternType {
  file: string[];
  binary: string[];
}

/**
 * return all workspace folders, including virtual ones within the given workspace folder.
 * If no virtual workspace folder is found, return the given workspace folder in an array;
 * otherwise return an array of virtual workspace folders.
 * @param workspaceFolder
 * @returns
 */
const expandWithVirtualFolders = (
  workspaceFolder: vscode.WorkspaceFolder,
  enableFilter?: EnableFolderFilter
): vscode.WorkspaceFolder[] => {
  // check if there is venv
  const config = vscode.workspace.getConfiguration('jest', workspaceFolder);
  const vFolders = config.get<VirtualFolderSettings[]>('virtualFolders');
  if (!vFolders || vFolders.length <= 0) {
    return [workspaceFolder];
  }

  const isEnabled = enableFilter ?? createEnableFilter();

  return vFolders
    .map((folder) => new VirtualWorkspaceFolder(workspaceFolder, folder.name, folder.rootPath))
    .filter(isEnabled);
};

type EnableFolderFilter = (folder: vscode.WorkspaceFolder) => boolean;
/**
 * Returns a function that filters out disabled workspace folders and virtual folders that are disabled in the Jest configuration.
 * @returns A EnableFolderFilter filter function that takes a `vscode.WorkspaceFolder` object as an argument and returns a boolean value.
 */
const createEnableFilter = (): EnableFolderFilter => {
  const windowConfig = vscode.workspace.getConfiguration('jest');
  const disabledWorkspaceFolders = windowConfig.get<string[]>('disabledWorkspaceFolders') ?? [];

  return (folder: vscode.WorkspaceFolder) => {
    if (disabledWorkspaceFolders.includes(folder.name)) {
      return false;
    }
    const actualFolder = isVirtualWorkspaceFolder(folder) ? folder.actualWorkspaceFolder : folder;
    const config = vscode.workspace.getConfiguration('jest', actualFolder);
    if (config.get<boolean>('enable') === false) {
      return false;
    }
    if (isVirtualWorkspaceFolder(folder)) {
      const vFolder = config
        .get<VirtualFolderSettings[]>('virtualFolders')
        ?.find((f) => f.name === folder.name);

      if (!vFolder) {
        throw new Error(
          `Virtual folder "${folder.name}" not found in workspace folder "${folder.actualWorkspaceFolder.name}"`
        );
      }
      return vFolder['enable'] ?? true;
    }
    return true;
  };
};
export const enabledWorkspaceFolders = (includingVirtual = true): vscode.WorkspaceFolder[] => {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }

  const enableFilter = createEnableFilter();
  const enabled = vscode.workspace.workspaceFolders.filter(enableFilter);

  return includingVirtual
    ? enabled.flatMap((ws) => expandWithVirtualFolders(ws, enableFilter))
    : enabled;
};

export const isInFolder = (uri: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder): boolean => {
  if (isVirtualWorkspaceFolder(workspaceFolder)) {
    return workspaceFolder.isInWorkspaceFolder(uri);
  }
  return vscode.workspace.getWorkspaceFolder(uri)?.name === workspaceFolder.name;
};

export const isSameWorkspace = (
  ws1: vscode.WorkspaceFolder,
  ws2: vscode.WorkspaceFolder
): boolean => ws1.uri.path === ws2.uri.path;

/**
 * A class to manage all workspace folders and their jest configurations.
 */
export class WorkspaceManager {
  /**
   * validate each workspace (physical) folder for jest run eligibility.
   * throw error if no workspace folder to validate.
   * @returns valid workspaceInfo array, [] if none is valid
   */
  async getValidWorkspaceFolders(): Promise<WorkspaceFolderInfo[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
      return Promise.reject(new Error('no workspace folder to validate'));
    }

    const validWorkspaces: Map<string, WorkspaceFolderInfo> = new Map();
    for (const ws of enabledWorkspaceFolders(false)) {
      if (validWorkspaces.has(ws.uri.path)) {
        continue;
      }
      const list = await this.validateWorkspaceFolder(ws);
      list.forEach((info) => {
        if (!validWorkspaces.has(info.folder.uri.path)) {
          validWorkspaces.set(info.folder.uri.path, info);
        }
      });
    }
    return Array.from(validWorkspaces.values());
  }

  private toWorkspaceFolderInfo(uri: vscode.Uri): WorkspaceFolderInfo | undefined {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspace) {
      return;
    }
    let rootPath = path.dirname(uri.fsPath);
    if (rootPath.startsWith(workspace.uri.fsPath)) {
      rootPath = rootPath.replace(workspace.uri.fsPath, '.');
    }
    return {
      folder: workspace,
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
  async validateWorkspaceFolder(
    workspace: vscode.WorkspaceFolder,
    types: WSValidationType[] = ['deep-config', 'binary', 'jest-in-package']
  ): Promise<WorkspaceFolderInfo[]> {
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
      .map((uri) => this.toWorkspaceFolderInfo(uri))
      .filter((wsInfo) => wsInfo != null) as WorkspaceFolderInfo[];

    if (wsInfo.length > 0 && wsInfo.find((info) => isSameWorkspace(info.folder, workspace))) {
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
        return [...wsInfo, { folder: workspace }];
      }
    }

    // check jest config within wotkspace's package.json
    if (types.includes('jest-in-package')) {
      const packageJson = getPackageJson(workspace.uri.fsPath);
      if (packageJson && packageJson.jest) {
        return [...wsInfo, { folder: workspace }];
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
