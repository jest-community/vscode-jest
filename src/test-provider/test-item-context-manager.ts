import * as vscode from 'vscode';
import { extensionName } from '../appGlobals';

/**
 * A cross-workspace Context Manager that manages the testId context used in
 * TestExplorer menu when-condition
 */

// export type TEItemContextKey =
//   | 'jest.autoRun'
//   | 'jest.coverage'
//   | 'jest.editor-view-snapshot';

// export interface ItemContext {
//   key: TEItemContextKey;
//   workspace: vscode.WorkspaceFolder;
//   /** the current value of the itemId */
//   value: boolean;
//   itemIds: string[];
// }

// interface DocumentTreeContext {
//   key: 'jest.editor-view-snapshot' | 'jest.editor-update-snapshot';
//   workspace: vscode.WorkspaceFolder;
//   value: boolean;
//   // in top-down order, e.g. [root, folder, document]
//   documentTreeItemIds: string[];
//   itemIds: Set<string>;
// }
// type DocumentTree = Map<string, Set<string>>;
// interface DocumentTreeInfo {
//   workspace: vscode.WorkspaceFolder;
//   tree: DocumentTree;
//   itemIds: Set<string>;
// }
// class WorkspaceDocumentTree {
//   private cache: Map<DocumentTreeContext['key'], DocumentTreeInfo[]>;
//   constructor() {
//     this.cache = new Map();
//   }
//   private addNode(tree: DocumentTree, context: DocumentTreeContext) {
//     for (let i = 0; i < context.documentTreeItemIds.length - 2; i++) {
//       const itemId = context.documentTreeItemIds[i];
//       const childId = context.documentTreeItemIds[i + 1];
//       const children = tree.get(itemId);
//       if (!children) {
//         tree.set(itemId, new Set([childId]));
//       } else {
//         children.add(childId);
//       }
//     }
//   }
//   private removeNode(tree: DocumentTree, context: DocumentTreeContext) {}

//   addContext(context: DocumentTreeContext): void {
//     const wsList = this.cache.get(context.key);
//     let tree: DocumentTree;
//     if (!wsList) {
//       tree = new Map();
//       this.cache.set(context.key, [{ workspace: context.workspace, tree, itemIds: new Set() }]);
//     } else {
//       const wsInfo = wsList.find(
//         (info) => info.workspace.uri.fsPath === context.workspace.uri.fsPath
//       );
//       tree = wsInfo?.tree ?? new Map();
//       if (!wsInfo?.tree) {
//         wsList.push({ workspace: context.workspace, tree, itemIds: new Set() });
//       } else {
//       }
//     }
//     this.addNode(tree, context);
//   }
// }

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
    };
export type TEItemContextKey = ItemContext['key'];

export class TestItemContextManager {
  private cache = new Map<TEItemContextKey, ItemContext[]>();

  private contextKey(key: TEItemContextKey, value: boolean): string {
    return `${key}.${value ? 'on' : 'off'}`;
  }
  public setItemContext(context: ItemContext): void {
    console.log(`setItemContext for context=`, context);

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
          .filter((c) => c.key === context.key && c.value === true)
          .flatMap((c) => c.itemIds as string[]);
        vscode.commands.executeCommand('setContext', this.contextKey(context.key, true), itemIds);

        itemIds = list
          .filter((c) => c.key === context.key && c.value === false)
          .flatMap((c) => c.itemIds as string[]);
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
    const viewSnapshotCommand = vscode.commands.registerCommand(
      `${extensionName}.test-item.view-snapshot`,
      (testItem: vscode.TestItem) => {
        const workspace = this.getWorkspace('jest.editor-view-snapshot', testItem);
        if (workspace) {
          vscode.commands.executeCommand(
            `${extensionName}.with-workspace-test-item.view-snapshot`,
            workspace,
            testItem
          );
        }
      }
    );
    return [...autoRunCommands, ...coverageCommands, viewSnapshotCommand];
  }
}

export const tiContextManager = new TestItemContextManager();
