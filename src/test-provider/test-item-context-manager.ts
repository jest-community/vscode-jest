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
export type ItemContext =
  | {
      key: 'jest.autoRun' | 'jest.coverage';
      workspace: vscode.WorkspaceFolder;
      /** the current value of the itemId */
      value: boolean;
      itemIds: string[];
    }
  | {
      key: 'jest.editor-view-snapshot' | 'jest.editor-update-snapshot';
      workspace: vscode.WorkspaceFolder;
      itemIds: string[];
    }
  | {
      key: 'jest.workspaceRoot';
      workspace: vscode.WorkspaceFolder;
      itemIds: string[];
    };
export type TEItemContextKey = ItemContext['key'];

export class TestItemContextManager {
  private cache = new Map<TEItemContextKey, ItemContext[]>();

  private contextKey(key: TEItemContextKey, value: boolean): string {
    return `${key}.${value ? 'on' : 'off'}`;
  }
  private updateContextCache(context: ItemContext): ItemContext[] {
    switch (context.key) {
      case 'jest.autoRun':
      case 'jest.coverage':
      case 'jest.workspaceRoot': {
        let list = this.cache.get(context.key);
        if (!list) {
          list = [context];
        } else {
          // itemIds are not accumulated, but toggled
          list = list.filter((c) => c.workspace.name !== context.workspace.name).concat(context);
        }
        this.cache.set(context.key, list);
        return list;
      }
      case 'jest.editor-view-snapshot':
      case 'jest.editor-update-snapshot': {
        const list = [context];
        this.cache.set(context.key, list);
        return list;
      }
    }
  }
  public setItemContext(context: ItemContext): void {
    const list = this.updateContextCache(context);
    switch (context.key) {
      case 'jest.autoRun':
      case 'jest.coverage': {
        //set context for both on and off
        let itemIds = list
          .flatMap((c) => (c.key === context.key && c.value === true ? c.itemIds : undefined))
          .filter((c) => c !== undefined);
        vscode.commands.executeCommand('setContext', this.contextKey(context.key, true), itemIds);

        itemIds = list
          .flatMap((c) => (c.key === context.key && c.value === false ? c.itemIds : undefined))
          .filter((c) => c !== undefined);
        vscode.commands.executeCommand('setContext', this.contextKey(context.key, false), itemIds);
        break;
      }
      case 'jest.editor-view-snapshot':
      case 'jest.editor-update-snapshot': {
        vscode.commands.executeCommand('setContext', context.key, context.itemIds);
        break;
      }
      case 'jest.workspaceRoot': {
        const itemIds = list.flatMap((c) => c.itemIds);
        vscode.commands.executeCommand('setContext', context.key, itemIds);
      }
    }
  }
  private getItemWorkspace(
    key: TEItemContextKey,
    item: vscode.TestItem
  ): vscode.WorkspaceFolder | undefined {
    const workspace = item.uri && vscode.workspace.getWorkspaceFolder(item.uri);
    if (workspace) {
      return workspace;
    }
    const list = this.cache.get(key);
    const c = list?.find((c) => c.itemIds.includes(item.id));
    return c?.workspace;
  }
  public registerCommands(): vscode.Disposable[] {
    const revealOutputCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.reveal-output`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace('jest.workspaceRoot', testItem);
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
    const autoRunCommands = ['test-item.auto-run.toggle-off', 'test-item.auto-run.toggle-on'].map(
      (n) =>
        vscode.commands.registerCommand(`${extensionName}.${n}`, (testItem: vscode.TestItem) => {
          const workspace = this.getItemWorkspace('jest.autoRun', testItem);
          if (workspace) {
            vscode.commands.executeCommand(
              `${extensionName}.with-workspace.toggle-auto-run`,
              workspace
            );
          }
        })
    );
    const coverageCommands = ['test-item.coverage.toggle-off', 'test-item.coverage.toggle-on'].map(
      (n) =>
        vscode.commands.registerCommand(`${extensionName}.${n}`, (testItem: vscode.TestItem) => {
          const workspace = this.getItemWorkspace('jest.coverage', testItem);
          if (workspace) {
            vscode.commands.executeCommand(
              `${extensionName}.with-workspace.toggle-coverage`,
              workspace
            );
          }
        })
    );
    const viewSnapshotCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.view-snapshot`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getItemWorkspace('jest.editor-view-snapshot', testItem);
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
        const workspace = this.getItemWorkspace('jest.editor-update-snapshot', testItem);
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

    return [
      ...autoRunCommands,
      ...coverageCommands,
      viewSnapshotCommand,
      updateSnapshotCommand,
      revealOutputCommand,
    ];
  }
}

export const tiContextManager = new TestItemContextManager();
