import * as vscode from 'vscode';
import { JestOutputTerminal } from '../JestExt/output-terminal';
import { JestExtExplorerContext, TestItemData } from './types';
import { JestTestRun } from './jest-test-run';

/**
 * provide context information from JestExt and test provider state:
 * 1. TestData <-> TestItem
 *
 * as well as factory functions to create TestItem and TestRun that could impact the state
 */

export type TagIdType = 'run' | 'debug' | 'update-snapshot';

export interface JestTestRunOptions {
  name?: string;
}

let SEQ = 0;
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
   * @returns data of the child item, casting for easy usage but does not guarantee type safety.
   */
  getChildData = <T extends TestItemData = TestItemData>(
    item: vscode.TestItem,
    childId: string
  ): T | undefined => {
    const cItem = item.children.get(childId);

    // Note: casting for easy usage but does not guarantee type safety.
    return cItem && (this.testItemData.get(cItem) as T);
  };

  /**
   * get data associated with the item. All item used here should have some data associated with, otherwise
   * an exception will be thrown
   *
   * @returns casting for easy usage but does not guarantee type safety
   */
  getData = <T extends TestItemData>(item: vscode.TestItem): T | undefined => {
    // Note: casting for easy usage but does not guarantee type safety.
    return this.testItemData.get(item) as T | undefined;
  };

  createTestRun = (request: vscode.TestRunRequest, options?: JestTestRunOptions): JestTestRun => {
    const name = options?.name ?? `testRun-${SEQ++}`;
    const createRun = (name: string) => {
      const vscodeRun = this.controller.createTestRun(request, name);
      vscodeRun.appendOutput(`\r\nTestRun "${name}" started\r\n`);
      return vscodeRun;
    };

    return new JestTestRun(name, this, createRun);
  };

  // tags
  getTag = (tagId: TagIdType): vscode.TestTag => {
    const tag = this.profiles.find((p) => p.tag?.id === tagId)?.tag;
    if (!tag) {
      throw new Error(`unrecognized tag: ${tagId}`);
    }
    return tag;
  };

  /**
   * Create a new request based on the given one, which could be based on outdated data.
   * This is mainly used to support deferred mode: when the request is created during deferred mode on, it will need to be updated with new test items after existing deferred mode because the test tree has been rebuilt.
   * @param request
   * @returns
   */
  requestFrom = (request: vscode.TestRunRequest): vscode.TestRunRequest => {
    const findItem = (item: vscode.TestItem, collection: vscode.TestItemCollection) => {
      let found = collection.get(item.id);
      if (!found) {
        collection.forEach((cItem) => {
          if (!found && cItem.children) {
            found = findItem(item, cItem.children);
          }
        });
      }
      return found;
    };
    const mapItems = (items?: readonly vscode.TestItem[]) =>
      items &&
      items.map((i) => {
        const found = findItem(i, this.controller.items);
        if (found) {
          return found;
        }
        throw new Error(`failed to find item ${i.id}`);
      });

    const include = mapItems(request.include);
    const exclude = mapItems(request.exclude);
    const profile =
      request.profile && this.profiles.find((p) => p.label === request.profile?.label);
    if (request.profile && !profile) {
      throw new Error(`failed to find profile ${request.profile.label}`);
    }

    return new vscode.TestRunRequest(include, exclude, profile);
  };
}
