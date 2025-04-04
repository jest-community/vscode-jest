import * as vscode from 'vscode';
import { extensionId } from '../appGlobals';
import { JestRunEvent, RunEventBase } from '../JestExt';
import { TestSuiteResult } from '../TestResults';
import * as path from 'path';
import { JestExtRequestType } from '../JestExt/process-session';
import { ItBlock, TestAssertionStatus } from 'jest-editor-support';
import { ContainerNode, DataNode, NodeType, ROOT_NODE_NAME } from '../TestResults/match-node';
import { Logging } from '../logging';
import { TestSuitChangeEvent } from '../TestResults/test-result-events';
import { ItemCommand, ScheduleTestOptions, TestItemData } from './types';
import { JestTestProviderContext } from './test-provider-context';
import { JestTestRun } from './jest-test-run';
import { JestProcessInfo, ProcessStatus } from '../JestProcessManagement';
import { GENERIC_ERROR, LONG_RUNNING_TESTS, getExitErrorDef } from '../errors';
import { tiContextManager } from './test-item-context-manager';
import { runModeDescription } from '../JestExt/run-mode';
import { isVirtualWorkspaceFolder } from '../virtual-workspace-folder';
import { outputManager } from '../output-manager';
import { DebugInfo, TestNamePattern } from '../types';

interface JestRunnable {
  getJestRunRequest: (options?: ScheduleTestOptions) => JestExtRequestType;
}

interface WithUri {
  uri: vscode.Uri;
}

type TypedRunEvent = RunEventBase & { type: string };

abstract class TestItemDataBase implements TestItemData, JestRunnable, WithUri {
  item!: vscode.TestItem;
  log: Logging;

  constructor(
    public context: JestTestProviderContext,
    name: string
  ) {
    this.log = context.ext.loggingFactory.create(name);
  }
  get uri(): vscode.Uri {
    return this.item.uri!;
  }

  deepItemState(
    item: vscode.TestItem | undefined,
    setState: (item: vscode.TestItem) => void
  ): void {
    if (!item) {
      this.log('warn', '<deepItemState>: no item to set state');
      return;
    }
    setState(item);
    item.children.forEach((child) => this.deepItemState(child, setState));
  }

  isTestNameResolved() {
    return true;
  }

  getParentNode(): TestItemDataBase | undefined {
    return this.item.parent ? this.context.getData<TestItemDataBase>(this.item.parent) : undefined;
  }
  /**
   * Performs a deep lookup to find a node where the whole node branch contains only
   * the resolved names. It will do a deep lookup instead of shallow lookup.
   *
   * @returns {TestItemDataBase | undefined} The resolved node if found, otherwise undefined.
   */
  findResolvedNode(): TestItemDataBase {
    if (this.isTestNameResolved()) {
      // Check if all parent nodes are resolved
      let parentNode = this.getParentNode();
      while (parentNode) {
        if (!parentNode.isTestNameResolved()) {
          return parentNode.findResolvedNode(); // A parent node is unresolved, go up and search again
        }
        parentNode = parentNode.getParentNode();
      }

      return this; // All parent nodes are resolved
    }
    // Move to the parent node if the current node is unresolved
    const p = this.getParentNode();
    if (p) {
      return p.findResolvedNode();
    }

    throw new Error(
      `no resolved node found for ${this.item.id}: this should not have happened. Please file an issue`
    );
  }

