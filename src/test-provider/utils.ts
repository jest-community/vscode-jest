import * as vscode from 'vscode';
import { TestItemDataType } from './types';

export class TestItemStore {
  private testItemData: WeakMap<vscode.TestItem, TestItemDataType>;
  constructor(private readonly controller: vscode.TestController) {
    this.testItemData = new WeakMap();
  }
  createTestItem = (
    id: string,
    label: string,
    uri: vscode.Uri,
    data: TestItemDataType,
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
  getChildData = <T extends TestItemDataType = TestItemDataType>(
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
  getData = <T extends TestItemDataType = TestItemDataType>(
    item: vscode.TestItem
  ): T | undefined => {
    // Note: casting for easy usage but does not guarentee type safety.
    return this.testItemData.get(item) as T | undefined;
  };
}
