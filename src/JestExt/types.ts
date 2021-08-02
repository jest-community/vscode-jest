import { JestTotalResults, ProjectWorkspace } from 'jest-editor-support';

import * as vscode from 'vscode';
import * as messaging from '../messaging';
import { LoggingFactory } from '../logging';
import {
  JestExtAutoRunConfig,
  OnSaveFileType,
  OnStartupType,
  PluginResourceSettings,
} from '../Settings';
import { WizardTaskId } from '../setup-wizard';
import { AutoRunMode, StatusBarUpdate } from '../StatusBar';
import { ProcessSession } from './process-session';

export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}

export interface JestExtSessionAware {
  onSessionStart?: (context: JestExtSessionContext) => void;
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

export interface JestExtSessionContext extends JestExtContext {
  session: ProcessSession;
}
export interface ProcessOutput {
  append: (value: string) => void;
  appendLine: (value: string) => void;
  clear?: () => void;
  show?: (preserveFocus?: boolean) => void;
}

export interface JestExtProcessContextRaw extends JestExtContext {
  output: ProcessOutput;
  updateStatusBar: (status: StatusBarUpdate) => void;
  updateWithData: (data: JestTotalResults, pid: string) => void;
  setupWizardAction: (taskId: WizardTaskId) => messaging.MessageAction;
}
export type JestExtProcessContext = Readonly<JestExtProcessContextRaw>;