  scheduleTest(run: JestTestRun, options?: ScheduleTestOptions): void {
    try {
      const resolvedNode = this.findResolvedNode();
      if (resolvedNode !== this) {
        // the current node has an unresolved name therefore we need to schedule the test at the resolved parent node
        run.end({ reason: 'unresolved parameterized test' });
        run.updateRequest(new vscode.TestRunRequest([resolvedNode.item]));
        return resolvedNode.scheduleTest(run, options);
      }

      // the current node and its parent chain is resolved, we can safely schedule the test
      const jestRequest = this.getJestRunRequest(options);

      this.deepItemState(this.item, run.enqueued);

      const process = this.context.ext.session.scheduleProcess(jestRequest, {
        run,
        testItem: this.item,
      });
      if (process) {
        run.addProcess(process);
      } else {
        throw new Error(`failed to schedule test for ${this.item.id}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : `failed to schedule test: ${JSON.stringify(e)}`;
      run.errored(this.item, new vscode.TestMessage(msg));
      run.write(msg, 'error');
      run.end({ reason: 'failed to schedule test' });
    }
  }

  runItemCommand(itemCommand: ItemCommand): void | Promise<void> {
    switch (itemCommand) {
      case ItemCommand.updateSnapshot: {
        const request = new vscode.TestRunRequest([this.item]);
        const run = this.context.createTestRun(request, {
          name: `${itemCommand}-${this.item.id}`,
        });
        this.scheduleTest(run, { itemCommand });
        break;
      }
      case ItemCommand.viewSnapshot: {
        return this.viewSnapshot().catch((e) => this.log('error', e));
      }
      case ItemCommand.revealOutput: {
        return this.context.output.show();
      }
    }
  }
  viewSnapshot(): Promise<void> {
    return Promise.reject(`viewSnapshot is not supported for ${this.item.id}`);
  }

  getDebugInfo(): DebugInfo {
    return { testPath: this.uri.fsPath, useTestPathPattern: true };
  }
  abstract getJestRunRequest(options?: ScheduleTestOptions): JestExtRequestType;
}

interface SnapshotItemCollection {
  viewable: vscode.TestItem[];
  updatable: vscode.TestItem[];
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

    this.registerEvents();
  }
  createTestItem(): vscode.TestItem {
    const workspaceFolder = this.context.ext.workspace;
    const item = this.context.createTestItem(
      `${extensionId}:${workspaceFolder.name}`,
      workspaceFolder.name,
      isVirtualWorkspaceFolder(workspaceFolder)
        ? workspaceFolder.effectiveUri
        : workspaceFolder.uri,
      this
    );
    const desc = runModeDescription(this.context.ext.settings.runMode.config);
    item.description = `(${desc.deferred?.label ?? desc.type.label})`;

    item.canResolveChildren = true;
    return item;
  }

  getJestRunRequest(options?: ScheduleTestOptions): JestExtRequestType {
    return {
      type: 'all-tests',
      nonBlocking: true,
      updateSnapshot: options?.itemCommand === ItemCommand.updateSnapshot,
      coverage: options?.profile?.kind === vscode.TestRunProfileKind.Coverage,
    };
  }

  discoverTest(run: JestTestRun): void {
    const testList = this.context.ext.testResultProvider.getTestList();
    // only trigger update when testList is not empty because it's possible test-list is not available yet,
    // in such case we should just wait for the testListUpdated event to trigger the update
    if (testList.length > 0) {
      this.onTestListUpdated(testList, run);
    } else {
      run.end({ reason: 'no test found' });
      this.item.canResolveChildren = false;
    }
  }

  // test result event handling
  private registerEvents = (): void => {
    this.listeners = [
      this.context.ext.testResultProvider.events.testListUpdated.event(this.onTestListUpdated),
      this.context.ext.testResultProvider.events.testSuiteChanged.event(this.onTestSuiteChanged),
      this.context.ext.sessionEvents.onRunEvent.event(this.onRunEvent),
    ];
  };
  private unregisterEvents = (): void => {
    this.listeners.forEach((l) => l.dispose());
    this.listeners.length = 0;
  };

  private createRun = (name: string, testItem?: vscode.TestItem): JestTestRun => {
    const item = testItem ?? this.item;
    const request = new vscode.TestRunRequest([item]);
    return this.context.createTestRun(request, {
      name,
    });
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
    const relativePath = path.relative(this.item.uri!.fsPath, absoluteFileName);
    const folders = relativePath.split(path.sep).slice(0, -1);

    return folders.reduce(this.addFolder, undefined);
  };
  /**
   * create a test item hierarchy for the given the test file based on its relative path. If the file is not
   * a test file, exception will be thrown.
   */
  private addTestFile = (
    absoluteFileName: string,
    onTestDocument: (doc: TestDocumentRoot) => void
  ): TestDocumentRoot => {
    const parent = this.addPath(absoluteFileName) ?? this;
    let docRoot = this.context.getChildData<TestDocumentRoot>(parent.item, absoluteFileName);
    if (!docRoot) {
      docRoot = this.testDocuments.get(absoluteFileName);
      if (docRoot) {
        parent.item.children.add(docRoot.item);
      } else {
        docRoot = new TestDocumentRoot(
          this.context,
          vscode.Uri.file(absoluteFileName),
          parent.item
        );
      }
    }
    this.testDocuments.set(absoluteFileName, docRoot);

    onTestDocument(docRoot);

    return docRoot;
  };

  /**
   * When test list updated, rebuild the whole testItem tree for all the test files (DocumentRoot).
   * But will reuse the existing test document from cache (testDocuments) to preserve info
   * such as parsed result that could be stored before test list update
   */
  private onTestListUpdated = (
    absoluteFileNames: string[] | undefined,
    run?: JestTestRun
  ): void => {
    this.item.children.replace([]);
    const testRoots: TestDocumentRoot[] = [];

    const aRun = run ?? this.createRun('onTestListUpdated');
    absoluteFileNames?.forEach((f) =>
      this.addTestFile(f, (testRoot) => {
        testRoot.updateResultState(aRun);
        testRoots.push(testRoot);
      })
    );
    //sync testDocuments
    this.testDocuments.clear();
    testRoots.forEach((t) => this.testDocuments.set(t.item.id, t));
    aRun.end({ reason: 'onTestListUpdated' });
    this.item.canResolveChildren = false;
  };

  // prevent a jest non-watch mode runs failed to stop, which could block the process queue from running other tests.
  // by default it will wait 10 seconds before killing the process
  private preventZombieProcess = (process: JestProcessInfo, delay = 10000): void => {
    if (process.status === ProcessStatus.Running && !process.isWatchMode) {
      process.autoStop(delay, () => {
        this.context.output.write(
          `Zombie jest process "${process.id}" is killed. Please investigate the root cause or file an issue.`,
          'warn'
        );
      });
    }
  };

  /**
   * invoked when external test result changed, this could be caused by the watch-mode or on-demand test run, includes vscode's runTest.
   * We will use either existing run or creating a new one if none exist yet,
   * and ask all touched DocumentRoot to refresh both the test items and their states.
   *
   * @param event
   */
  private onTestSuiteChanged = (event: TestSuitChangeEvent): void => {
    switch (event.type) {
      case 'assertions-updated': {
        const run = this.getJestRun(event, true);

        this.log(
          'debug',
          `update status from run "${event.process.id}": ${event.files.length} files`
        );
        if (event.files.length === 0) {
          run.write(`No tests were run.`, `new-line`);
        } else {
          event.files.forEach((f) =>
            this.addTestFile(f, (testRoot) => testRoot.onAssertionUpdate(run))
          );
        }
        run.end({ process: event.process, delay: 1000, reason: 'assertions-updated' });
        this.preventZombieProcess(event.process);

        break;
      }
      case 'result-matched': {
        const snapshotItems: SnapshotItemCollection = {
          viewable: [],
          updatable: [],
        };
        this.addTestFile(event.file, (testRoot) => {
          testRoot.onTestMatched();
          testRoot.gatherSnapshotItems(snapshotItems);
        });
        this.updateSnapshotContext(snapshotItems);
        break;
      }

      case 'result-match-failed': {
        const snapshotItems: SnapshotItemCollection = {
          viewable: [],
          updatable: [],
        };
        this.addTestFile(event.file, (testRoot) => {
          testRoot.discoverTest(undefined, event.sourceContainer);
          testRoot.gatherSnapshotItems(snapshotItems);
        });
        this.updateSnapshotContext(snapshotItems);
        break;
      }
    }
  };
  private updateSnapshotContext(snapshotItems: SnapshotItemCollection): void {
    tiContextManager.setItemContext({
      workspace: this.context.ext.workspace,
      key: 'jest.editor-view-snapshot',
      itemIds: snapshotItems.viewable.map((item) => item.id),
    });
    const getAllIds = (item: vscode.TestItem, allIds: Set<string>): void => {
      if (allIds.has(item.id)) {
        return;
      }
      allIds.add(item.id);
      if (item.parent) {
        getAllIds(item.parent, allIds);
      }
    };
    const allIds = new Set<string>();
    snapshotItems.updatable.forEach((item) => getAllIds(item, allIds));
    tiContextManager.setItemContext({
      workspace: this.context.ext.workspace,
      key: 'jest.editor-update-snapshot',
      itemIds: [...allIds],
    });
  }

  /** get test item from jest process. If running tests from source file, will return undefined */
  private getItemFromProcess = (process: JestProcessInfo): vscode.TestItem | undefined => {
    // the TestExplorer triggered run should already have item associated
    if (process.userData?.testItem) {
      return process.userData.testItem;
    }

    let fileName;
    switch (process.request.type) {
      case 'watch-tests':
      case 'watch-all-tests':
      case 'all-tests':
        return this.item;
      case 'by-file':
      case 'by-file-test':
        fileName = process.request.testFileName;
        break;
      case 'by-file-pattern':
      case 'by-file-test-pattern':
        fileName = process.request.testFileNamePattern;
        break;
      default:
        // the current flow would not reach here, but for future proofing
        // and avoiding failed silently, we will keep the code around but disable coverage reporting
        /* istanbul ignore next */
        throw new Error(`unsupported external process type ${process.request.type}`);
    }

    return this.testDocuments.get(fileName)?.item;
  };

  /** return a valid run from event. if createIfMissing is true, then create a new one if none exist in the event **/
  private getJestRun(event: TypedRunEvent, createIfMissing: true): JestTestRun;
  private getJestRun(event: TypedRunEvent, createIfMissing?: false): JestTestRun | undefined;
  // istanbul ignore next
  private getJestRun(event: TypedRunEvent, createIfMissing = false): JestTestRun | undefined {
    let run = event.process.userData?.run;

    if (!run && createIfMissing) {
      const name = (event.process.userData?.run?.name ?? event.process.id) + `:${event.type}`;
      const testItem = this.getItemFromProcess(event.process) ?? this.item;
      run = this.createRun(name, testItem);
      event.process.userData = { ...event.process.userData, run, testItem };
    }
    run?.addProcess(event.process);
    return run;
  }

  private runLog(type: string): void {
    const d = new Date();
    this.context.output.write(`> Test run ${type} at ${d.toLocaleString()} <\r\n`, [
      'bold',
      'new-line',
    ]);
  }
  private onRunEvent = (event: JestRunEvent) => {
    if (event.process.request.type === 'not-test') {
      return;
    }

    let run;
    try {
      run = this.getJestRun(event, true);
      switch (event.type) {
        case 'scheduled': {
          this.deepItemState(event.process.userData?.testItem, run.enqueued);
          break;
        }
        case 'data': {
          const text = event.raw ?? event.text;
          if (text && text.length > 0) {
            const opt = event.isError ? 'error' : event.newLine ? 'new-line' : undefined;
            run.write(text, opt);
          }
          break;
        }
        case 'start': {
          this.deepItemState(event.process.userData?.testItem, run.started);
          outputManager.clearOutputOnRun(this.context.ext.output);
          this.runLog(`"${event.process.id}" started`);
          break;
        }
        case 'end': {
          if (event.error && !event.process.userData?.execError) {
            run.write(event.error, 'error');
            event.process.userData = { ...(event.process.userData ?? {}), execError: true };
          }
          this.runLog(`"${event.process.id}" finished`);
          run.end({ process: event.process, delay: 30000, reason: 'process end' });
          break;
        }
        case 'exit': {
          if (event.error) {
            const testItem = event.process.userData?.testItem;
            if (testItem) {
              run.errored(testItem, new vscode.TestMessage(event.error));
            }
            if (!event.process.userData?.execError) {
              const type = getExitErrorDef(event.code) ?? GENERIC_ERROR;
              run.write(event.error, type);
              event.process.userData = { ...(event.process.userData ?? {}), execError: true };
            }
          }
          this.runLog(`"${event.process.id}" exited`);
          run.end({ process: event.process, delay: 1000, reason: 'process exit' });
          break;
        }
        case 'long-run': {
          run.write(
            `Long Running Tests Warning: Tests exceeds ${event.threshold}ms threshold. Please reference Troubleshooting if this is not expected`,
            LONG_RUNNING_TESTS
          );
          break;
        }
      }
    } catch (err) {
      this.log('error', `<onRunEvent> ${event.type} failed:`, err);
      run?.write(`<onRunEvent> ${event.type} failed: ${err}`, 'error');
      run?.end({ reason: 'Internal error onRunEvent' });
    }
  };

  dispose(): void {
    this.unregisterEvents();
  }
}

export class FolderData extends TestItemDataBase {
  static makeUri = (parent: vscode.TestItem, folderName: string): vscode.Uri => {
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
  getJestRunRequest(options?: ScheduleTestOptions): JestExtRequestType {
    return {
      type: 'by-file-pattern',
      testFileNamePattern: this.uri.fsPath,
      updateSnapshot: options?.itemCommand === ItemCommand.updateSnapshot,
      coverage: options?.profile?.kind === vscode.TestRunProfileKind.Coverage,
    };
  }
}

type ItemNodeType = NodeType<ItBlock | TestAssertionStatus>;
type ItemDataNodeType = DataNode<ItBlock | TestAssertionStatus>;
const isDataNode = (arg: ItemNodeType): arg is ItemDataNodeType =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (arg as any).data != null;

const isAssertDataNode = (arg: ItemNodeType): arg is DataNode<TestAssertionStatus> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isDataNode(arg) && (arg.data as any).fullName;

const isContainerEmpty = (node?: ContainerNode<TestAssertionStatus>): boolean => {
  if (!node) {
    return true;
  }
  if (
    (node.childData && node.childData.length > 0) ||
    (node.childContainers && node.childContainers.length > 0)
  ) {
    return false;
  }
  return true;
};

// type AssertNode = NodeType<TestAssertionStatus>;
abstract class TestResultData extends TestItemDataBase {
  constructor(
    readonly context: JestTestProviderContext,
    name: string
  ) {
    super(context, name);
  }

  // TODO - we should use "unknown" state when vscode supports it
  // (see https://github.com/microsoft/vscode/issues/206139).
  resetChildrenState(run: JestTestRun, result: TestSuiteResult): void {
    this.forEachChild((child) => {
      child.updateItemState(run, result);
      child.resetChildrenState(run, result);
    });
  }

  updateItemState(
    run: JestTestRun,
    result?: TestSuiteResult | TestAssertionStatus,
    errorLocation?: vscode.Location
  ): void {
    if (!result) {
      return;
    }
    const status = result.status;
    switch (status) {
      case 'KnownSuccess':
        run.passed(this.item);
        break;
      case 'KnownSkip':
      case 'KnownTodo':
        run.skipped(this.item);
        break;
      case 'KnownFail': {
        const message = new vscode.TestMessage(result.message);
        if (errorLocation) {
          message.location = errorLocation;
        }

        run.failed(this.item, message);
        break;
      }
    }
  }

  makeTestId(fileUri: vscode.Uri, target?: ItemNodeType, extra?: string): string {
    const parts = [fileUri.fsPath];
    if (target && target.name !== ROOT_NODE_NAME) {
      parts.push(target.fullName);
    }
    if (extra) {
      parts.push(extra);
    }
    return parts.join('#');
  }

  /**
   * Synchronizes the child nodes of the test item with the given ItemNodeType, recursively.
   * @param node - The ItemNodeType to synchronize the child nodes with.
   * @returns void
   */
  syncChildNodes(node: ItemNodeType): void {
    this.item.error = undefined;

    if (!isDataNode(node)) {
      const idMap = [...node.childContainers, ...node.childData]
        .flatMap((n) => n.getAll() as ItemDataNodeType[])
        .reduce((map, node) => {
          const id = this.makeTestId(this.uri, node);
          map.set(id, map.get(id)?.concat(node) ?? [node]);
          return map;
        }, new Map<string, ItemDataNodeType[]>());

      const newItems: vscode.TestItem[] = [];
      idMap.forEach((nodes, id) => {
        if (nodes.length > 1) {
          // duplicate names found, append index to make a unique id: re-create the item with new id
          nodes.forEach((n, idx) => {
            newItems.push(new TestData(this.context, this.uri, n, this.item, `${idx}`).item);
          });
          return;
        }
        let cItem = this.item.children.get(id);
        if (cItem) {
          this.context.getData<TestData>(cItem)?.updateNode(nodes[0]);
        } else {
          cItem = new TestData(this.context, this.uri, nodes[0], this.item).item;
        }
        newItems.push(cItem);
      });
      this.item.children.replace(newItems);
    } else {
      this.item.children.replace([]);
    }
  }

  createLocation(uri: vscode.Uri, zeroBasedLine = 0): vscode.Location {
    return new vscode.Location(uri, new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0));
  }

  forEachChild(onTestData: (child: TestData) => void): void {
    this.item.children.forEach((childItem) => {
      const child = this.context.getData<TestData>(childItem);
      if (child) {
        onTestData(child);
      }
    });
  }
}
export class TestDocumentRoot extends TestResultData {
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
      this.makeTestId(fileUri),
      path.basename(fileUri.fsPath),
      fileUri,
      this,
      parent
    );

    item.canResolveChildren = true;
    return item;
  }

  onAssertionUpdate(run: JestTestRun): void {
    // handle special case when the test results contains no assertions
    // (usually due to syntax error), we will need to mark the item's children
    // explicitly failed instead of just removing them. Due to vscode's current
    // implementation - removing the test item will not reset the item's status,
    // when they get added back again later (by the parsed source nodes), they
    // will inherit the previous status, which might not be correct.
    const suiteResult = this.context.ext.testResultProvider.getTestSuiteResult(this.item.id);
    if (suiteResult && isContainerEmpty(suiteResult.assertionContainer)) {
      this.resetChildrenState(run, suiteResult);
    }
    this.discoverTest(run);
  }

  discoverTest = (run?: JestTestRun, parsedRoot?: ContainerNode<ItBlock>): void => {
    this.createChildItems(parsedRoot);
    if (run) {
      this.updateResultState(run);
    }
  };

  private createChildItems = (parsedRoot?: ContainerNode<ItBlock>): void => {
    const container =
      this.context.ext.testResultProvider.getTestSuiteResult(this.item.id)?.assertionContainer ??
      parsedRoot;
    if (!container) {
      this.item.children.replace([]);
    } else {
      this.syncChildNodes(container);
    }

    this.item.canResolveChildren = false;
  };

  public updateResultState(run: JestTestRun): void {
    const suiteResult = this.context.ext.testResultProvider.getTestSuiteResult(this.item.id);

    // only update suite status if the assertionContainer is empty, which can occur when
    // test file has syntax error or failed to run for whatever reason.
    // In this case we should mark the suite itself as TestExplorer won't be able to
    // aggregate from the children list
    if (isContainerEmpty(suiteResult?.assertionContainer)) {
      this.updateItemState(run, suiteResult);
    }
    this.forEachChild((child) => child.updateResultState(run));
  }

  getJestRunRequest(options?: ScheduleTestOptions): JestExtRequestType {
    return {
      type: 'by-file-pattern',
      testFileNamePattern: this.uri.fsPath,
      updateSnapshot: options?.itemCommand === ItemCommand.updateSnapshot,
      coverage: options?.profile?.kind === vscode.TestRunProfileKind.Coverage,
    };
  }

  public onTestMatched(): void {
    this.forEachChild((child) => child.onTestMatched());
  }
  public gatherSnapshotItems(snapshotItems: SnapshotItemCollection): void {
    this.forEachChild((child) => child.gatherSnapshotItems(snapshotItems));
  }
  getDebugInfo(): DebugInfo {
    return { testPath: this.uri.fsPath };
  }
}
export class TestData extends TestResultData {
  constructor(
    readonly context: JestTestProviderContext,
    fileUri: vscode.Uri,
    private node: ItemNodeType,
    parent: vscode.TestItem,
    extraId?: string
  ) {
    super(context, 'TestData');
    this.item = this.createTestItem(fileUri, parent, extraId);
    this.updateNode(node);
  }

  private createTestItem(fileUri: vscode.Uri, parent: vscode.TestItem, extraId?: string) {
    const item = this.context.createTestItem(
      this.makeTestId(fileUri, this.node, extraId),
      this.node.name,
      fileUri,
      this,
      parent
    );

    item.canResolveChildren = false;
    return item;
  }

  private getTestNamePattern(): TestNamePattern {
    if (isDataNode(this.node)) {
      return { value: this.node.fullName, exactMatch: true };
    }
    return { value: this.node.fullName, exactMatch: false };
  }

  getJestRunRequest(options?: ScheduleTestOptions): JestExtRequestType {
    return {
      type: 'by-file-test-pattern',
      testFileNamePattern: this.uri.fsPath,
      testNamePattern: this.getTestNamePattern(),
      updateSnapshot: options?.itemCommand === ItemCommand.updateSnapshot,
      coverage: options?.profile?.kind === vscode.TestRunProfileKind.Coverage,
    };
  }

  getDebugInfo(): DebugInfo {
    return { testPath: this.uri.fsPath, testName: this.getTestNamePattern() };
  }
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

  updateNode(node: ItemNodeType): void {
    this.node = node;
    this.updateItemRange();
    this.syncChildNodes(node);
  }

  public onTestMatched(): void {
    // assertion might have picked up source block location
    this.updateItemRange();
    this.forEachChild((child) => child.onTestMatched());
  }

  /**
   * determine if a test contains dynamic content, such as template-literal or "test.each" variables from the node info.
   * Once the test is run, the node should reflect the resolved names.
   */
  isTestNameResolved(): boolean {
    //isGroup = true means "test.each"
    return !(this.node.attrs.isGroup === 'yes' || this.node.attrs.nonLiteralName === true);
  }
  public gatherSnapshotItems(snapshotItems: SnapshotItemCollection): void {
    // only response if not a "dynamic named" test, which we can't update or view snapshot until the names are resolved
    // after running the tests
    if (!this.isTestNameResolved()) {
      return;
    }
    if (this.node.attrs.snapshot === 'inline') {
      snapshotItems.updatable.push(this.item);
    }
    if (this.node.attrs.snapshot === 'external') {
      snapshotItems.updatable.push(this.item);
      snapshotItems.viewable.push(this.item);
    }
    this.forEachChild((child) => child.gatherSnapshotItems(snapshotItems));
  }
  public updateResultState(run: JestTestRun): void {
    if (this.node && isAssertDataNode(this.node)) {
      const assertion = this.node.data;
      const errorLine =
        assertion.line != null ? this.createLocation(this.uri, assertion.line - 1) : undefined;
      this.updateItemState(run, assertion, errorLine);
    }
    this.forEachChild((child) => child.updateResultState(run));
  }
  public viewSnapshot(): Promise<void> {
    if (this.node.attrs.snapshot === 'external') {
      return this.context.ext.testResultProvider.previewSnapshot(
        this.uri.fsPath,
        this.node.fullName
      );
    }
    this.log('error', `no external snapshot to be viewed: ${this.item.id}`);
    return Promise.resolve();
  }
}
