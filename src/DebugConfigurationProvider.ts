import * as vscode from 'vscode'
import { getTestCommand, isCRATestCommand } from './helpers'

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private fileNameToRun: string = ''
  private testToRun: string = ''

  /**
   * Prepares injecting the name of the test, which has to be debugged, into the `DebugConfiguration`,
   * This function has to be called before `vscode.debug.startDebugging`.
   */
  public prepareTestRun(fileNameToRun: string, testToRun: string) {
    this.fileNameToRun = fileNameToRun
    this.testToRun = testToRun
  }

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ) {
    if (debugConfiguration.name !== 'vscode-jest-tests') {
      return debugConfiguration
    }

    if (!debugConfiguration.env) {
      debugConfiguration.env = {}
    }
    // necessary for running CRA test scripts in non-watch mode
    debugConfiguration.env.CI = 'vscode-jest-tests'

    if (this.fileNameToRun) {
      debugConfiguration.args.push(this.fileNameToRun)
      if (this.testToRun) {
        debugConfiguration.args.push('--testNamePattern')
        debugConfiguration.args.push(this.testToRun)
      }
      this.fileNameToRun = ''
      this.testToRun = ''
    }

    return debugConfiguration
  }

  provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, _token?: vscode.CancellationToken) {
    // default jest config according to:
    // https://github.com/Microsoft/vscode-recipes/tree/master/debugging-jest-tests#configure-launchjson-file-for-your-test-framework

    // create-react-app config according to:
    // https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#debugging-tests-in-visual-studio-code

    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'node',
      name: 'vscode-jest-tests',
      request: 'launch',
      args: ['--runInBand'],
      cwd: '${workspaceFolder}',
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
    }

    const testCommand = folder && getTestCommand(folder.uri.fsPath)
    if (isCRATestCommand(testCommand)) {
      const craCommand = testCommand.split(' ')
      // Settings specific for projects bootstrapped with `create-react-app`
      debugConfiguration.runtimeExecutable = '${workspaceFolder}/node_modules/.bin/' + craCommand.shift()
      debugConfiguration.args = [...craCommand, ...debugConfiguration.args]
      debugConfiguration.protocol = 'inspector'
    } else if (testCommand === 'node scripts/test.js --env=jsdom') {
      // Settings specific for projects bootstrapped with `create-react-app` after being ejected
      const craCommand = testCommand.split(' ')
      craCommand.shift()
      debugConfiguration.program = '${workspaceFolder}/' + craCommand.shift()
      debugConfiguration.args = [...craCommand, ...debugConfiguration.args]
      debugConfiguration.protocol = 'inspector'
    } else {
      // Plain jest setup
      debugConfiguration.program = '${workspaceFolder}/node_modules/jest/bin/jest'
    }

    return [debugConfiguration]
  }
}
