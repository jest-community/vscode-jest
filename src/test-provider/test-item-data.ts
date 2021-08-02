import * as vscode from 'vscode';
import { extensionId } from '../appGlobals';
import { ProcessOutput } from '../JestExt';
import { TestSuiteResult } from '../TestResults';
import * as path from 'path';
import { JestExtRequestType } from '../JestExt/process-session';
import { TestAssertionStatus } from 'jest-editor-support';
import { DataNode, NodeType, ROOT_NODE_NAME } from '../TestResults/match-node';
import { Logging } from '../logging';
import { TestSuitChangeEvent } from '../TestResults/test-result-events';
import { Debuggable, TestItemData, JestTestProviderContext, WithUri, ScheduledTest } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isScheduledTest = (arg: any): arg is ScheduledTest => arg && arg.run && arg.onDone;
/**
 * remove the item from parent. If parent became empty, i.e. no children, recursive up the item tree unless the parent === stopAt
 * @param stopAt: if
 */
const removeItemUp = (item: vscode.TestItem, stopAt?: vscode.TestItem): void => {
  const parent = item.parent;
  parent?.children.delete(item.id);

  if (!parent || parent === stopAt) {
    return;
  }

  if (parent.children.size <= 0) {
    removeItemUp(parent, stopAt);
  }
};
interface JestRunable {
  getJestRunRequest: (profile: vscode.TestRunProfile) => JestExtRequestType;
}
abstract class TestItemDataBase implements TestItemData, JestRunable, WithUri {
  item!: vscode.TestItem;
  log: Logging;

  constructor(public context: JestTestProviderContext, name: string) {
    this.log = context.loggingFactory.create(name);
  }
  get uri(): vscode.Uri {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.item.uri!;
  }

  scheduleTest(run: vscode.TestRun, profile: vscode.TestRunProfile): string | undefined {
    const jestRequest = this.getJestRunRequest(profile);
    const pid = this.context.session.scheduleProcess({
      ...jestRequest,
      context: { output: this.runAsOutput(run) },
    });
    if (pid) {
      run.started(this.item);
      return pid;
    }
    run.errored(this.item, new vscode.TestMessage(`failed to schedule "${jestRequest.type}" run`));
  }

  abstract getJestRunRequest(profile: vscode.TestRunProfile): JestExtRequestType;
  discoverTest(_run: vscode.TestRun): void {
    //default is do nothing, but that means the item should already be resolved
    if (this.item.canResolveChildren !== false) {
      this.log('warn', `no discoverTest to resolve the TestItem?: ${this.item.id}`);
    }
  }

  runAsOutput(run: vscode.TestRun): ProcessOutput {
    return {
      append: (value: string) => {
        const s = value.replace(/\n/g, '\r\n');
        run.appendOutput(s);
      },
      appendLine: (value: string) => run.appendOutput(`${value}\r\n`),
    };
  }

  isRunnable(): boolean {
    return !this.context.autoRun.isWatch;
  }
  isDebuggable(): boolean {
    return false;
  }
  canRun(profile: vscode.TestRunProfile): boolean {
    if (profile.kind === vscode.TestRunProfileKind.Run) {
      return this.isRunnable();
    }
    if (profile.kind === vscode.TestRunProfileKind.Debug) {
      return this.isDebuggable();
    }
    return false;
  }

  getScheduledTest = (pid: string): ScheduledTest | undefined => {
    return this.context.getScheduledTest(pid);
  };

  createRun = (pid?: string) => {
    return this.context.createTestRun(new vscode.TestRunRequest([this.item]), pid ?? this.item.id);
  };
  /** end run if name matches the data item.id or pid */
  endRun = (runOrSchedule: vscode.TestRun | ScheduledTest, pid?: string): void => {
    if (isScheduledTest(runOrSchedule)) {
      return runOrSchedule.onDone();
    }
    const run = runOrSchedule;
    if (run.name === this.item.id || run.name === pid) {
      run.end();
    }
  };

  // remove TestItem from parent
  dispose() {
    this.item.parent?.children.delete(this.item.id);
  }
}

/**
 * Goal of this class is to manage the TestItem hierarchy reflects DocumentRoot path. It is responsible
 * to create DocumentRoot for each test file by listening to the TestResultEvents.
 */
export class WorkspaceRoot extends TestItemDataBase {
  private testDocuments: Map<string, TestDocumentRoot>;
  private listeners: vscode.Disposable[];

