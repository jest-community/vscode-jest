import * as vscode from 'vscode';
import { toFilePath, getTestCommand, isCreateReactAppTestCommand, escapeRegExp } from './helpers';

const testNamePatternRegex = /\$\{jest.testNamePattern\}/g;
const testFileRegex = /\$\{jest.testFile\}/g;
const testFilePatternRegex = /\$\{jest.testFilePattern\}/g;
export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private fileNameToRun = '';
  private testToRun = '';

  /**
   * Prepares injecting the name of the test, which has to be debugged, into the `DebugConfiguration`,
   * This function has to be called before `vscode.debug.startDebugging`.
   */
  public prepareTestRun(fileNameToRun: string, testToRun: string): void {
    this.fileNameToRun = fileNameToRun;
    this.testToRun = testToRun;
  }

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.DebugConfiguration {
    if (debugConfiguration.name === 'vscode-jest-tests.v2') {
      return this.resolveDebugConfig2(debugConfiguration);
    }
    if (debugConfiguration.name !== 'vscode-jest-tests') {
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
        args.push('--test-name-pattern');
        args.push(this.testToRun);
      }
      args.push('--run-tests-by-path');
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
      switch (true) {
        case testFileRegex.test(arg): {
          return arg.replace(testFileRegex, toFilePath(this.fileNameToRun));
        }
        case testFilePatternRegex.test(arg): {
          return arg.replace(testFilePatternRegex, escapeRegExp(this.fileNameToRun));
        }
        case testNamePatternRegex.test(arg): {
          return arg.replace(testNamePatternRegex, this.testToRun);
        }

        default:
          return arg;
      }
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

    // tslint:disable no-invalid-template-strings
    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'node',
      name: 'vscode-jest-tests.v2',
      request: 'launch',
      args: [
        '--run-in-band',
        '--watch-all=false',
        '--test-name-pattern',
        '${jest.testNamePattern}',
        '--run-tests-by-path',
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
}
