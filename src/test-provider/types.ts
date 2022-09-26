import * as vscode from 'vscode';
import { DebugFunction, JestSessionEvents, JestExtSessionContext } from '../JestExt';
import { TestResultProvider } from '../TestResults';
import { WorkspaceRoot, FolderData, TestData, TestDocumentRoot } from './test-item-data';
import { JestTestProviderContext, JestTestRun } from './test-provider-helper';

export type TestItemDataType = WorkspaceRoot | FolderData | TestDocumentRoot | TestData;

/** JestExt context exposed to the test explorer */
export interface JestExtExplorerContext extends JestExtSessionContext {
  readonly testResolveProvider: TestResultProvider;
  readonly sessionEvents: JestSessionEvents;
  debugTests: DebugFunction;
}

export interface TestItemData {
  readonly item: vscode.TestItem;
  readonly uri: vscode.Uri;
  context: JestTestProviderContext;
  discoverTest?: (run: JestTestRun) => void;
  scheduleTest: (run: JestTestRun) => void;
}

export interface Debuggable {
  getDebugInfo: () => { fileName: string; testNamePattern?: string };
}
