import * as vscode from 'vscode';
import { JestExtOutput, JestOutputTerminal, OutputOptions } from '../JestExt/output-terminal';
import { JestExtExplorerContext, TestItemData } from './types';

/**
 * provide context information from JestExt and test provider state:
 * 1. TestData <-> TestItem
 *
 * as well as factory functions to create TestItem and TestRun that could impact the state
 */

export type TagIdType = 'run' | 'debug';

export class JestTestProviderContext {
  private testItemData: WeakMap<vscode.TestItem, TestItemData>;

  constructor(
    public readonly ext: JestExtExplorerContext,
    private readonly controller: vscode.TestController,
    private readonly profiles: vscode.TestRunProfile[]
  ) {
    this.testItemData = new WeakMap();
  }
  get output(): JestOutputTerminal {
    return this.ext.output;
  }

  createTestItem = (
    id: string,
    label: string,
    uri: vscode.Uri,
    data: TestItemData,
    parent?: vscode.TestItem,
    tagIds: TagIdType[] = ['run', 'debug']
  ): vscode.TestItem => {
    const testItem = this.controller.createTestItem(id, label, uri);
    this.testItemData.set(testItem, data);
    const collection = parent ? parent.children : this.controller.items;
    collection.add(testItem);
    tagIds?.forEach((tId) => {
      const tag = this.getTag(tId);
      if (tag) {
        testItem.tags = [...testItem.tags, tag];
      }
    });

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

  createTestRun = (request: vscode.TestRunRequest, options?: JestTestRunOptions): JestTestRun => {
    const vscodeRun = this.controller.createTestRun(request, options?.name ?? 'unknown');
    return new JestTestRun(this, vscodeRun, options);
  };

  // tags
  getTag = (tagId: TagIdType): vscode.TestTag | undefined =>
    this.profiles.find((p) => p.tag?.id === tagId)?.tag;
}

export interface JestTestRunOptions {
  name?: string;
  item?: vscode.TestItem;
  // in addition to the regular end() method
  onEnd?: () => void;
  // if true, when the run ends, we will not end the vscodeRun, this is used when multiple test items
  // in a single request, that the run should be closed when all items are done.
  disableVscodeRunEnd?: boolean;
}

export class JestTestRun implements JestExtOutput {
  private output: JestOutputTerminal;
  public item?: vscode.TestItem;

  constructor(
    context: JestTestProviderContext,
    public vscodeRun: vscode.TestRun,
    private options?: JestTestRunOptions
  ) {
    this.output = context.output;
    this.item = options?.item;
  }

  end(): void {
    if (this.options?.disableVscodeRunEnd !== true) {
      this.vscodeRun.end();
    }
    this.options?.onEnd?.();
  }

  write(msg: string, opt?: OutputOptions): string {
    const text = this.output.write(msg, opt);
    this.vscodeRun.appendOutput(text);
    return text;
  }
}
