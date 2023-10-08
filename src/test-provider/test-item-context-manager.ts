import * as vscode from 'vscode';
import { extensionName } from '../appGlobals';
import { ItemCommand } from './types';

/**
 * A cross-workspace Context Manager that manages the testId context used in
 * TestExplorer menu when-condition
 */

export interface SnapshotItem {
  itemId: string;
  testFullName: string;
}
export type ItemContext = {
  key:
    | 'jest.runMode'
    | 'jest.editor-view-snapshot'
    | 'jest.editor-update-snapshot'
    | 'jest.workspaceRoot';
  workspace: vscode.WorkspaceFolder;
  itemIds: string[];
};
export type TEItemContextKey = ItemContext['key'];

export class TestItemContextManager {
  private cache = new Map<TEItemContextKey, ItemContext[]>();
  private wsCache: Record<string, vscode.WorkspaceFolder> = {};

  // context are stored by key, one per workspace
  private updateContextCache(context: ItemContext): ItemContext[] {
    this.wsCache[context.workspace.name] = context.workspace;
    let list = this.cache.get(context.key);
    if (!list) {
      list = [context];
    } else {
      list = list.filter((c) => c.workspace.name !== context.workspace.name).concat(context);
    }
    this.cache.set(context.key, list);
    return list;
  }
  public setItemContext(context: ItemContext): void {
    const list = this.updateContextCache(context);
    switch (context.key) {
      case 'jest.runMode':
      case 'jest.editor-view-snapshot':
      case 'jest.editor-update-snapshot':
      case 'jest.workspaceRoot': {
        const itemIds = list.flatMap((c) => c.itemIds);
        vscode.commands.executeCommand('setContext', context.key, itemIds);
      }
    }
  }
  private getItemWorkspace(item: vscode.TestItem): vscode.WorkspaceFolder | undefined {
    let target = item;
    while (target.parent) {
      target = target.parent;
    }
    const workspace = this.wsCache[target.id.split(':')[1]];
    return workspace ?? (item.uri && vscode.workspace.getWorkspaceFolder(item.uri));
  }

  public registerCommands(): vscode.Disposable[] {
    const revealOutputCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.reveal-output`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace(testItem);
        if (workspace) {
          vscode.commands.executeCommand(
            `${extensionName}.with-workspace.item-command`,
            workspace,
            testItem,
            ItemCommand.revealOutput
          );
        }
      }
    );
    const runModeCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.run-mode.change`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace(testItem);
        if (workspace) {
          vscode.commands.executeCommand(
            `${extensionName}.with-workspace.change-run-mode`,
            workspace
          );
        }
      }
    );

    const viewSnapshotCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.view-snapshot`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace(testItem);
        if (workspace) {
          vscode.commands.executeCommand(
            `${extensionName}.with-workspace.item-command`,
            workspace,
            testItem,
            ItemCommand.viewSnapshot
          );
        }
      }
    );
    const updateSnapshotCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.update-snapshot`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace(testItem);
        if (workspace) {
          vscode.commands.executeCommand(
            `${extensionName}.with-workspace.item-command`,
            workspace,
            testItem,
            ItemCommand.updateSnapshot
          );
        }
      }
    );

    return [runModeCommand, viewSnapshotCommand, updateSnapshotCommand, revealOutputCommand];
  }
}

export const tiContextManager = new TestItemContextManager();
