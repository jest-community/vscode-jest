import * as vscode from 'vscode';
import { extensionName } from '../appGlobals';

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
      key: 'jest.editor-view-snapshot';
      workspace: vscode.WorkspaceFolder;
      itemIds: string[];
      onClick: (testItem: vscode.TestItem) => void;
    };
export type TEItemContextKey = ItemContext['key'];

export class TestItemContextManager {
  private cache = new Map<TEItemContextKey, ItemContext[]>();

  private contextKey(key: TEItemContextKey, value: boolean): string {
    return `${key}.${value ? 'on' : 'off'}`;
  }
  public setItemContext(context: ItemContext): void {
    switch (context.key) {
      case 'jest.autoRun':
      case 'jest.coverage': {
        let list = this.cache.get(context.key);
        if (!list) {
          list = [context];
        } else {
          // itemIds are not accumulated, but toggled
          list = list.filter((c) => c.workspace.name !== context.workspace.name).concat(context);
        }
        this.cache.set(context.key, list);

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
      case 'jest.editor-view-snapshot': {
        this.cache.set(context.key, [context]);
        vscode.commands.executeCommand('setContext', context.key, context.itemIds);
        break;
      }
    }
  }
  private getItemContext(key: TEItemContextKey, item: vscode.TestItem): ItemContext | undefined {
    const list = this.cache.get(key);
    return list?.find((c) => c.itemIds.includes(item.id));
  }
  public registerCommands(): vscode.Disposable[] {
    const autoRunCommands = ['test-item.auto-run.toggle-off', 'test-item.auto-run.toggle-on'].map(
      (n) =>
        vscode.commands.registerCommand(`${extensionName}.${n}`, (testItem: vscode.TestItem) => {
          const workspace = this.getItemContext('jest.autoRun', testItem)?.workspace;
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
          const workspace = this.getItemContext('jest.coverage', testItem)?.workspace;
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
        const context = this.getItemContext('jest.editor-view-snapshot', testItem);
        if (context && context.key === 'jest.editor-view-snapshot') {
          context.onClick(testItem);
        }
      }
    );
    return [...autoRunCommands, ...coverageCommands, viewSnapshotCommand];
  }
}

export const tiContextManager = new TestItemContextManager();