  constructor(context: JestTestProviderContext) {
    super(context, 'WorkspaceRoot');
    this.item = this.createTestItem();
    this.testDocuments = new Map();
    this.listeners = [];
  }
  createTestItem(): vscode.TestItem {
    const item = this.context.createTestItem(
      `${extensionId}:${this.context.workspace.name}`,
      this.context.workspace.name,
      this.context.workspace.uri,
      this
    );
    item.description = `(${this.context.autoRun.mode})`;

    item.canResolveChildren = true;
    return item;
  }

  getJestRunRequest(_profile: vscode.TestRunProfile): JestExtRequestType {
    return { type: 'all-tests' };
  }
  discoverTest(run: vscode.TestRun): void {
    this.registerEvents();
    const testList = this.context.testResolveProvider.getTestList();
    this.onTestListUpdated(testList, run);
  }

  // test result event handling
  private registerEvents = (): void => {
    this.unregisterEvents();
    const events = this.context.testResolveProvider.events;
    this.listeners = [
      events.testListUpdated.event(this.onTestListUpdated),
      events.testSuiteChanged.event(this.onTestSuiteChanged),
    ];
  };
  private unregisterEvents = (): void => {
    this.listeners.forEach((l) => l.dispose());
    this.listeners.length = 0;
  };

  private addFolder = (parent: FolderData | undefined, folderName: string): FolderData => {
    const p = parent ?? this;
    const uri = FolderData.makeUri(p.item, folderName);
    return (
      this.context.getChildData<FolderData>(p.item, uri.fsPath) ??
      new FolderData(this.context, folderName, p.item)
    );
  };
  private addPath = (absoluteFileName: string): FolderData | undefined => {
    const relativePath = path.relative(this.context.workspace.uri.fsPath, absoluteFileName);
    const folders = relativePath.split(path.sep).slice(0, -1);

    return folders.reduce(this.addFolder, undefined);
  };
  /**
   * create a test item hierarchy for the given the test file based on its reltive path. If the file is not
   * a test file, exception will be thrown.
   * @param absoluteFileName
   * @param run optional. If defined, will invoke discoverTest() for the TestDocumentRoot to build the children tree
   * @returns the leaf testItem data, i.e. DocumentRoot, for the test file
   */
  private addTestFile = (
    absoluteFileName: string,
    onTestRoot?: (doc: TestDocumentRoot) => void
  ): TestDocumentRoot => {
    if (this.context.testResolveProvider.isTestFile(absoluteFileName) !== 'yes') {
      throw new Error(`not-test-file: ${absoluteFileName}`);
    }
    let docRoot = this.testDocuments.get(absoluteFileName);
    if (!docRoot) {
      const parent = this.addPath(absoluteFileName) ?? this;
      docRoot =
        this.context.getChildData<TestDocumentRoot>(parent.item, absoluteFileName) ??
        new TestDocumentRoot(this.context, vscode.Uri.file(absoluteFileName), parent.item);
      this.testDocuments.set(absoluteFileName, docRoot);
    }

    onTestRoot?.(docRoot);

    return docRoot;
  };

  private removeFile = (absoluteFileName: string): void => {
    const documentRoot = this.testDocuments.get(absoluteFileName);
    if (!documentRoot) {
      return;
    }
    this.testDocuments.delete(absoluteFileName);
    removeItemUp(documentRoot.item, this.item);
  };
  /**
   * Wwhen test list updated, rebuild the whole testItem tree for all the test files (DocumentRoot)
   * Note: this could be optimized to only updat the differences if needed.
   */
  private onTestListUpdated = (
    absoluteFileNames: string[] | undefined,
    run?: vscode.TestRun
  ): void => {
    if (!absoluteFileNames || absoluteFileNames.length <= 0) {
      this.item.children.replace([]);
      this.testDocuments.clear();
    } else {
      // remove cached doc not in the list
      Array.from(this.testDocuments.keys()).forEach((key) => {
        if (!absoluteFileNames.includes(key)) {
          this.removeFile(key);
        }
      });

      const aRun = run ?? this.createRun();
      try {
        absoluteFileNames.forEach((f) =>
          this.addTestFile(f, (testRoot) => testRoot.updateResultState(aRun))
        );
      } catch (e) {
        console.error(`[WorkspaceRoot] "${this.item.id}" onTestListUpdated failed:`, e);
      } finally {
        this.endRun(aRun);
      }
    }
    this.item.canResolveChildren = false;
  };

