import { JestTotalResults, ProjectWorkspace } from 'jest-editor-support';

import * as vscode from 'vscode';
import { LoggingFactory } from '../logging';
import {
  JestExtAutoRunConfig,
  OnSaveFileType,
  OnStartupType,
  PluginResourceSettings,
} from '../Settings';
import { AutoRunMode, StatusBarUpdate } from '../StatusBar';

export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}

export interface JestExtSessionAware {
  onSessionStart?: () => void;
  onSessionStop?: () => void;
}

export interface AutoRunAccessor {
  config: JestExtAutoRunConfig;
  isOff: boolean;
  isWatch: boolean;
  onSave: OnSaveFileType | undefined;
  onStartup: OnStartupType | undefined;
  mode: AutoRunMode;
}
export interface JestExtContext {
  settings: PluginResourceSettings;
  workspace: vscode.WorkspaceFolder;
  runnerWorkspace: ProjectWorkspace;
  loggingFactory: LoggingFactory;
  autoRun: AutoRunAccessor;
}

export interface JestExtProcessContextRaw extends JestExtContext {
  output: vscode.OutputChannel;
  updateStatusBar: (status: StatusBarUpdate) => void;
  updateWithData: (data: JestTotalResults) => void;
}
export type JestExtProcessContext = Readonly<JestExtProcessContextRaw>;
