import * as vscode from 'vscode';
import { DebugTestIdentifier } from '../DebugCodeLens';
import { JestExtSessionContext } from '../JestExt';
import { TestResultProvider } from '../TestResults';
import { WorkspaceRoot, FolderData, TestData, TestDocumentRoot } from './test-item-data';
// import { CreateRunOptions, RunInfo } from './utils';
// import { JestTestProvider } from './test-provider';

export type TestItemDataType = WorkspaceRoot | FolderData | TestDocumentRoot | TestData;

export interface JestExtResultContext extends JestExtSessionContext {
  readonly testResolveProvider: TestResultProvider;
}
export type DebugFunction = (
  document: vscode.TextDocument | string,
  ...ids: DebugTestIdentifier[]
) => Promise<void>;

export interface ScheduledTest {
  run: vscode.TestRun;
  onDone: () => void;
  cancelToken: vscode.CancellationToken;
}
export interface JestTestProviderContext extends JestExtResultContext {
  // readonly testProvider: JestTestProvider;
  // root: vscode.TestItem;
  getData: <T extends TestItemDataType>(item: vscode.TestItem) => T | undefined;
  getChildData: <T extends TestItemDataType>(
    item: vscode.TestItem,
    childId: string
  ) => T | undefined;
  createTestItem: (
    id: string,
    label: string,
    uri: vscode.Uri,
    data: TestItemDataType,
    parent?: vscode.TestItem
  ) => vscode.TestItem;
  createTestRun: (request: vscode.TestRunRequest, name: string) => vscode.TestRun;
  getScheduledTest: (pid: string) => ScheduledTest | undefined;
}
export interface TestItemData {
  readonly item: vscode.TestItem;
  readonly uri: vscode.Uri;
  context: JestTestProviderContext;
  discoverTest: (run: vscode.TestRun) => void;
  scheduleTest: (run: vscode.TestRun, profile: vscode.TestRunProfile) => string | undefined;
  canRun: (profile: vscode.TestRunProfile) => boolean;
}

export interface Debuggable {
  getDebugInfo: () => { fileName: string; testNamePattern: string };
}

export interface WithUri {
  uri: vscode.Uri;
}
