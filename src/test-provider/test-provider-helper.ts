import * as vscode from 'vscode';
import { JestExtOutput, JestOutputTerminal, OutputOptions } from '../JestExt/output-terminal';
import { JestExtExplorerContext, TestItemData } from './types';

/**
 * provide context information from JestExt and test provider state:
 * 1. TestData <-> TestItem
 *
 * as well as factory functions to create TestItem and TestRun that could impact the state
 */

export type TagIdType = 'run' | 'debug' | 'update-snapshot';

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
    const name = options?.name ?? `testRun-${RunSeq++}`;
    const createRun = () => {
      const vscodeRun = this.controller.createTestRun(request, name);
      vscodeRun.appendOutput(`\nTestRun "${name}" started\n`);
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

export interface JestTestRunOptions {
  name?: string;
}

export type TestRunProtocol = Pick<
  vscode.TestRun,
  'name' | 'enqueued' | 'started' | 'errored' | 'failed' | 'passed' | 'skipped' | 'end'
>;

type CreateRun = () => vscode.TestRun;
type ActualRun = vscode.TestRun | CreateRun;

/**
 * A wrapper class for vscode.TestRun to support
 * 1. JIT creation of TestRun
 * 2. delayed end of TestRun (to prevent the TestRun from being closed before the test is completely done)
 * 3. allow multiple processes to use the same TestRun. And the TestRun will be closed only when all processes are done.
 */
export class JestTestRun implements JestExtOutput, TestRunProtocol {
  private output: JestOutputTerminal;
  private _run?: vscode.TestRun;
  private createRun?: CreateRun;
  private processes: Map<string, NodeJS.Timeout | undefined>;

  constructor(
    public readonly name: string,
    private context: JestTestProviderContext,
    run: ActualRun
  ) {
    if (typeof run === 'function') {
      this.createRun = run;
    } else {
      this._run = run;
    }

    this.output = context.output;
    this.processes = new Map();
  }
  write(msg: string, opt?: OutputOptions): string {
    const text = this.output.write(msg, opt);
    this._run?.appendOutput(text);
    return text;
  }

  isClosed(): boolean {
    return !this._run;
  }

  public addProcess(pid: string): void {
    if (!this.processes.has(pid)) {
      this.processes.set(pid, undefined);
    }
  }
  /**
   * returns the underlying vscode.TestRun, if existing.
   * If no run but there is createRun() factory method, then use it to create the run and return it.
   * Otherwise, throw error
   **/
  private safeRun(): vscode.TestRun {
    if (!this._run) {
      if (this.createRun) {
        this._run = this.createRun();
      } else {
        throw new Error(`run "${this.name}" was expected but not present.`);
      }
    }
    return this._run;
  }

  // TestRunProtocol
  public enqueued = (test: vscode.TestItem): void => {
    this.safeRun().enqueued(test);
  };
  public started = (test: vscode.TestItem): void => {
    this.safeRun().started(test);
  };
  public errored = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    const _msg = this.context.ext.settings.runMode.config.showInlineError ? message : [];
    this.safeRun().errored(test, _msg, duration);
  };
  public failed = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    const _msg = this.context.ext.settings.runMode.config.showInlineError ? message : [];
    this.safeRun().failed(test, _msg, duration);
  };
  public passed = (test: vscode.TestItem, duration?: number | undefined): void => {
    this.safeRun().passed(test, duration);
  };
  public skipped = (test: vscode.TestItem): void => {
    this.safeRun().skipped(test);
  };
  public end = (options?: { pid: string; delay?: number }): void => {
    if (!this._run) {
      console.warn(`Trying to end a run "${this.name}" that is already ended`);
      return;
    }
    if (options) {
      let timeoutId = this.processes.get(options.pid);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (!options.delay) {
        this.processes.delete(options.pid);
      } else {
        // delay 5 seconds to end the run
        timeoutId = setTimeout(() => {
          console.log(`run ${options.pid} ended after delay.`);
          this.processes.delete(options.pid);
          this.end();
        }, options.delay);
        this.processes.set(options.pid, timeoutId);
      }
    }
    // close the run only when all processes are done
    if (this.processes.size > 0) {
      return;
    }
    this._run.end();
    this._run = undefined;
    console.log(`run ${this.name} ended`);
  };
}
