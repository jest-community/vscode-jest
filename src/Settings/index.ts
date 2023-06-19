import * as vscode from 'vscode';
import { CoverageColors } from '../Coverage/CoverageOverlay';
import { JESParserPluginOptions, ProjectWorkspace } from 'jest-editor-support';
import { AutoRun } from '../JestExt/auto-run';
import { RunShell } from '../JestExt/run-shell';
import { isVirtualWorkspaceFolder } from '../virtual-workspace-folder';

export type JestTestProcessType =
  | 'all-tests'
  | 'watch-tests'
  | 'watch-all-tests'
  | 'by-file'
  | 'by-file-test'
  | 'not-test'
  | 'by-file-test-pattern'
  | 'by-file-pattern';

export type OnStartupType = Extract<JestTestProcessType, 'all-tests'>[];
export type OnSaveFileType = 'test-file' | 'test-src-file';
export type JestExtAutoRunShortHand = 'default' | 'watch' | 'on-save' | 'legacy' | 'off';

export type JestExtAutoRunConfig =
  | { watch: true; onStartup?: OnStartupType }
  | {
      watch: false;
      onStartup?: OnStartupType;
      onSave?: OnSaveFileType;
    };
export type JestExtAutoRunSetting = JestExtAutoRunShortHand | JestExtAutoRunConfig;

export type TestExplorerConfigLegacy =
  | { enabled: false }
  | { enabled: true; showClassicStatus?: boolean; showInlineError?: boolean };

export interface TestExplorerConfig {
  showInlineError?: boolean;
}

export type NodeEnv = ProjectWorkspace['nodeEnv'];
export type MonitorLongRun = 'off' | number;
export type AutoRevealOutputType = 'on-run' | 'on-exec-error' | 'off';
export interface PluginResourceSettings {
  jestCommandLine?: string;
  rootPath: string;
  showCoverageOnLoad: boolean;
  coverageFormatter: string;
  debugMode?: boolean;
  coverageColors?: CoverageColors;
  autoRun: AutoRun;
  testExplorer: TestExplorerConfig;
  nodeEnv?: NodeEnv;
  shell: RunShell;
  monitorLongRun?: MonitorLongRun;
  autoRevealOutput: AutoRevealOutputType;
  parserPluginOptions?: JESParserPluginOptions;
  enable?: boolean;
  useDashedArgs?: boolean;
}

export interface PluginWindowSettings {
  disabledWorkspaceFolders: string[];
}

export type VirtualFolderSettingKey = keyof PluginResourceSettings;
export type VirtualFolderSettings = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<VirtualFolderSettingKey, any>;

export type GetConfigFunction = <T>(key: VirtualFolderSettingKey) => T | undefined;
/**
 * Returns a function that retrieves Jest configuration settings for a given workspace folder.
 * If the workspace folder is a virtual folder, it first checks for the corresponding virtual folder setting.
 * If the setting is not found, it falls back to the workspace setting.
 * @param workspaceFolder The workspace folder to retrieve Jest configuration settings for.
 * @returns A function that takes a `VirtualFolderSettingKey` as an argument and returns the corresponding setting value.
 */
export const createJestSettingGetter = (
  workspaceFolder: vscode.WorkspaceFolder
): GetConfigFunction => {
  const config = vscode.workspace.getConfiguration('jest', workspaceFolder.uri);
  let vFolder: VirtualFolderSettings | undefined;

  if (isVirtualWorkspaceFolder(workspaceFolder)) {
    const virtualFolders = config.get<VirtualFolderSettings[]>('virtualFolders');
    vFolder = virtualFolders?.find((v) => v.name === workspaceFolder.name);
    if (!vFolder) {
      throw new Error(`[${workspaceFolder.name}] is missing corresponding virtual folder setting`);
    }
  }

  // get setting from virtual folder first, fallback to workspace setting if not found
  const getSetting = <T>(key: VirtualFolderSettingKey): T | undefined => {
    if (key === 'enable') {
      // if any of the folders is disabled, then the whole workspace is disabled
      return (config.get<boolean>(key) !== false && vFolder?.enable !== false) as T;
    }

    return vFolder?.[key] ?? config.get<T>(key);
  };
  return getSetting;
};
