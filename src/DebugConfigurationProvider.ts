import * as vscode from 'vscode';
import { toFilePath, getTestCommand, isCreateReactAppTestCommand } from './helpers';

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private fileNameToRun = '';
  private testToRun = '';

  /**
   * Prepares injecting the name of the test, which has to be debugged, into the `DebugConfiguration`,
   * This function has to be called before `vscode.debug.startDebugging`.
   */
  public prepareTestRun(fileNameToRun: string, testToRun: string) {
    this.fileNameToRun = fileNameToRun;
    this.testToRun = testToRun;
  }

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ) {
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

  provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken
  ) {
    // default jest config according to:
    // https://github.com/Microsoft/vscode-recipes/tree/master/debugging-jest-tests#configure-launchjson-file-for-your-test-framework

    // create-react-app config according to:
    // https://facebook.github.io/create-react-app/docs/debugging-tests#debugging-tests-in-visual-studio-code

    // tslint:disable no-invalid-template-strings
    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'node',
      name: 'vscode-jest-tests',
      request: 'launch',
      args: ['--runInBand', '--watchAll=false'],
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
