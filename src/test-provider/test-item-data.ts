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
import { Debuggable, ItemCommand, TestItemData } from './types';
import { JestTestProviderContext } from './test-provider-context';
import { JestTestRun } from './jest-test-run';
import { JestProcessInfo, JestProcessRequest } from '../JestProcessManagement';
import { GENERIC_ERROR, LONG_RUNNING_TESTS, getExitErrorDef } from '../errors';
import { JestExtOutput } from '../JestExt/output-terminal';
import { tiContextManager } from './test-item-context-manager';
import { toAbsoluteRootPath } from '../helpers';
import { runModeDescription } from '../JestExt/run-mode';
import { isVirtualWorkspaceFolder } from '../virtual-workspace-folder';
import { outputManager } from '../output-manager';

interface JestRunnable {
  getJestRunRequest: () => JestExtRequestType;
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

  scheduleTest(run: JestTestRun, itemCommand?: ItemCommand): void {
    if (!this.isTestNameResolved()) {
      const parent = this.item.parent && this.context.getData(this.item.parent);
      if (parent) {
        return parent.scheduleTest(run, itemCommand);
      }
      this.context.output.write(`running an unresolved parameterized test might fail`, 'warn');
    }

    const jestRequest = this.getJestRunRequest(itemCommand);

    this.deepItemState(this.item, run.enqueued);

    const process = this.context.ext.session.scheduleProcess(jestRequest, {
      run,
      testItem: this.item,
    });
    if (!process) {
      const msg = `failed to schedule test for ${this.item.id}`;
      run.errored(this.item, new vscode.TestMessage(msg));
      run.write(msg, 'error');
      run.end({ reason: 'failed to schedule test' });
    } else {
      run.addProcess(process.id);
    }
  }

