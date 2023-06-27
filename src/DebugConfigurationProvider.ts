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

export const DEBUG_CONFIG_PLATFORMS = ['windows', 'linux', 'osx'];
const testNamePatternRegex = /\$\{jest.testNamePattern\}/g;
const testFileRegex = /\$\{jest.testFile\}/g;
const testFilePatternRegex = /\$\{jest.testFilePattern\}/g;
export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private fileNameToRun = '';
  private testToRun = '';
  private fromWorkspaceFolder: vscode.WorkspaceFolder | undefined;

  /**
   * Prepares injecting the name of the test, which has to be debugged, into the `DebugConfiguration`,
   * This function has to be called before `vscode.debug.startDebugging`.
   */
  public prepareTestRun(
    fileNameToRun: string,
    testToRun: string,
    workspaceFolder: vscode.WorkspaceFolder
  ): void {
    this.fileNameToRun = fileNameToRun;
    this.testToRun = testToRun;
    this.fromWorkspaceFolder = workspaceFolder;
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

    if (this.fileNameToRun) {
      if (this.testToRun) {
        args.push('--testNamePattern');
        args.push(this.testToRun);
      }
      args.push('--runTestsByPath');
      args.push(toFilePath(this.fileNameToRun));

      this.fileNameToRun = '';
      this.testToRun = '';
    }

    debugConfiguration.args = args;
    return debugConfiguration;
  }

  /**
   * resolve v2 debug config
   * @param debugConfiguration v2 debug config
   * @returns
   */
  resolveDebugConfig2(debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
    if (
      !debugConfiguration.args ||
      !Array.isArray(debugConfiguration.args) ||
      debugConfiguration.args.length <= 0
    ) {
      return debugConfiguration;
    }
    const args = debugConfiguration.args.map((arg) => {
      if (typeof arg !== 'string') {
        return arg;
      }
      return arg
        .replace(testFileRegex, toFilePath(this.fileNameToRun))
        .replace(testFilePatternRegex, escapeRegExp(this.fileNameToRun))
        .replace(testNamePatternRegex, this.testToRun);
    });
    debugConfiguration.args = args;

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
  private usePM(cmd: string, args: string[]): Partial<vscode.DebugConfiguration | undefined> {
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
   * generate a debug config incorporating commandLine and rootPath. Throw exception if error.
   * @param cmdLine
   * @param rootPath
   * @returns a debug config.
   */
  withCommandLine(
    workspace: vscode.WorkspaceFolder,
    cmdLine: string,
    rootPath?: string
  ): vscode.DebugConfiguration {
    const config = this.provideDebugConfigurations(workspace)[0];
    const [cmd, ...cmdArgs] = parseCmdLine(cmdLine);
    if (!cmd) {
      throw new Error(`invalid cmdLine: ${cmdLine}`);
    }

    const absoluteRootPath = rootPath && toAbsoluteRootPath(workspace, rootPath);

    let finalConfig: vscode.DebugConfiguration = { ...config };

    const cwd = absoluteRootPath ?? config.cwd;

    const pmConfig = this.usePM(cmd, cmdArgs);
    if (pmConfig) {
      const args = [...cmdArgs, ...pmConfig.args, ...config.args];
      finalConfig = {
        ...finalConfig,
        ...pmConfig,
        cwd,
        args,
      };
    } else {
      // convert the cmd to absolute path
      let program = path.isAbsolute(cmd)
        ? cmd
        : absoluteRootPath
        ? path.resolve(absoluteRootPath, cmd)
        : ['${workspaceFolder}', cmd].join(path.sep);
      program = this.adjustProgram(program);
      const args = [...cmdArgs, ...config.args];
      finalConfig = { ...finalConfig, cwd, program, args };
    }

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
