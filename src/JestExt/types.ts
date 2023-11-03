import { JestTotalResults, ProjectWorkspace } from 'jest-editor-support';

import * as vscode from 'vscode';
import { LoggingFactory } from '../logging';
import { PluginResourceSettings } from '../Settings';
import { ProcessSession } from './process-session';
import { JestProcessInfo } from '../JestProcessManagement';
import { JestOutputTerminal } from './output-terminal';
import { TestIdentifier } from '../TestResults';
import { TestNamePattern } from '../types';

export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}
export interface RunnerWorkspaceOptions {
  outputFileSuffix?: string;
  collectCoverage?: boolean;
}
export interface JestExtContext {
  settings: PluginResourceSettings;
  workspace: vscode.WorkspaceFolder;
  loggingFactory: LoggingFactory;
  createRunnerWorkspace: (options?: RunnerWorkspaceOptions) => ProjectWorkspace;
  output: JestOutputTerminal;
}

export interface JestExtSessionContext extends JestExtContext {
  session: ProcessSession;
}
export interface RunEventBase {
  process: JestProcessInfo;
}
export type JestRunEvent = RunEventBase &
  (
    | { type: 'scheduled' }
    | { type: 'data'; text: string; raw?: string; newLine?: boolean; isError?: boolean }
    | { type: 'test-error' }
    | { type: 'process-start' }
    | { type: 'start' }
    | { type: 'end'; error?: string }
    | { type: 'exit'; error?: string; code?: number }
    | { type: 'long-run'; threshold: number; numTotalTestSuites?: number }
  );
export interface JestSessionEvents {
  onRunEvent: vscode.EventEmitter<JestRunEvent>;
  onTestSessionStarted: vscode.EventEmitter<JestExtSessionContext>;
  onTestSessionStopped: vscode.EventEmitter<void>;
}
export interface JestExtProcessContextRaw extends JestExtContext {
  updateWithData: (data: JestTotalResults, process: JestProcessInfo) => void;
  onRunEvent: vscode.EventEmitter<JestRunEvent>;
}
export type JestExtProcessContext = Readonly<JestExtProcessContextRaw>;

export type DebugTestIdentifier = string | TestIdentifier;
export type DebugFunction = (
  document: vscode.TextDocument | string,
  testNamePattern?: TestNamePattern
) => Promise<void>;
