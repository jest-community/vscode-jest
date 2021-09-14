import * as vscode from 'vscode';
import { extensionId } from '../appGlobals';
import { JestRunEvent } from '../JestExt';
import { TestSuiteResult } from '../TestResults';
import * as path from 'path';
import { JestExtRequestType } from '../JestExt/process-session';
import { ItBlock, TestAssertionStatus } from 'jest-editor-support';
import { ContainerNode, DataNode, NodeType, ROOT_NODE_NAME } from '../TestResults/match-node';
import { Logging } from '../logging';
import { TestSuitChangeEvent } from '../TestResults/test-result-events';
import { Debuggable, TestItemData, TestItemRun } from './types';
import { JestTestProviderContext } from './test-provider-context';
import { JestProcessInfo } from '../JestProcessManagement';

interface JestRunable {
  getJestRunRequest: (profile: vscode.TestRunProfile) => JestExtRequestType;
}
interface WithUri {
  uri: vscode.Uri;
}

type TestItemRunRequest = JestExtRequestType & { itemRun: TestItemRun };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isTestItemRunRequest = (arg: any): arg is TestItemRunRequest =>
  arg.itemRun?.item && arg.itemRun?.run && arg.itemRun?.end;

const deepItemState = (item: vscode.TestItem, setState: (item: vscode.TestItem) => void): void => {
  setState(item);
  item.children.forEach((child) => deepItemState(child, setState));
};
abstract class TestItemDataBase implements TestItemData, JestRunable, WithUri {
  item!: vscode.TestItem;
  log: Logging;

  constructor(public context: JestTestProviderContext, name: string) {
    this.log = context.ext.loggingFactory.create(name);
  }
  get uri(): vscode.Uri {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.item.uri!;
  }

  scheduleTest(run: vscode.TestRun, end: () => void, profile: vscode.TestRunProfile): void {
    const jestRequest = this.getJestRunRequest(profile);
    const itemRun: TestItemRun = { item: this.item, run, end };
    deepItemState(this.item, run.enqueued);

    const process = this.context.ext.session.scheduleProcess({
      ...jestRequest,
      itemRun,
    });
    if (!process) {
      const msg = `failed to schedule test for ${this.item.id}`;
      run.errored(this.item, new vscode.TestMessage(msg));
      this.context.appendOutput(msg, run, true, 'red');
      end();
    }
  }

  abstract getJestRunRequest(profile: vscode.TestRunProfile): JestExtRequestType;

  isRunnable(): boolean {
    return !this.context.ext.autoRun.isWatch;
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
}

/**
 * Goal of this class is to manage the TestItem hierarchy reflects DocumentRoot path. It is responsible
 * to create DocumentRoot for each test file by listening to the TestResultEvents.
 */
export class WorkspaceRoot extends TestItemDataBase {
  private testDocuments: Map<string, TestDocumentRoot>;
  private listeners: vscode.Disposable[];
  private cachedRun: Map<string, TestItemRun>;

  constructor(context: JestTestProviderContext) {
    super(context, 'WorkspaceRoot');
    this.item = this.createTestItem();
    this.testDocuments = new Map();
    this.listeners = [];
    this.cachedRun = new Map();

    this.registerEvents();
  }
  createTestItem(): vscode.TestItem {
    const item = this.context.createTestItem(
      `${extensionId}:${this.context.ext.workspace.name}`,
      this.context.ext.workspace.name,
      this.context.ext.workspace.uri,
      this
    );
    item.description = `(${this.context.ext.autoRun.mode})`;

    item.canResolveChildren = true;
    return item;
  }

  getJestRunRequest(_profile: vscode.TestRunProfile): JestExtRequestType {
    return { type: 'all-tests' };
  }
  discoverTest(run: vscode.TestRun): void {
    const testList = this.context.ext.testResolveProvider.getTestList();
    this.onTestListUpdated(testList, run);
  }

