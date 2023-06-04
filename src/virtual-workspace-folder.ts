import * as vscode from 'vscode';
import * as path from 'path';

export interface FolderAwareItem {
  workspaceFolder: vscode.WorkspaceFolder;
}

export class VirtualFolderBasedCache<T extends FolderAwareItem> {
  // cache folder by its name, which could be either the actual or virtual workspace folder name
  private byFolderName: Record<string, T>;
  // group folder list by its actual folder name
  private byActualFolderName: Record<string, T[]>;

  constructor() {
    this.byFolderName = {};
    this.byActualFolderName = {};
  }

  get size(): number {
    return Object.keys(this.byFolderName).length;
  }

  /** get all cached items */
  getAllItems(): T[] {
    return Object.values(this.byFolderName);
  }
  addItem(item: T) {
    this.byFolderName[item.workspaceFolder.name] = item;
    const actualFolderName = isVirtualWorkspaceFolder(item.workspaceFolder)
      ? item.workspaceFolder.actualWorkspaceFolder.name
      : item.workspaceFolder.name;
    let items = this.byActualFolderName[actualFolderName] ?? [];

    // in case the item is already in the list, remove it first
    items = items.filter((i) => i.workspaceFolder.name !== item.workspaceFolder.name);

    items.push(item);
    this.byActualFolderName[actualFolderName] = items;
  }
  deleteItemByFolder(workspaceFolder: vscode.WorkspaceFolder) {
    delete this.byFolderName[workspaceFolder.name];

    if (isVirtualWorkspaceFolder(workspaceFolder)) {
      // delete the virtual folder from the actual folder
      let items = this.byActualFolderName[workspaceFolder.actualWorkspaceFolder.name];
      items = items.filter((i) => i.workspaceFolder.name !== workspaceFolder.name);
      this.byActualFolderName[workspaceFolder.actualWorkspaceFolder.name] = items;
    } else {
      // delete all the virtual folders under the actual folder
      const items = this.byActualFolderName[workspaceFolder.name];
      items.forEach((item) => delete this.byFolderName[item.workspaceFolder.name]);
      delete this.byActualFolderName[workspaceFolder.name];
    }
  }
  getItemByFolderName(name: string): T | undefined {
    return this.byFolderName[name];
  }
  getItemsByActualFolderName(actualFolderName: string): T[] | undefined {
    return this.byActualFolderName[actualFolderName];
  }
  reset() {
    this.byFolderName = {};
    this.byActualFolderName = {};
  }
}

/**
 * a virtual workspace folder is a folder resides in a physical workspace folder but might have
 * different name and separate jest settings. A physical workspace folder can have multiple virtual folders.

 * Note: The class will have the same index as the actual workspace folder, but different name and uri (if it has set a different rootPath).
 */
export class VirtualWorkspaceFolder implements vscode.WorkspaceFolder {
  public readonly uri: vscode.Uri;
  constructor(
    public readonly actualWorkspaceFolder: vscode.WorkspaceFolder,
    public readonly name: string,
    rootPath?: string
  ) {
    if (rootPath) {
      this.uri = path.isAbsolute(rootPath)
        ? vscode.Uri.file(rootPath)
        : vscode.Uri.joinPath(actualWorkspaceFolder.uri, rootPath);
    } else {
      this.uri = actualWorkspaceFolder.uri;
    }
  }

  get index(): number {
    return this.actualWorkspaceFolder.index;
  }

  /** check if the given uri falls within the virtual folder's path */
  isInWorkspace(uri: vscode.Uri): boolean {
    return uri.fsPath.startsWith(this.uri.fsPath);
  }
}

export const isVirtualWorkspaceFolder = (
  workspaceFolder: vscode.WorkspaceFolder
): workspaceFolder is VirtualWorkspaceFolder => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (workspaceFolder as any).actualWorkspaceFolder != undefined;
};