  /**
   * invoked when external test result changed, this could be caused by the watch-mode or on-demand test run, includes vscode's runTest.
   * We will try to find the run based on the event's id, if found, means a vscode runTest initiated such run, will use that run to
   * ask all touched DocumentRoot to refresh both the test items and their states.
   *
   * @param event
   */
  private onTestSuiteChanged = (event: TestSuitChangeEvent): void => {
    switch (event.type) {
      case 'assertions-updated': {
        const scheduledTest = this.getScheduledTest(event.pid);
        const run = scheduledTest?.run ?? this.createRun();
        try {
          event.files.forEach((f) => this.addTestFile(f, (testRoot) => testRoot.discoverTest(run)));
        } catch (e) {
          console.error(
            `[WorkspaceRoot] "${this.item.id}" onTestSuiteChanged: assertions-updated failed:`,
            e
          );
        } finally {
          this.endRun(scheduledTest ?? run, event.pid);
        }
        break;
      }
      case 'result-matched': {
        this.addTestFile(event.file, (testRoot) => testRoot.onTestMatched());
        break;
      }
    }
  };

  dispose(): void {
    this.unregisterEvents();
    super.dispose();
  }
}

export class FolderData extends TestItemDataBase {
  static makeUri = (parent: vscode.TestItem, folderName: string): vscode.Uri => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return vscode.Uri.joinPath(parent.uri!, folderName);
  };
  constructor(
    readonly context: JestTestProviderContext,
    readonly name: string,
    parent: vscode.TestItem
  ) {
    super(context, 'FolderData');
    this.item = this.createTestItem(name, parent);
  }
  private createTestItem(name: string, parent: vscode.TestItem) {
    const uri = FolderData.makeUri(parent, name);
    const item = this.context.createTestItem(uri.fsPath, name, uri, this, parent);

    item.canResolveChildren = false;
    return item;
  }
  getJestRunRequest(_profile: vscode.TestRunProfile): JestExtRequestType {
    return {
      type: 'by-file-pattern',
      testFileNamePattern: this.uri.fsPath,
    };
  }
}

const updateItemState = (
  run: vscode.TestRun,
  item: vscode.TestItem,
  result?: TestSuiteResult | TestAssertionStatus
): void => {
  if (!result) {
    return;
  }

  const status = result.status;
  switch (status) {
    case 'KnownSuccess':
      run.passed(item);
      break;
    case 'KnownSkip':
    case 'KnownTodo':
      run.skipped(item);
      break;
    case 'KnownFail': {
      run.failed(item, new vscode.TestMessage(result.message));
      break;
    }
  }
};

const isDataNode = (arg: NodeType<TestAssertionStatus>): arg is DataNode<TestAssertionStatus> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (arg as any).data != null;

type AssertNode = NodeType<TestAssertionStatus>;
export const makeTestId = (
  fileUri: vscode.Uri,
  target?: NodeType<TestAssertionStatus>,
  extra?: string
): string => {
  const parts = [fileUri.fsPath];
  if (target && target.name !== ROOT_NODE_NAME) {
    parts.push(target.fullName);
  }
  if (extra) {
    parts.push(extra);
  }
  return parts.join('#');
};

