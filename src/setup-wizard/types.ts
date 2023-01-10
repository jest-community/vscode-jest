import * as vscode from 'vscode';
import { DebugConfigurationProvider } from '../DebugConfigurationProvider';
import { JestExtOutput } from '../JestExt/output-terminal';
import { JestExtAutoRunSetting } from '../Settings';
import { WorkspaceManager } from '../workspace-manager';

export interface WizardContext {
  debugConfigProvider: DebugConfigurationProvider;
  wsManager: WorkspaceManager;
  vscodeContext: vscode.ExtensionContext;
  workspace?: vscode.WorkspaceFolder;
  message: JestExtOutput['write'];
  verbose?: boolean;
}

export type WizardStatus = 'success' | 'error' | 'abort' | 'exit' | undefined;
export type WizardAction<T> = () => Promise<T>;
interface ActionableComp<T> {
  id: number;
  action?: WizardAction<T>;
}
export type ActionableMenuItem<T = WizardStatus> = vscode.QuickPickItem & ActionableComp<T>;
export type ActionableButton<T = WizardStatus> = vscode.QuickInputButton & ActionableComp<T>;
export type ActionableMessageItem<T> = vscode.MessageItem & ActionableComp<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isActionableButton = (arg: any): arg is ActionableButton<unknown> =>
  arg && arg.iconPath && typeof arg.action === 'function';

export type ActionMessageType = 'info' | 'warning' | 'error';

export type AllowBackButton = { enableBackButton?: boolean };
export type Verbose = { verbose?: boolean };

// actionable menu
export type ActionMenuInput<T> = ActionableMenuItem<T> | ActionableButton<T> | undefined;
export type ActionableMenuResult<T = WizardStatus> = T | undefined;
export interface ActionMenuOptions<T = WizardStatus> extends AllowBackButton, Verbose {
  title?: string;
  placeholder?: string;
  value?: string;
  rightButtons?: ActionableButton<T>[];
  selectItemIdx?: number;
  // if true, treat action item/button without action as no-op; otherwise exit with "undefined"
  allowNoAction?: boolean;
}

// actionable input box
export type ActionInputResult<T> = T | string | undefined;
export type ActionInput<T> = ActionInputResult<T> | ActionableButton<T> | undefined;
export interface ActionInputBoxOptions<T> extends AllowBackButton, Verbose {
  title?: string;
  prompt?: string;
  value?: string;
  rightButtons?: ActionableButton<T>[];
}

export type SetupTask = (context: WizardContext) => Promise<WizardStatus>;

// settings
export const JestSettings = ['jestCommandLine', 'rootPath'];
type JestSettingKey = typeof JestSettings[number];

// prettier-ignore
export type WizardSettings = 
  { [key in JestSettingKey]?: string } & 
  { ['autoRun']?: JestExtAutoRunSetting} &
  { ['configurations']?: vscode.DebugConfiguration[] } & 
  { ['absoluteRootPath']?: string };

export interface ConfigEntry {
  name: string;
  value: unknown;
}

export const WIZARD_HELP_URL =
  'https://github.com/jest-community/vscode-jest/blob/master/setup-wizard.md';
