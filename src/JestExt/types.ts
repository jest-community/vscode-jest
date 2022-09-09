import { JestTotalResults, ProjectWorkspace } from 'jest-editor-support';

import * as vscode from 'vscode';
import { LoggingFactory } from '../logging';
import {
  JestExtAutoRunConfig,
  OnSaveFileType,
  OnStartupType,
  PluginResourceSettings,
} from '../Settings';
import { AutoRunMode } from '../StatusBar';
import { ProcessSession } from './process-session';
import { DebugTestIdentifier } from '../DebugCodeLens';
import { JestProcessInfo } from '../JestProcessManagement';

export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}
export interface AutoRunAccessor {
  config: JestExtAutoRunConfig;
  isOff: boolean;
  isWatch: boolean;
  onSave: OnSaveFileType | undefined;
  onStartup: OnStartupType | undefined;
  mode: AutoRunMode;
}
export interface RunnerWorkspaceOptions {
  outputFileSuffix?: string;
  collectCoverage?: boolean;
}
export interface JestExtContext {
  settings: PluginResourceSettings;
  workspace: vscode.WorkspaceFolder;
  loggingFactory: LoggingFactory;
  autoRun: AutoRunAccessor;
  createRunnerWorkspace: (options?: RunnerWorkspaceOptions) => ProjectWorkspace;
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
    | { type: 'start' }
    | { type: 'end' }
    | { type: 'exit'; error?: string }
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

export type DebugFunction = (
  document: vscode.TextDocument | string,
  ...ids: DebugTestIdentifier[]
) => Promise<void>;