const isSameId = (id1: string, id2: string): boolean => {
  if (id1 === id2) {
    return true;
  }
  // truncate the last "extra-id" added for duplicate test names before comparing
  const truncateExtra = (id: string): string => id.replace(/(.*)(#[0-9]+$)/, '$1');
  return truncateExtra(id1) === truncateExtra(id2);
};
const syncChildNodes = (data: TestItemData, node: AssertNode): void => {
  const testId = makeTestId(data.uri, node);
  if (!isSameId(testId, data.item.id)) {
    data.item.error = 'invalid node';
    return;
  }
  data.item.error = undefined;

  if (!isDataNode(node)) {
    const idMap = [...node.childContainers, ...node.childData]
      .flatMap((n) => n.getAll() as AssertNode[])
      .reduce((map, node) => {
        const id = makeTestId(data.uri, node);
        map.set(id, map.get(id)?.concat(node) ?? [node]);
        return map;
      }, new Map<string, AssertNode[]>());

    const newItems: vscode.TestItem[] = [];
    idMap.forEach((nodes, id) => {
      if (nodes.length > 1) {
        // duplicate names found, append index to make a unique id: re-create the item with new id
        nodes.forEach((n, idx) => {
          newItems.push(new TestData(data.context, data.uri, n, data.item, `${idx}`).item);
        });
        return;
      }
      let cItem = data.item.children.get(id);
      if (cItem) {
        data.context.getData<TestData>(cItem)?.updateNode(nodes[0]);
      } else {
        cItem = new TestData(data.context, data.uri, nodes[0], data.item).item;
      }
      newItems.push(cItem);
    });
    data.item.children.replace(newItems);
  } else {
    data.item.children.replace([]);
  }
};
export class TestDocumentRoot extends TestItemDataBase {
  constructor(
    readonly context: JestTestProviderContext,
    fileUri: vscode.Uri,
    parent: vscode.TestItem
  ) {
    super(context, 'TestDocumentRoot');
    this.item = this.createTestItem(fileUri, parent);
  }
  private createTestItem(fileUri: vscode.Uri, parent: vscode.TestItem): vscode.TestItem {
    const item = this.context.createTestItem(
      makeTestId(fileUri),
      path.basename(fileUri.fsPath),
      fileUri,
      this,
      parent
    );

    item.canResolveChildren = true;
    return item;
  }

  discoverTest = (run: vscode.TestRun): void => {
    this.createChildItems();
    this.updateResultState(run);
  };

  private createChildItems = (): void => {
    try {
      const suiteResult = this.context.testResolveProvider.getTestSuiteResult(this.item.id);
      if (!suiteResult || !suiteResult.assertionContainer) {
        this.item.children.replace([]);
      } else {
        syncChildNodes(this, suiteResult.assertionContainer);
      }
    } catch (e) {
      console.error(`[TestDocumentRoot] "${this.item.id}" createChildItems failed:`, e);
    } finally {
      this.item.canResolveChildren = false;
    }
  };

  public updateResultState(run: vscode.TestRun): void {
    const suiteResult = this.context.testResolveProvider.getTestSuiteResult(this.item.id);
    updateItemState(run, this.item, suiteResult);

    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.updateResultState(run)
    );
  }

  getJestRunRequest = (_profile: vscode.TestRunProfile): JestExtRequestType => {
    return {
      type: 'by-file',
      testFileName: this.item.id,
    };
  };

  public onTestMatched = (): void => {
    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.onTestMatched()
    );
  };
}
export class TestData extends TestItemDataBase implements Debuggable {
  constructor(
    readonly context: JestTestProviderContext,
    fileUri: vscode.Uri,
    private node: AssertNode,
    parent: vscode.TestItem,
    extraId?: string
  ) {
    super(context, 'TestData');
    this.item = this.createTestItem(fileUri, parent, extraId);
    this.updateNode(node);
  }

  private createTestItem(fileUri: vscode.Uri, parent: vscode.TestItem, extraId?: string) {
    const item = this.context.createTestItem(
      makeTestId(fileUri, this.node, extraId),
      this.node.name,
      fileUri,
      this,
      parent
    );

    item.canResolveChildren = false;
    return item;
  }

  getJestRunRequest(_profile: vscode.TestRunProfile): JestExtRequestType {
    return {
      type: 'by-file-test-pattern',
      testFileNamePattern: this.uri.fsPath,
      testNamePattern: this.node.fullName,
    };
  }
  isDebuggable(): boolean {
    return true;
  }
  getDebugInfo = (): { fileName: string; testNamePattern: string } => {
    return { fileName: this.uri.fsPath, testNamePattern: this.node.fullName };
  };
  private updateItemRange(): void {
    if (this.node.attrs.range) {
      const pos = [
        this.node.attrs.range.start.line,
        this.node.attrs.range.start.column,
        this.node.attrs.range.end.line,
        this.node.attrs.range.end.column,
      ];
      if (pos.every((n) => n >= 0)) {
        this.item.range = new vscode.Range(pos[0], pos[1], pos[2], pos[3]);
        return;
      }
    }
    this.item.range = undefined;
  }

  updateNode(node: NodeType<TestAssertionStatus>): void {
    this.node = node;
    this.updateItemRange();
    syncChildNodes(this, node);
  }

  public onTestMatched(): void {
    // assertion might have picked up source block location
    this.updateItemRange();
    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.onTestMatched()
    );
  }

  public updateResultState(run: vscode.TestRun): void {
    if (this.node && isDataNode(this.node)) {
      const assertion = this.node.data;
      updateItemState(run, this.item, assertion);
    }
    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.updateResultState(run)
    );
  }
}
