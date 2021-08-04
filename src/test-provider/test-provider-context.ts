import * as vscode from 'vscode';
import { JestExtResultContext, ScheduledTest, TestItemData } from './types';

/**
 * provide context information from JestExt and test provider state:
 * 1. TestData <-> TestItem
 * 2. ScheduledTest: pid <-> ScheduledTest
 *
 * as well as factory functions to create TestItem and TestRun that could impact the state
 */
export class JestTestProviderContext {
  private testItemData: WeakMap<vscode.TestItem, TestItemData>;
  private scheduledTests: Map<string, ScheduledTest>;

  constructor(
    public readonly ext: JestExtResultContext,
    private readonly controller: vscode.TestController
  ) {
    this.testItemData = new WeakMap();
    this.scheduledTests = new Map();
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
  getScheduledTest = (pid: string): ScheduledTest | undefined => this.scheduledTests.get(pid);
  setScheduledTest = (pid: string, test: ScheduledTest): void => {
    this.scheduledTests.set(pid, test);
  };
}