  // test result event handling
  private registerEvents = (): void => {
    this.listeners = [
      this.context.ext.testResolveProvider.events.testListUpdated.event(this.onTestListUpdated),
      this.context.ext.testResolveProvider.events.testSuiteChanged.event(this.onTestSuiteChanged),
      this.context.ext.sessionEvents.onRunEvent.event(this.onRunEvent),
    ];
  };
  private unregisterEvents = (): void => {
    this.listeners.forEach((l) => l.dispose());
    this.listeners.length = 0;
  };

  private createRun = (name?: string, item?: vscode.TestItem): vscode.TestRun => {
    const target = item ?? this.item;
    return this.context.createTestRun(new vscode.TestRunRequest([target]), name ?? target.id);
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
    const relativePath = path.relative(this.context.ext.workspace.uri.fsPath, absoluteFileName);
    const folders = relativePath.split(path.sep).slice(0, -1);

    return folders.reduce(this.addFolder, undefined);
  };
  /**
   * create a test item hierarchy for the given the test file based on its reltive path. If the file is not
   * a test file, exception will be thrown.
   */
  private addTestFile = (
    absoluteFileName: string,
    onTestDocument: (doc: TestDocumentRoot) => void
  ): TestDocumentRoot => {
    let docRoot = this.testDocuments.get(absoluteFileName);
    if (!docRoot) {
      const parent = this.addPath(absoluteFileName) ?? this;
      docRoot =
        this.context.getChildData<TestDocumentRoot>(parent.item, absoluteFileName) ??
        new TestDocumentRoot(this.context, vscode.Uri.file(absoluteFileName), parent.item);
      this.testDocuments.set(absoluteFileName, docRoot);
    }

    onTestDocument(docRoot);

    return docRoot;
  };

  /**
   * Wwhen test list updated, rebuild the whole testItem tree for all the test files (DocumentRoot)
   * Note: this could be optimized to only updat the differences if needed.
   */
  private onTestListUpdated = (
    absoluteFileNames: string[] | undefined,
    run?: vscode.TestRun
  ): void => {
    this.item.children.replace([]);
    this.testDocuments.clear();

    const aRun = run ?? this.createRun();
    try {
      absoluteFileNames?.forEach((f) =>
        this.addTestFile(f, (testRoot) => testRoot.updateResultState(aRun))
      );
    } catch (e) {
      this.log('error', `[WorkspaceRoot] "${this.item.id}" onTestListUpdated failed:`, e);
    } finally {
      aRun.end();
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
        const itemRun = this.getItemRun(event.process);
        const run = itemRun?.run ?? this.createRun(event.process.id);

        this.context.appendOutput(
          `update status from run "${event.process.id}": ${event.files.length} files`,
          run
        );
        try {
          event.files.forEach((f) => this.addTestFile(f, (testRoot) => testRoot.discoverTest(run)));
        } catch (e) {
          this.log('error', `"${this.item.id}" onTestSuiteChanged: assertions-updated failed:`, e);
        } finally {
          (itemRun ?? run).end();
        }
        break;
      }
      case 'result-matched': {
        this.addTestFile(event.file, (testRoot) => testRoot.onTestMatched());
        break;
      }
      case 'test-parsed': {
        this.addTestFile(event.file, (testRoot) =>
          testRoot.discoverTest(undefined, event.testContainer)
        );
      }
    }
  };

  private getItemFromProcess = (process: JestProcessInfo): vscode.TestItem => {
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

    const item = this.testDocuments.get(fileName)?.item;
    if (item) {
      return item;
    }
    throw new Error(`No test file found for ${fileName}`);
  };

  private createTestItemRun = (event: JestRunEvent): TestItemRun => {
    const item = this.getItemFromProcess(event.process);
    const run = this.createRun(`${event.type}:${event.process.id}`, item);
    const end = () => {
      this.cachedRun.delete(event.process.id);
      run.end();
    };
    const itemRun: TestItemRun = { item, run, end };
    this.cachedRun.set(event.process.id, itemRun);
    return itemRun;
  };
  private getItemRun = (process: JestProcessInfo): TestItemRun | undefined =>
    isTestItemRunRequest(process.request)
      ? process.request.itemRun
      : this.cachedRun.get(process.id);

