/**
 * collection of stateless utility functions for declutter and easy to test
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectWorkspace, LoginShell, JESParserPluginOptions } from 'jest-editor-support';
import { JestProcessRequest } from '../JestProcessManagement';
import {
  PluginResourceSettings,
  TestExplorerConfig,
  NodeEnv,
  MonitorLongRun,
  TestExplorerConfigLegacy,
  JestExtAutoRunSetting,
  AutoRevealOutputType,
  VirtualFolderSettings,
  VirtualFolderSettingKey,
} from '../Settings';
import { workspaceLogging } from '../logging';
import { JestExtContext, RunnerWorkspaceOptions } from './types';
import { CoverageColors } from '../Coverage';
import { userInfo } from 'os';
import { JestOutputTerminal } from './output-terminal';
import { AutoRun } from './auto-run';
import { RunShell } from './run-shell';
import { toFilePath } from '../helpers';
import { isVirtualWorkspaceFolder } from '../virtual-workspace-folder';

export const isWatchRequest = (request: JestProcessRequest): boolean =>
  request.type === 'watch-tests' || request.type === 'watch-all-tests';

const getUserIdString = (): string => {
  try {
    const user = userInfo();
    if (user.uid >= 0) {
      return user.uid.toString();
    }
    if (user.username.length > 0) {
      return user.username;
    }
  } catch (e) {
    console.warn('failed to get userInfo:', e);
  }
  return 'unknown';
};
export const outputFileSuffix = (ws: string, extra?: string): string => {
  const s = `${ws}_${getUserIdString()}${extra ? `_${extra}` : ''}`;
  // replace non-word with '_'
  return s.replace(/\W/g, '_');
};
export const createJestExtContext = (
  workspaceFolder: vscode.WorkspaceFolder,
  settings: PluginResourceSettings,
  output: JestOutputTerminal
): JestExtContext => {
  const createRunnerWorkspace = (options?: RunnerWorkspaceOptions) => {
    const ws = workspaceFolder.name;
    const currentJestVersion = 20;

    if (!settings.jestCommandLine) {
      throw new Error(`[${workspaceFolder.name}] missing jestCommandLine`);
    }
    return new ProjectWorkspace(
      toFilePath(settings.rootPath),
      settings.jestCommandLine,
      '',
      currentJestVersion,
      outputFileSuffix(ws, options?.outputFileSuffix),
      options?.collectCoverage ?? settings.showCoverageOnLoad,
      settings.debugMode,
      settings.nodeEnv,
      settings.shell.toSetting()
    );
  };
  return {
    workspace: workspaceFolder,
    settings,
    createRunnerWorkspace,
    loggingFactory: workspaceLogging(workspaceFolder.name, settings.debugMode ?? false),
    output,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isTestExplorerConfigLegacy = (arg: any): arg is TestExplorerConfigLegacy =>
  typeof arg.enabled === 'boolean';

const DefaultTestExplorerSetting: TestExplorerConfig = {};
const adaptTestExplorer = (
  setting?: TestExplorerConfig | TestExplorerConfigLegacy
): TestExplorerConfig => {
  if (!setting) {
    return DefaultTestExplorerSetting;
  }

  if (isTestExplorerConfigLegacy(setting)) {
    if (setting.enabled === false || setting.showClassicStatus === true) {
      const message = `Invalid TestExplorer setting: please check README to upgrade. Will use the default setting instead`;
      console.error(message);
      vscode.window.showWarningMessage(message);
      return DefaultTestExplorerSetting;
    }
    return { showInlineError: setting.showInlineError };
  }

  return setting;
};
export const absoluteRootPath = (rootPath: string, workspaceRoot: string): string => {
  return path.isAbsolute(rootPath) ? rootPath : path.join(workspaceRoot, rootPath);
};
export const getExtensionResourceSettings = (
  workspaceFolder: vscode.WorkspaceFolder
): PluginResourceSettings => {
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
    // we already incorporated rootPath in the virtual folder uri, so do not repeat it here
    if (vFolder && key in vFolder) {
      return key === 'rootPath' ? undefined : (vFolder[key] as T);
    }
    return config.get<T>(key);
  };

  return {
    jestCommandLine: getSetting<string>('jestCommandLine'),
    rootPath: absoluteRootPath(getSetting<string>('rootPath') ?? '', workspaceFolder.uri.fsPath),
    showCoverageOnLoad: getSetting<boolean>('showCoverageOnLoad') ?? false,
    coverageFormatter: getSetting<string>('coverageFormatter') ?? 'DefaultFormatter',
    debugMode: getSetting<boolean>('debugMode'),
    coverageColors: getSetting<CoverageColors>('coverageColors'),
    testExplorer: adaptTestExplorer(
      getSetting<TestExplorerConfig | TestExplorerConfigLegacy>('testExplorer')
    ),
    nodeEnv: getSetting<NodeEnv | null>('nodeEnv') ?? undefined,
    shell: new RunShell(getSetting<string | LoginShell>('shell')),
    monitorLongRun: getSetting<MonitorLongRun>('monitorLongRun') ?? undefined,
    autoRun: new AutoRun(getSetting<JestExtAutoRunSetting | null>('autoRun')),
    autoRevealOutput: getSetting<AutoRevealOutputType>('autoRevealOutput') ?? 'on-run',
    parserPluginOptions: getSetting<JESParserPluginOptions>('parserPluginOptions'),
    enable: getSetting<boolean>('enable'),
  };
};

export const prefixWorkspace = (context: JestExtContext, message: string): string => {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
    return `(${context.workspace.name}) ${message}`;
  }
  return message;
};
