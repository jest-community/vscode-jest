import * as vscode from 'vscode';
import { DebugFunction, JestSessionEvents, JestExtSessionContext } from '../JestExt';
import { TestResultProvider } from '../TestResults';
import { WorkspaceRoot, FolderData, TestData, TestDocumentRoot } from './test-item-data';
import { JestTestProviderContext } from './test-provider-context';
import { JestTestRun } from './jest-test-run';
import { DebugInfo } from '../types';

export type TestItemDataType = WorkspaceRoot | FolderData | TestDocumentRoot | TestData;

/** JestExt context exposed to the test explorer */
export interface JestExtExplorerContext extends JestExtSessionContext {
  readonly testResultProvider: TestResultProvider;
  readonly sessionEvents: JestSessionEvents;
  debugTests: DebugFunction;
}

export interface ScheduleTestOptions {
  itemCommand?: ItemCommand;
  profile?: vscode.TestRunProfile;
}

export interface TestItemData {
  readonly item: vscode.TestItem;
  readonly uri: vscode.Uri;
  context: JestTestProviderContext;
  discoverTest?: (run: JestTestRun) => void;
  scheduleTest: (run: JestTestRun, options?: ScheduleTestOptions) => void;
  runItemCommand: (command: ItemCommand) => void;
  getDebugInfo: () => DebugInfo;
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
