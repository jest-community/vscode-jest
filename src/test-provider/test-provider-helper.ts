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

let RunSeq = 0;
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
    const name = options?.name ?? `run-${RunSeq++}`;
    const opt = { ...(options ?? {}), request, name };
    const vscodeRun = this.controller.createTestRun(request, name);
    return new JestTestRun(this, vscodeRun, opt);
  };

  // tags
  getTag = (tagId: TagIdType): vscode.TestTag | undefined =>
    this.profiles.find((p) => p.tag?.id === tagId)?.tag;
}

export interface JestTestRunOptions {
  name?: string;
  item?: vscode.TestItem;
  request?: vscode.TestRunRequest;

  // in addition to the regular end() method
  onEnd?: () => void;

  // replace the end function
  end?: () => void;
}

export type TestRunProtocol = Pick<
  vscode.TestRun,
  'name' | 'enqueued' | 'started' | 'errored' | 'failed' | 'passed' | 'skipped' | 'end'
>;
export type ParentRun = vscode.TestRun | JestTestRun;
const isVscodeRun = (arg: ParentRun | undefined): arg is vscode.TestRun =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arg != null && typeof (arg as any).appendOutput === 'function';
const isJestTestRun = (arg: ParentRun | undefined): arg is JestTestRun => !isVscodeRun(arg);

/** a wrapper for vscode.TestRun or another JestTestRun */
export class JestTestRun implements JestExtOutput, TestRunProtocol {
  private output: JestOutputTerminal;
  public item?: vscode.TestItem;
  private parentRun?: ParentRun;

  constructor(
    context: JestTestProviderContext,
    parentRun: ParentRun,
    private options?: JestTestRunOptions
  ) {
    this.parentRun = parentRun;
    this.output = context.output;
    this.item = options?.item;
  }

  get vscodeRun(): vscode.TestRun | undefined {
    if (!this.parentRun) {
      return;
    }
    if (isVscodeRun(this.parentRun)) {
      return this.parentRun;
    }
    return this.parentRun.vscodeRun;
  }

  write(msg: string, opt?: OutputOptions): string {
    const text = this.output.write(msg, opt);
    this.vscodeRun?.appendOutput(text);
    return text;
  }

  isClosed(): boolean {
    return this.vscodeRun === undefined;
  }
  get request(): vscode.TestRunRequest | undefined {
    return (
      this.options?.request ?? (isJestTestRun(this.parentRun) ? this.parentRun.request : undefined)
    );
  }

  private updateState = (f: (pRun: ParentRun) => void): void => {
    if (!this.parentRun || !this.vscodeRun) {
      throw new Error(`run "${this.name}" has already closed`);
    }
    f(this.parentRun);
  };

  // TestRunProtocol
  public get name(): string | undefined {
    return this.options?.name;
  }
  public enqueued = (test: vscode.TestItem): void => {
    this.updateState((pRun) => pRun.enqueued(test));
  };
  public started = (test: vscode.TestItem): void => {
    this.updateState((pRun) => pRun.started(test));
  };
  public errored = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    this.updateState((pRun) => pRun.errored(test, message, duration));
  };
  public failed = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    this.updateState((pRun) => pRun.failed(test, message, duration));
  };
  public passed = (test: vscode.TestItem, duration?: number | undefined): void => {
    this.updateState((pRun) => pRun.passed(test, duration));
  };
  public skipped = (test: vscode.TestItem): void => {
    this.updateState((pRun) => pRun.skipped(test));
  };
  public end = (): void => {
    if (this.options?.end) {
      return this.options.end();
    }

    if (this.parentRun) {
      this.parentRun.end();
      if (isVscodeRun(this.parentRun)) {
        this.parentRun = undefined;
      }
    }

    this.options?.onEnd?.();
  };
}