  runItemCommand(command: ItemCommand): void | Promise<void> {
    switch (command) {
      case ItemCommand.updateSnapshot: {
        const request = new vscode.TestRunRequest([this.item]);
        const run = this.context.createTestRun(request, {
          name: `${command}-${this.item.id}`,
        });
        this.scheduleTest(run, command);
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
  abstract getJestRunRequest(itemCommand?: ItemCommand): JestExtRequestType;
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
      this,
      undefined,
      ['run']
    );
    const desc = runModeDescription(this.context.ext.settings.runMode.config);
    item.description = `(${desc.deferred?.label ?? desc.type.label})`;

    item.canResolveChildren = true;
    return item;
  }

  getJestRunRequest(itemCommand?: ItemCommand): JestExtRequestType {
    const transform = (request: JestProcessRequest) => {
      request.schedule.queue = 'blocking-2';
      return request;
    };
    const updateSnapshot = itemCommand === ItemCommand.updateSnapshot;
    return { type: 'all-tests', updateSnapshot, transform };
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
    const absoluteRoot = toAbsoluteRootPath(
      this.context.ext.workspace,
      this.context.ext.settings.rootPath
    );
    const relativePath = path.relative(absoluteRoot, absoluteFileName);
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
        const run = this.getJestRun(event, true);

        this.log(
          'debug',
          `update status from run "${event.process.id}": ${event.files.length} files`
        );
        if (event.files.length === 0) {
          run.write(`No tests were run.`, `new-line`);
        } else {
          event.files.forEach((f) => this.addTestFile(f, (testRoot) => testRoot.discoverTest(run)));
        }
        run.end({ pid: event.process.id, delay: 1000, reason: 'assertions-updated' });
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

    // should only come here for autoRun processes
    let fileName;
    switch (process.request.type) {
      case 'watch-tests':
      case 'watch-all-tests':
      case 'all-tests':
        return this.item;
      case 'by-file':
        fileName = process.request.testFileName;
        break;
      case 'by-file-pattern':
        fileName = process.request.testFileNamePattern;
        break;
      default:
        throw new Error(`unsupported external process type ${process.request.type}`);
    }

    return this.testDocuments.get(fileName)?.item;
  };

  /** return a valid run from event. if createIfMissing is true, then create a new one if none exist in the event **/
  private getJestRun(event: TypedRunEvent, createIfMissing: true): JestTestRun;
  private getJestRun(event: TypedRunEvent, createIfMissing?: false): JestTestRun | undefined;
  private getJestRun(event: TypedRunEvent, createIfMissing = false): JestTestRun | undefined {
    if (event.process.userData?.run) {
      return event.process.userData.run;
    }

    if (createIfMissing) {
      const name = (event.process.userData?.run?.name ?? event.process.id) + `:${event.type}`;
      const testItem = this.getItemFromProcess(event.process) ?? this.item;
      const run = this.createRun(name, testItem);
      run.addProcess(event.process.id);
      event.process.userData = { ...event.process.userData, run, testItem };

      return run;
    }
  }

  private runLog(type: string): void {
    const d = new Date();
    this.context.output.write(`> Test run ${type} at ${d.toLocaleString()} <\r\n`, [
      'bold',
      'new-line',
    ]);
  }
  private writer(run?: JestTestRun): JestExtOutput {
    return run ?? this.context.output;
  }
  private onRunEvent = (event: JestRunEvent) => {
    if (event.process.request.type === 'not-test') {
      return;
    }

    try {
      const run = this.getJestRun(event, true);
      switch (event.type) {
        case 'scheduled': {
          this.deepItemState(event.process.userData?.testItem, run.enqueued);
          break;
        }
        case 'data': {
          const text = event.raw ?? event.text;
          if (text && text.length > 0) {
            const opt = event.isError ? 'error' : event.newLine ? 'new-line' : undefined;
            this.writer(run).write(text, opt);
          }
          break;
        }
        case 'start': {
          this.deepItemState(event.process.userData?.testItem, run.started);
          outputManager.clearOutputOnRun(this.context.ext.output);
          this.runLog('started');
          break;
        }
        case 'end': {
          if (event.error && !event.process.userData?.execError) {
            this.writer(run).write(event.error, 'error');
            event.process.userData = { ...(event.process.userData ?? {}), execError: true };
          }
          this.runLog('finished');
          run?.end({ pid: event.process.id, delay: 30000, reason: 'process end' });
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
          this.runLog('exited');
          run.end({ pid: event.process.id, delay: 1000, reason: 'process exit' });
          break;
        }
        case 'long-run': {
          this.writer(run).write(
            `Long Running Tests Warning: Tests exceeds ${event.threshold}ms threshold. Please reference Troubleshooting if this is not expected`,
            LONG_RUNNING_TESTS
          );
          break;
        }
      }
    } catch (err) {
      this.log('error', `<onRunEvent> ${event.type} failed:`, err);
      this.context.output.write(`<onRunEvent> ${event.type} failed: ${err}`, 'error');
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
    const item = this.context.createTestItem(uri.fsPath, name, uri, this, parent, ['run']);

    item.canResolveChildren = false;
    return item;
  }
  getJestRunRequest(itemCommand?: ItemCommand): JestExtRequestType {
    const updateSnapshot = itemCommand === ItemCommand.updateSnapshot;
    return {
      type: 'by-file-pattern',
      updateSnapshot,
      testFileNamePattern: this.uri.fsPath,
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

const isEmpty = (node?: ItemNodeType): boolean => {
  if (!node) {
    return true;
  }
  if (isDataNode(node)) {
    return false;
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

  isSameId(id1: string, id2: string): boolean {
    if (id1 === id2) {
      return true;
    }
    // truncate the last "extra-id" added for duplicate test names before comparing
    const truncateExtra = (id: string): string => id.replace(/(.*)(#[0-9]+$)/, '$1');
    return truncateExtra(id1) === truncateExtra(id2);
  }

  syncChildNodes(node: ItemNodeType): void {
    const testId = this.makeTestId(this.uri, node);
    if (!this.isSameId(testId, this.item.id)) {
      this.item.error = 'invalid node';
      return;
    }
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
    return new vscode.Location(
      uri,
      new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 0))
    );
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
    if (isEmpty(suiteResult?.assertionContainer)) {
      this.updateItemState(run, suiteResult);
    }
    this.forEachChild((child) => child.updateResultState(run));
  }

  getJestRunRequest(itemCommand?: ItemCommand): JestExtRequestType {
    const updateSnapshot = itemCommand === ItemCommand.updateSnapshot;
    return {
      type: 'by-file-pattern',
      updateSnapshot,
      testFileNamePattern: this.uri.fsPath,
    };
  }

  getDebugInfo(): ReturnType<Debuggable['getDebugInfo']> {
    return { fileName: this.uri.fsPath };
  }

  public onTestMatched(): void {
    this.forEachChild((child) => child.onTestMatched());
  }
  public gatherSnapshotItems(snapshotItems: SnapshotItemCollection): void {
    this.forEachChild((child) => child.gatherSnapshotItems(snapshotItems));
  }
}
export class TestData extends TestResultData implements Debuggable {
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

  getJestRunRequest(itemCommand?: ItemCommand): JestExtRequestType {
    return {
      type: 'by-file-test-pattern',
      updateSnapshot: itemCommand === ItemCommand.updateSnapshot,
      testFileNamePattern: this.uri.fsPath,
      testNamePattern: this.node.fullName,
    };
  }

  getDebugInfo(): ReturnType<Debuggable['getDebugInfo']> {
    return { fileName: this.uri.fsPath, testNamePattern: this.node.fullName };
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
