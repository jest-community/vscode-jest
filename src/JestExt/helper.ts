/**
 * collection of stateless utility functions for declutter and easy to test
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectWorkspace } from 'jest-editor-support';
import { JestProcessRequest } from '../JestProcessManagement';
import {
  PluginResourceSettings,
  JestExtAutoRunConfig,
  TestExplorerConfig,
  NodeEnv,
} from '../Settings';
import { AutoRunMode } from '../StatusBar';
import { pathToJest, pathToConfig, toFilePath } from '../helpers';
import { workspaceLogging } from '../logging';
import { AutoRunAccessor, JestExtContext } from './types';
import { CoverageColors } from '../Coverage';

export const isWatchRequest = (request: JestProcessRequest): boolean =>
  request.type === 'watch-tests' || request.type === 'watch-all-tests';

const autoRunMode = (autoRun: JestExtAutoRunConfig): AutoRunMode => {
  if (autoRun === 'off') {
    return 'auto-run-off';
  }
  if (autoRun.watch === true) {
    return 'auto-run-watch';
  }
  if (autoRun.onSave === 'test-src-file') {
    return 'auto-run-on-save';
  }
  if (autoRun.onSave === 'test-file') {
    return 'auto-run-on-save-test';
  }
  return 'auto-run-off';
};
/**
 * create a backward compatible runMode from the the legacy settings
 */
const getAutoRun = (pluginSettings: PluginResourceSettings): JestExtAutoRunConfig => {
  if (pluginSettings.autoRun) {
    return pluginSettings.autoRun;
  }

  if (!pluginSettings.autoEnable) {
    return 'off';
  }
  if (pluginSettings.runAllTestsFirst) {
    return { watch: true, onStartup: ['all-tests'] };
  }

  return { watch: true };
};

export const AutoRun = (pluginSettings: PluginResourceSettings): AutoRunAccessor => {
  const config = getAutoRun(pluginSettings);
  return {
    config,
    isOff: config === 'off',
    isWatch: config !== 'off' && config.watch,
    onSave: config !== 'off' && config.watch === false ? config.onSave : undefined,
    onStartup: config !== 'off' ? config.onStartup : undefined,
    mode: autoRunMode(config),
  };
};

/**
 * This method retrieve a jest command line, if available, otherwise fall back to the legacy
 * settings for pathToJest and pathToConfig.
 *
 * @param settings
 */
//TODO remove pathToJest and pathToConfig once we fully deprecated them
const getJestCommandSettings = (settings: PluginResourceSettings): [string, string] => {
  if (settings.jestCommandLine) {
    return [settings.jestCommandLine, ''];
  }
  return [pathToJest(settings), pathToConfig(settings)];
};

export const createJestExtContext = (
  workspaceFolder: vscode.WorkspaceFolder,
  settings: PluginResourceSettings
): JestExtContext => {
  const currentJestVersion = 20;
  const [jestCommandLine, pathToConfig] = getJestCommandSettings(settings);
  const runnerWorkspace = new ProjectWorkspace(
    toFilePath(settings.rootPath),
    jestCommandLine,
    pathToConfig,
    currentJestVersion,
    workspaceFolder.name,
    settings.showCoverageOnLoad,
    settings.debugMode,
    settings.nodeEnv,
    settings.shell
  );
  return {
    workspace: workspaceFolder,
    settings,
    runnerWorkspace,
    loggingFactory: workspaceLogging(workspaceFolder.name, settings.debugMode ?? false),
    autoRun: AutoRun(settings),
  };
};

export const getExtensionResourceSettings = (uri: vscode.Uri): PluginResourceSettings => {
  const config = vscode.workspace.getConfiguration('jest', uri);
  return {
    autoEnable: config.get<boolean>('autoEnable'),
    enableSnapshotUpdateMessages: config.get<boolean>('enableSnapshotUpdateMessages'),
    pathToConfig: config.get<string>('pathToConfig'),
    jestCommandLine: config.get<string>('jestCommandLine'),
    pathToJest: config.get<string>('pathToJest'),
    restartJestOnSnapshotUpdate: config.get<boolean>('restartJestOnSnapshotUpdate'),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    rootPath: path.join(uri.fsPath, config.get<string>('rootPath')!),
    runAllTestsFirst: config.get<boolean>('runAllTestsFirst'),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    showCoverageOnLoad: config.get<boolean>('showCoverageOnLoad')!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    coverageFormatter: config.get<string>('coverageFormatter')!,
    debugMode: config.get<boolean>('debugMode'),
    coverageColors: config.get<CoverageColors>('coverageColors'),
    autoRun: config.get<JestExtAutoRunConfig>('autoRun'),
    testExplorer: config.get<TestExplorerConfig>('testExplorer') ?? { enabled: true },
    nodeEnv: config.get<NodeEnv | null>('nodeEnv') ?? undefined,
    shell: config.get<string | null>('shell') ?? undefined,
  };
};

export const prefixWorkspace = (context: JestExtContext, message: string): string => {
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
    return `(${context.workspace.name}) ${message}`;
  }
  return message;
};