  private onRunEvent = (event: JestRunEvent) => {
    if (event.process.request.type === 'not-test') {
      return;
    }

    let itemRun = this.getItemRun(event.process);

    try {
      switch (event.type) {
        case 'scheduled': {
          if (!itemRun) {
            itemRun = this.createTestItemRun(event);
            const text = `Scheduled test run "${event.process.id}" for "${itemRun.item.id}"`;
            this.context.appendOutput(text, itemRun.run);
            deepItemState(itemRun.item, itemRun.run.enqueued);
          }

          break;
        }
        case 'data': {
          itemRun = itemRun ?? this.createTestItemRun(event);
          const text = event.raw ?? event.text;
          const color = event.isError ? 'red' : undefined;
          this.context.appendOutput(text, itemRun.run, event.newLine ?? false, color);
          break;
        }
        case 'start': {
          itemRun = itemRun ?? this.createTestItemRun(event);
          deepItemState(itemRun.item, itemRun.run.started);
          break;
        }
        case 'end': {
          itemRun?.end();
          break;
        }
        case 'exit': {
          if (event.error) {
            if (!itemRun || itemRun.run.token.isCancellationRequested) {
              itemRun = this.createTestItemRun(event);
            }
            this.context.appendOutput(event.error, itemRun.run, true, 'red');
            itemRun.run.errored(itemRun.item, new vscode.TestMessage(event.error));
          }
          itemRun?.end();
          break;
        }
      }
    } catch (err) {
      this.log('error', `<onRunEvent> ${event.type} failed:`, err);
    }
  };

  dispose(): void {
    this.unregisterEvents();
    this.cachedRun.forEach((run) => run.end());
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

type ItemNodeType = NodeType<ItBlock | TestAssertionStatus>;
type ItemDataNodeType = DataNode<ItBlock | TestAssertionStatus>;
const isDataNode = (arg: ItemNodeType): arg is ItemDataNodeType =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (arg as any).data != null;

const isAssertDataNode = (arg: ItemNodeType): arg is DataNode<TestAssertionStatus> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isDataNode(arg) && (arg.data as any).fullName;

// type AssertNode = NodeType<TestAssertionStatus>;
abstract class TestResultData extends TestItemDataBase {
  constructor(readonly context: JestTestProviderContext, name: string) {
    super(context, name);
  }

  updateItemState(
    run: vscode.TestRun,
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
        if (
          this.context.ext.settings.testExplorer.enabled &&
          this.context.ext.settings.testExplorer.showInlineError
        ) {
          const message = new vscode.TestMessage(result.message);
          if (errorLocation) {
            message.location = errorLocation;
          }

          run.failed(this.item, message);
        } else {
          run.failed(this.item, []);
        }
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

  discoverTest = (run?: vscode.TestRun, parsedRoot?: ContainerNode<ItBlock>): void => {
    this.createChildItems(parsedRoot);
    if (run) {
      this.updateResultState(run);
    }
  };

  private createChildItems = (parsedRoot?: ContainerNode<ItBlock>): void => {
    try {
      const container =
        parsedRoot ??
        this.context.ext.testResolveProvider.getTestSuiteResult(this.item.id)?.assertionContainer;
      if (!container) {
        this.item.children.replace([]);
      } else {
        this.syncChildNodes(container);
      }
    } catch (e) {
      this.log('error', `[TestDocumentRoot] "${this.item.id}" createChildItems failed:`, e);
    } finally {
      this.item.canResolveChildren = false;
    }
  };

  public updateResultState(run: vscode.TestRun): void {
    const suiteResult = this.context.ext.testResolveProvider.getTestSuiteResult(this.item.id);
    this.updateItemState(run, suiteResult);

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
  getDebugInfo(): { fileName: string; testNamePattern: string } {
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
    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.onTestMatched()
    );
  }

  public updateResultState(run: vscode.TestRun): void {
    if (this.node && isAssertDataNode(this.node)) {
      const assertion = this.node.data;
      const errorLine =
        assertion.line != null ? this.createLocation(this.uri, assertion.line - 1) : undefined;
      this.updateItemState(run, assertion, errorLine);
    }
    this.item.children.forEach((childItem) =>
      this.context.getData<TestData>(childItem)?.updateResultState(run)
    );
  }
}
