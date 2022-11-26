/**
 * collection of stateless utility functions for declutter and easy to test
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectWorkspace, LoginShell } from 'jest-editor-support';
import { JestProcessRequest } from '../JestProcessManagement';
import {
  PluginResourceSettings,
  TestExplorerConfig,
  NodeEnv,
  MonitorLongRun,
  TestExplorerConfigLegacy,
  JestExtAutoRunSetting,
} from '../Settings';
import { workspaceLogging } from '../logging';
import { JestExtContext, RunnerWorkspaceOptions } from './types';
import { CoverageColors } from '../Coverage';
import { userInfo } from 'os';
import { JestOutputTerminal } from './output-terminal';
import { AutoRun } from './auto-run';
import { RunShell } from './run-shell';
import { toFilePath } from '../helpers';

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
const getTestExplorer = (config: vscode.WorkspaceConfiguration): TestExplorerConfig => {
  const setting = config.get<TestExplorerConfig | TestExplorerConfigLegacy>('testExplorer');
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
export const getExtensionResourceSettings = (uri: vscode.Uri): PluginResourceSettings => {
  const config = vscode.workspace.getConfiguration('jest', uri);

  const autoEnable = config.get<boolean>('autoEnable');
  const runAllTestsFirst = config.get<boolean>('runAllTestsFirst') ?? undefined;

  return {
    autoEnable,
    pathToConfig: config.get<string>('pathToConfig'),
    jestCommandLine: config.get<string>('jestCommandLine'),
    pathToJest: config.get<string>('pathToJest'),
    rootPath: absoluteRootPath(config.get<string>('rootPath') ?? '', uri.fsPath),
    runAllTestsFirst,
    showCoverageOnLoad: config.get<boolean>('showCoverageOnLoad') ?? false,
    coverageFormatter: config.get<string>('coverageFormatter') ?? 'DefaultFormatter',
    debugMode: config.get<boolean>('debugMode'),
    coverageColors: config.get<CoverageColors>('coverageColors'),
    testExplorer: getTestExplorer(config),
    nodeEnv: config.get<NodeEnv | null>('nodeEnv') ?? undefined,
    shell: new RunShell(config.get<string | LoginShell>('shell')),
    monitorLongRun: config.get<MonitorLongRun>('monitorLongRun') ?? undefined,
    autoRun: new AutoRun(
      config.get<JestExtAutoRunSetting | null>('autoRun'),
      autoEnable,
      runAllTestsFirst
    ),
  };
};

export const prefixWorkspace = (context: JestExtContext, message: string): string => {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
    return `(${context.workspace.name}) ${message}`;
  }
  return message;
};
