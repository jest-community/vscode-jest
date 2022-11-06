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
import { pathToJest, pathToConfig, toFilePath } from '../helpers';
import { workspaceLogging } from '../logging';
import { JestExtContext, RunnerWorkspaceOptions } from './types';
import { CoverageColors } from '../Coverage';
import { platform, userInfo } from 'os';
import { JestOutputTerminal } from './output-terminal';
import { AutoRun } from './auto-run';

export const isWatchRequest = (request: JestProcessRequest): boolean =>
  request.type === 'watch-tests' || request.type === 'watch-all-tests';

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
  settings: PluginResourceSettings
): JestExtContext => {
  const createRunnerWorkspace = (options?: RunnerWorkspaceOptions) => {
    const ws = workspaceFolder.name;
    const currentJestVersion = 20;
    const [jestCommandLine, pathToConfig] = getJestCommandSettings(settings);
    return new ProjectWorkspace(
      toFilePath(settings.rootPath),
      jestCommandLine,
      pathToConfig,
      currentJestVersion,
      outputFileSuffix(ws, options?.outputFileSuffix),
      options?.collectCoverage ?? settings.showCoverageOnLoad,
      settings.debugMode,
      settings.nodeEnv,
      settings.shell
    );
  };
  const output = new JestOutputTerminal(workspaceFolder.name);
  return {
    workspace: workspaceFolder,
    settings,
    createRunnerWorkspace,
    loggingFactory: workspaceLogging(workspaceFolder.name, settings.debugMode ?? false),
    output,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isLoginShell = (arg: any): arg is LoginShell =>
  arg && typeof arg.path === 'string' && Array.isArray(arg.args);

const getShell = (config: vscode.WorkspaceConfiguration): string | LoginShell | undefined => {
  const shell = config.get<string | LoginShell>('shell');

  if (!shell || typeof shell === 'string') {
    return shell;
  }

  if (isLoginShell(shell)) {
    if (platform() === 'win32') {
      console.error(`LoginShell is not supported for windows currently.`);
      return;
    }
    if (shell.args.length <= 0) {
      console.error(
        'Invalid login-shell arguments. Expect arguments like "--login" or "-l", but got:',
        shell.args.length
      );
      return;
    }
    return shell;
  }
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
export const getExtensionResourceSettings = (uri: vscode.Uri): PluginResourceSettings => {
  const config = vscode.workspace.getConfiguration('jest', uri);

  const autoEnable = config.get<boolean>('autoEnable');
  const runAllTestsFirst = config.get<boolean>('runAllTestsFirst') ?? undefined;

  return {
    autoEnable,
    enableSnapshotUpdateMessages: config.get<boolean>('enableSnapshotUpdateMessages'),
    pathToConfig: config.get<string>('pathToConfig'),
    jestCommandLine: config.get<string>('jestCommandLine'),
    pathToJest: config.get<string>('pathToJest'),
    restartJestOnSnapshotUpdate: config.get<boolean>('restartJestOnSnapshotUpdate'),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    rootPath: path.join(uri.fsPath, config.get<string>('rootPath')!),
    runAllTestsFirst,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    showCoverageOnLoad: config.get<boolean>('showCoverageOnLoad')!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    coverageFormatter: config.get<string>('coverageFormatter')!,
    debugMode: config.get<boolean>('debugMode'),
    coverageColors: config.get<CoverageColors>('coverageColors'),
    testExplorer: getTestExplorer(config),
    nodeEnv: config.get<NodeEnv | null>('nodeEnv') ?? undefined,
    shell: getShell(config) ?? undefined,
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
