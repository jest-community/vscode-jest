import * as vscode from 'vscode';
import { DebugFunction, JestSessionEvents, JestExtSessionContext } from '../JestExt';
import { TestResultProvider } from '../TestResults';
import { WorkspaceRoot, FolderData, TestData, TestDocumentRoot } from './test-item-data';
import { JestTestProviderContext } from './test-provider-context';
import { JestTestRun } from './jest-test-run';

export type TestItemDataType = WorkspaceRoot | FolderData | TestDocumentRoot | TestData;

/** JestExt context exposed to the test explorer */
export interface JestExtExplorerContext extends JestExtSessionContext {
  readonly testResultProvider: TestResultProvider;
  readonly sessionEvents: JestSessionEvents;
  debugTests: DebugFunction;
}

export interface TestItemData {
  readonly item: vscode.TestItem;
  readonly uri: vscode.Uri;
  context: JestTestProviderContext;
  discoverTest?: (run: JestTestRun) => void;
  scheduleTest: (run: JestTestRun, itemCommand?: ItemCommand) => void;
  runItemCommand: (command: ItemCommand) => void;
}

export interface Debuggable {
  getDebugInfo: () => { fileName: string; testNamePattern?: string };
}

export enum TestTagId {
  Run = 'run',
  Debug = 'debug',
}

export enum ItemCommand {
  updateSnapshot = 'update-snapshot',
  viewSnapshot = 'view-snapshot',
  revealOutput = 'reveal-output',
}
