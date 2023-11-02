import * as vscode from 'vscode';
import { GetConfigFunction, VirtualFolderSettings, VirtualFolderSettingKey } from './types';
import { isVirtualWorkspaceFolder } from '../virtual-workspace-folder';

/**
 * Returns a function that retrieves Jest configuration settings for a given workspace folder.
 * If the workspace folder is a virtual folder, it first checks for the corresponding virtual folder setting.
 * If the setting is not found, it falls back to the workspace setting.
 * @param workspaceFolder The workspace folder to retrieve Jest configuration settings for.
 * @returns A function that takes a `VirtualFolderSettingKey` as an argument and returns the corresponding setting value.
 */
export const createJestSettingGetter = (
  workspaceFolder: vscode.WorkspaceFolder
): GetConfigFunction => {
  const config = vscode.workspace.getConfiguration('jest', workspaceFolder.uri);
  let vFolder: VirtualFolderSettings | undefined;

  if (isVirtualWorkspaceFolder(workspaceFolder)) {
    const virtualFolders = config.get<VirtualFolderSettings[]>('virtualFolders');
    vFolder = virtualFolders?.find((v) => v.name === workspaceFolder.name);
    if (!vFolder) {
      throw new Error(`[${workspaceFolder.name}] is missing corresponding virtual folder setting`);
    }
  }

  // get setting from virtual folder first, fallback to workspace setting if not found
  const getSetting = <T>(key: VirtualFolderSettingKey): T | undefined => {
    if (key === 'enable') {
      // if any of the folders is disabled, then the whole workspace is disabled
      return (config.get<boolean>(key) !== false && vFolder?.enable !== false) as T;
    }

    return (vFolder?.[key] as T) ?? config.get<T>(key);
  };
  return getSetting;
};

// get setting from virtual folder first, fallback to workspace setting if not found
export const updateSetting = async (
  workspaceFolder: vscode.WorkspaceFolder,
  key: VirtualFolderSettingKey,
  value: unknown
): Promise<void> => {
  const config = vscode.workspace.getConfiguration('jest', workspaceFolder.uri);
  if (!isVirtualWorkspaceFolder(workspaceFolder)) {
    await config.update(key, value);
    return;
  }
  const virtualFolders = config.get<VirtualFolderSettings[]>('virtualFolders');
  const vFolder = virtualFolders?.find((v) => v.name === workspaceFolder.name);
  if (!vFolder) {
    throw new Error(`[${workspaceFolder.name}] is missing corresponding virtual folder setting`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vFolder as any)[key] = value;
  await config.update('virtualFolders', virtualFolders);
};
