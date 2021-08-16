import * as vscode from 'vscode';
import { DebugFunction, JestSessionEvents, JestExtSessionContext } from '../JestExt';
import { TestResultProvider } from '../TestResults';
import { WorkspaceRoot, FolderData, TestData, TestDocumentRoot } from './test-item-data';
import { JestTestProviderContext } from './test-provider-context';

export type TestItemDataType = WorkspaceRoot | FolderData | TestDocumentRoot | TestData;

/** JestExt context exposed to the test explorer */
export interface JestExtExplorerContext extends JestExtSessionContext {
  readonly testResolveProvider: TestResultProvider;
  readonly sessionEvents: JestSessionEvents;
  debugTests: DebugFunction;
}

export interface TestItemRun {
  item: vscode.TestItem;
  run: vscode.TestRun;
  end: () => void;
}

export type RunType = vscode.TestRun | TestItemRun;
export interface TestItemData {
  readonly item: vscode.TestItem;
  readonly uri: vscode.Uri;
  context: JestTestProviderContext;
  discoverTest?: (run: vscode.TestRun) => void;
  scheduleTest: (run: vscode.TestRun, end: () => void, profile: vscode.TestRunProfile) => void;
  canRun: (profile: vscode.TestRunProfile) => boolean;
}

export interface Debuggable {
  getDebugInfo: () => { fileName: string; testNamePattern: string };
}
