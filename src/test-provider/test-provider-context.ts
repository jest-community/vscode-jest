import * as vscode from 'vscode';
import { JestRunEvent } from '../JestExt';
import { JestExtExplorerContext, TestItemData } from './types';

/**
 * provide context information from JestExt and test provider state:
 * 1. TestData <-> TestItem
 *
 * as well as factory functions to create TestItem and TestRun that could impact the state
 */

// output color support
export type OUTPUT_COLOR = 'red' | 'green' | 'yellow';
const COLORS = {
  ['red']: '\x1b[0;31m',
  ['green']: '\x1b[0;32m',
  ['yellow']: '\x1b[0;33m',
  ['end']: '\x1b[0m',
};

export class JestTestProviderContext {
  private testItemData: WeakMap<vscode.TestItem, TestItemData>;

  constructor(
    public readonly ext: JestExtExplorerContext,
    private readonly controller: vscode.TestController
  ) {
    this.testItemData = new WeakMap();
  }
  createTestItem = (
    id: string,
    label: string,
    uri: vscode.Uri,
    data: TestItemData,
    parent?: vscode.TestItem
  ): vscode.TestItem => {
    const testItem = this.controller.createTestItem(id, label, uri);
    this.testItemData.set(testItem, data);
    const collection = parent ? parent.children : this.controller.items;
    collection.add(testItem);

    return testItem;
  };

  /**
   * check if there is such child in the item, if exists returns the associated data
   *
   * @param item
   * @param childId id of the child item
   * @returns data of the child item, casting for easy usage but does not guarentee type safety.
   */
  getChildData = <T extends TestItemData = TestItemData>(
    item: vscode.TestItem,
    childId: string
  ): T | undefined => {
    const cItem = item.children.get(childId);

    // Note: casting for easy usage but does not guarentee type safety.
    return cItem && (this.testItemData.get(cItem) as T);
  };

  /**
   * get data associated with the item. All item used here should have some data associated with, otherwise
   * an exception will be thrown
   *
   * @returns casting for easy usage but does not guarentee type safety
   */
  getData = <T extends TestItemData>(item: vscode.TestItem): T | undefined => {
    // Note: casting for easy usage but does not guarentee type safety.
    return this.testItemData.get(item) as T | undefined;
  };

  createTestRun = (request: vscode.TestRunRequest, name: string): vscode.TestRun => {
    return this.controller.createTestRun(request, name);
  };

  appendOutput = (msg: string, run: vscode.TestRun, newLine = true, color?: OUTPUT_COLOR): void => {
    const converted = msg.replace(/\n/g, '\r\n');
    let text = newLine ? `[${this.ext.workspace.name}]: ${converted}` : converted;
    if (color) {
      text = `${COLORS[color]}${text}${COLORS['end']}`;
    }
    run.appendOutput(`${text}${newLine ? '\r\n' : ''}`);
  };
}

export type RunState = JestRunEvent['type'] | 'assertion-updated';
export class TestItemRun {
  public state: Set<RunState>;
  private _ended: boolean;
  private endFunctions: (() => void)[];

  /**
   *
   * @param item
   * @param run
   * @param end optional, default is `run.end()`
   */
  constructor(readonly item: vscode.TestItem, readonly run: vscode.TestRun, end?: () => void) {
    this.state = new Set();
    this._ended = false;
    this.endFunctions = [end ?? run.end];
    run.token.onCancellationRequested(() => this.end());
  }

  end(): void {
    if (!this._ended) {
      this._ended = true;
      this.endFunctions.forEach((f) => f());
    } else {
      console.log('itemRun already ended');
    }
  }
  get ended(): boolean {
    return this._ended;
  }
  appendEnd(f: () => void): void {
    this.endFunctions.push(f);
  }
}

export class ItemRunStore implements vscode.Disposable {
  private cache: Map<string, TestItemRun> = new Map();
  add(id: string, run: TestItemRun): void {
    if (!this.cache.get(id)) {
      this.cache.set(id, run);
      const cleanup = () => this.cache.delete(id);
      run.run.token.onCancellationRequested(cleanup);
      run.appendEnd(cleanup);
    }
  }
  get(id: string): TestItemRun | undefined {
    return this.cache.get(id);
  }
  dispose(): void {
    this.cache.forEach((run) => run.end());
  }
}
