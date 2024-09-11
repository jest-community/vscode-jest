import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {
  toFilePath,
  getTestCommand,
  isCreateReactAppTestCommand,
  escapeRegExp,
  parseCmdLine,
  toAbsoluteRootPath,
} from './helpers';
import { platform } from 'os';
import { PluginResourceSettings } from './Settings';
import { DebugInfo } from './types';

export const DEBUG_CONFIG_PLATFORMS = ['windows', 'linux', 'osx'];
const testNamePatternRegex = /\$\{jest.testNamePattern\}/g;
const testFileRegex = /\$\{jest.testFile\}/g;
const testFilePatternRegex = /\$\{jest.testFilePattern\}/g;

export type DebugConfigOptions = Partial<
  Pick<PluginResourceSettings, 'jestCommandLine' | 'rootPath' | 'nodeEnv'>
>;
type PartialDebugConfig = Partial<vscode.DebugConfiguration>;
export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private debugInfo: DebugInfo | undefined;
  private fromWorkspaceFolder: vscode.WorkspaceFolder | undefined;
  private useJest30: boolean | undefined;

  /**
   * Prepares injecting the name of the test, which has to be debugged, into the `DebugConfiguration`,
   * This function has to be called before `vscode.debug.startDebugging`.
   */
  public prepareTestRun(
    debugInfo: DebugInfo,
    workspaceFolder: vscode.WorkspaceFolder,
    useJest30?: boolean
  ): void {
    this.debugInfo = { ...debugInfo };
    this.fromWorkspaceFolder = workspaceFolder;
    this.useJest30 = useJest30;
  }

  getDebugConfigNames(workspaceFolder?: vscode.WorkspaceFolder): {
    v1: string[];
    v2: string[];
    sorted: string[];
  } {
    const v1 = ['vscode-jest-tests'];
    const v2 = ['vscode-jest-tests.v2'];
    const sorted = [...v2, ...v1];

    if (workspaceFolder) {
      v1.unshift(`vscode-jest-tests.${workspaceFolder.name}`);
      v2.unshift(`vscode-jest-tests.v2.${workspaceFolder.name}`);
      sorted.unshift(v2[0], v1[0]);
    }
    return { v1, v2, sorted };
  }

  resolveDebugConfiguration(
    workspace: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.DebugConfiguration {
    const folder = this.fromWorkspaceFolder || workspace;
    const { v1, v2 } = this.getDebugConfigNames(folder);

    if (v2.includes(debugConfiguration.name)) {
      return this.resolveDebugConfig2(debugConfiguration);
    }
    // not our debug configuration
    if (!v1.includes(debugConfiguration.name)) {
      return debugConfiguration;
    }

    if (!debugConfiguration.env) {
      debugConfiguration.env = {};
    }
    // necessary for running CRA test scripts in non-watch mode
    debugConfiguration.env.CI = 'vscode-jest-tests';

    const args = debugConfiguration.args || [];

    if (this.debugInfo) {
      if (this.debugInfo.testName) {
        args.push('--testNamePattern');
        args.push(escapeRegExp(this.debugInfo.testName));
      }
      if (this.debugInfo.useTestPathPattern) {
        args.push(this.getTestPathPatternOption());
        args.push(escapeRegExp(this.debugInfo.testPath));
      } else {
        args.push('--runTestsByPath');
        args.push(toFilePath(this.debugInfo.testPath));
      }

      this.debugInfo = undefined;
    }

    debugConfiguration.args = args;
    return debugConfiguration;
  }

  private getTestPathPatternOption(): string {
    return this.useJest30 ? '--testPathPatterns' : '--testPathPattern';
  }
  /**
   * resolve v2 debug config
   * @param debugConfiguration v2 debug config
   * @returns
   */
  resolveDebugConfig2(debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
    if (
      !this.debugInfo ||
      !debugConfiguration.args ||
      !Array.isArray(debugConfiguration.args) ||
      debugConfiguration.args.length <= 0
    ) {
      return debugConfiguration;
    }

    const debugInfo = this.debugInfo;
    const args = debugConfiguration.args.map((arg) => {
      if (typeof arg !== 'string') {
        return arg;
      }
      if (debugInfo.useTestPathPattern) {
        // if the debugInfo indicated this is a testPathPattern (such as running all tests within a folder)
        // , we need to replace the --runTestsByPath argument with the correct --testPathPattern(s) argument
        if (arg.includes('--runTestsByPath')) {
          return arg.replace('--runTestsByPath', this.getTestPathPatternOption());
        }
        if (testFileRegex.test(arg)) {
          return arg.replace(testFileRegex, escapeRegExp(debugInfo.testPath));
        }
      }
      return arg
        .replace(testFileRegex, toFilePath(debugInfo.testPath))
        .replace(testFilePatternRegex, escapeRegExp(debugInfo.testPath))
        .replace(
          testNamePatternRegex,
          debugInfo.testName ? escapeRegExp(debugInfo.testName) : '.*'
        );
    });
    debugConfiguration.args = args;
    this.debugInfo = undefined;

    return debugConfiguration;
  }

  /**
   * generate a v2 debug configuration
   * @param folder
   * @param _token
   * @returns
   */
  provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken
  ): vscode.DebugConfiguration[] {
    // default jest config according to:
    // https://github.com/Microsoft/vscode-recipes/tree/master/debugging-jest-tests#configure-launchjson-file-for-your-test-framework

    // create-react-app config according to:
    // https://facebook.github.io/create-react-app/docs/debugging-tests#debugging-tests-in-visual-studio-code

    const name = this.getDebugConfigNames(folder).v2[0];

    // tslint:disable no-invalid-template-strings
    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'node',
      name,
      request: 'launch',
      args: [
        '--runInBand',
        '--watchAll=false',
        '--testNamePattern',
        '${jest.testNamePattern}',
        '--runTestsByPath',
        '${jest.testFile}',
      ],
      cwd: '${workspaceFolder}',
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      disableOptimisticBPs: true,
    };

    const testCommand = folder && getTestCommand(folder.uri.fsPath);
    if (testCommand && isCreateReactAppTestCommand(testCommand)) {
      const craCommand = testCommand.split(' ');
      // Settings specific for projects bootstrapped with `create-react-app`
      debugConfiguration.runtimeExecutable =
        '${workspaceFolder}/node_modules/.bin/' + craCommand.shift();
      debugConfiguration.args = [...craCommand, ...debugConfiguration.args];
      debugConfiguration.protocol = 'inspector';
    } else {
      // Plain jest setup
      debugConfiguration.program = '${workspaceFolder}/node_modules/.bin/jest';
      debugConfiguration.windows = {
        program: '${workspaceFolder}/node_modules/jest/bin/jest',
      };
    }

    return [debugConfiguration];
  }

  /** return a config if cmd is a package-manager */
  private usePM(cmd: string, args: string[]): PartialDebugConfig | undefined {
    const commonConfig = {
      program: undefined,
    };

    if (cmd === 'npm') {
      const extraArgs = args.includes('--') ? [] : ['--'];
      return { runtimeExecutable: 'npm', args: extraArgs, ...commonConfig };
    }
    if (cmd === 'yarn') {
      return { runtimeExecutable: 'yarn', args: [], ...commonConfig };
    }
  }

  /**
   * Creates a debug configuration for a given workspace.
   *
   * @param {vscode.WorkspaceFolder} workspace - The workspace folder for which the debug configuration is created.
   * @param {DebugConfigOptions} [options] - Optional parameters to override the default debug configuration.
   * @returns {vscode.DebugConfiguration} The final debug configuration.
   *
   * @throws {Error} If the provided jestCommandLine is invalid.
   *
   * This function customizes the default debug configuration with the settings from the options parameter,
   * such as `rootPath`, `jestCommandLine`, and `nodeEnv`.
   * Please note, the platform-specific settings that were not converted are removed.
   */
  createDebugConfig(
    workspace: vscode.WorkspaceFolder,
    options?: DebugConfigOptions
  ): vscode.DebugConfiguration {
    const config = this.provideDebugConfigurations(workspace)[0];
    let args: string[] = [];
    let override: PartialDebugConfig = {};

    const absoluteRootPath = options?.rootPath && toAbsoluteRootPath(workspace, options.rootPath);
    const cwd = absoluteRootPath ?? config.cwd;

    // handle jestCommandLine related overrides
    if (options?.jestCommandLine) {
      const [cmd, ...cmdArgs] = parseCmdLine(options.jestCommandLine);
      if (!cmd) {
        throw new Error(`invalid cmdLine: ${options.jestCommandLine}`);
      }
      const pmConfig = this.usePM(cmd, cmdArgs);
      if (pmConfig) {
        args = [...cmdArgs, ...pmConfig.args, ...config.args];
        override = { ...pmConfig, args };
      } else {
        let program = path.isAbsolute(cmd)
          ? cmd
          : absoluteRootPath
            ? path.resolve(absoluteRootPath, cmd)
            : ['${workspaceFolder}', cmd].join(path.sep);
        program = this.adjustProgram(program);
        args = [...cmdArgs, ...config.args];
        override = { program, args };
      }
    }

    //handle nodeEnv
    if (options?.nodeEnv) {
      override = { env: options.nodeEnv, ...override };
    }

    const finalConfig: vscode.DebugConfiguration = { ...config, cwd, ...override };

    // delete platform specific settings since we did not convert them
    DEBUG_CONFIG_PLATFORMS.forEach((p) => delete finalConfig[p]);

    return finalConfig;
  }

  // adopt program/command for debug purpose
  private adjustProgram(program: string): string {
    if (platform() === 'win32' && program.endsWith('\\node_modules\\.bin\\jest.cmd')) {
      const newProgram = program.replace(
        '\\node_modules\\.bin\\jest.cmd',
        '\\node_modules\\jest\\bin\\jest.js'
      );
      if (fs.existsSync(newProgram)) {
        return newProgram;
      }
      throw new Error(`failed to find jest binary: ${newProgram}`);
    }
    return program;
  }
}
