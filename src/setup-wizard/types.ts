import * as vscode from 'vscode';

export interface WizardContext {
  debugConfigProvider: vscode.DebugConfigurationProvider;
  workspace: vscode.WorkspaceFolder;

  message: (msg: string, section?: string) => void;
}

export type WizardStatus = 'success' | 'error' | 'abort' | 'exit' | undefined;
export type WizardAction<T> = () => Promise<T>;
interface ActionableComp<T> {
  id: number;
  action: WizardAction<T>;
}
export type ActionableMenuItem<T = WizardStatus> = vscode.QuickPickItem & ActionableComp<T>;
export type ActionableButton<T = WizardStatus> = vscode.QuickInputButton & ActionableComp<T>;
export type ActionableMessageItem<T> = vscode.MessageItem & ActionableComp<T>;

export type ActionMessageType = 'info' | 'warning' | 'error';

export type AllowBackButton = { enableBackButton?: boolean };
export interface ActionMenuOptions<T = WizardStatus> extends AllowBackButton {
  title?: string;
  placeholder?: string;
  value?: string;
  rightButtons?: ActionableButton<T>[];
  selectItemIdx?: number;
}

export type ActionableResult<T = WizardStatus> = T | undefined;

export type SetupTask = (context: WizardContext) => Promise<WizardStatus>;

// settings
export const JestSettings = ['pathToJest', 'pathToConfig', 'jestCommandLine', 'rootPath'];
type JestSettingKey = typeof JestSettings[number];

// prettier-ignore
export type WizardSettings = 
  { [key in JestSettingKey]?: string } & 
  { ['configurations']?: vscode.DebugConfiguration[] } & 
  { ['absoluteRootPath']?: string };

export interface ConfigEntry {
  name: string;
  value: unknown;
}

export const WIZARD_HELP_URL =
  'https://github.com/jest-community/vscode-jest/blob/master/setup-wizard.md';
