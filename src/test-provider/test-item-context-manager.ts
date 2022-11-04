import * as vscode from 'vscode';
import { extensionName } from '../appGlobals';

/**
 * A cross-workspace Context Manager that manages the testId context used in
 * TestExplorer menu when-condition
 */

export type TEItemContextKey = 'jest.autoRun' | 'jest.coverage';

export interface ItemContext {
  workspace: vscode.WorkspaceFolder;
  key: TEItemContextKey;
  /** the current value of the itemId */
  value: boolean;
  itemIds: string[];
}

export class TestItemContextManager {
  private cache = new Map<TEItemContextKey, ItemContext[]>();

  private contextKey(key: TEItemContextKey, value: boolean): string {
    return `${key}.${value ? 'on' : 'off'}`;
  }
  public setItemContext(context: ItemContext): void {
    console.log(`setItemContext for context=`, context);
    let list = this.cache.get(context.key);
    if (!list) {
      list = [context];
    } else {
      list = list.filter((c) => c.workspace.name !== context.workspace.name).concat(context);
    }
    this.cache.set(context.key, list);

    //set context for both on and off
    let itemIds = list.filter((c) => c.value === true).flatMap((c) => c.itemIds);
    vscode.commands.executeCommand('setContext', this.contextKey(context.key, true), itemIds);

    itemIds = list.filter((c) => c.value === false).flatMap((c) => c.itemIds);
    vscode.commands.executeCommand('setContext', this.contextKey(context.key, false), itemIds);
  }
  private getWorkspace(
    key: TEItemContextKey,
    item: vscode.TestItem
  ): vscode.WorkspaceFolder | undefined {
    const list = this.cache.get(key);
    return list?.find((c) => c.itemIds.includes(item.id))?.workspace;
  }
  public registerCommands(): vscode.Disposable[] {
    const autoRunCommands = ['test-item.auto-run.toggle-off', 'test-item.auto-run.toggle-on'].map(
      (n) =>
        vscode.commands.registerCommand(`${extensionName}.${n}`, (testItem: vscode.TestItem) => {
          const workspace = this.getWorkspace('jest.autoRun', testItem);
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
          const workspace = this.getWorkspace('jest.coverage', testItem);
          if (workspace) {
            vscode.commands.executeCommand(
              `${extensionName}.with-workspace.toggle-coverage`,
              workspace
            );
          }
        })
    );
    return [...autoRunCommands, ...coverageCommands];
  }
}

export const tiContextManager = new TestItemContextManager();
