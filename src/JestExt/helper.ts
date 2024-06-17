/**
 * collection of stateless utility functions for de-clutter and easy to test
 */
import * as vscode from 'vscode';
import { ProjectWorkspace, LoginShell, JESParserPluginOptions } from 'jest-editor-support';
import { JestProcessRequest } from '../JestProcessManagement';
import {
  PluginResourceSettings,
  TestExplorerConfig,
  NodeEnv,
  MonitorLongRun,
  JestExtAutoRunSetting,
  createJestSettingGetter,
  JestRunModeType,
  JestRunMode,
  DeprecatedPluginResourceSettings,
} from '../Settings';
import { workspaceLogging } from '../logging';
import { JestExtContext, RunnerWorkspaceOptions } from './types';
import { CoverageColors } from '../Coverage';
import { userInfo } from 'os';
import { JestOutputTerminal } from './output-terminal';
import { RunMode } from './run-mode';
import { RunShell } from './run-shell';
import { toAbsoluteRootPath, toFilePath } from '../helpers';

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
      options?.collectCoverage ?? settings.runMode.config.coverage ?? false,
      settings.debugMode,
      settings.nodeEnv,
      settings.shell.toSetting(),
      settings.useDashedArgs
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

export const getExtensionResourceSettings = (
  workspaceFolder: vscode.WorkspaceFolder
): PluginResourceSettings => {
  const getSetting = createJestSettingGetter(workspaceFolder);

  const deprecatedSettings: DeprecatedPluginResourceSettings = {
    showCoverageOnLoad: getSetting<boolean>('showCoverageOnLoad') ?? false,
    autoRun: getSetting<JestExtAutoRunSetting | null>('autoRun'),
    testExplorer: getSetting<TestExplorerConfig>('testExplorer'),
  };

  return {
    jestCommandLine: getSetting<string>('jestCommandLine'),
    rootPath: toAbsoluteRootPath(workspaceFolder, getSetting<string>('rootPath')),
    coverageFormatter: getSetting<string>('coverageFormatter') ?? 'DefaultFormatter',
    debugMode: getSetting<boolean>('debugMode'),
    coverageColors: getSetting<CoverageColors>('coverageColors'),
    nodeEnv: getSetting<NodeEnv | null>('nodeEnv') ?? undefined,
    shell: new RunShell(getSetting<string | LoginShell>('shell')),
    monitorLongRun: getSetting<MonitorLongRun>('monitorLongRun') ?? undefined,
    runMode: new RunMode(
      getSetting<JestRunModeType | JestRunMode | null>('runMode'),
      deprecatedSettings
    ),
    parserPluginOptions: getSetting<JESParserPluginOptions>('parserPluginOptions'),
    enable: getSetting<boolean>('enable'),
    useDashedArgs: getSetting<boolean>('useDashedArgs') ?? false,
    useJest30: getSetting<boolean>('useJest30'),
  };
};

export const prefixWorkspace = (context: JestExtContext, message: string): string => {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
    return `(${context.workspace.name}) ${message}`;
  }
  return message;
};
