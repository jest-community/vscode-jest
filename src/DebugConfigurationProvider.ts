import * as vscode from 'vscode'
import { join } from 'path'
import { readFileSync } from 'fs'

function tryGetCRACommand(rootPath: string): string {
  // Known binary names of `react-scripts` forks:
  const packageBinaryNames = ['react-scripts', 'react-native-scripts', 'react-scripts-ts', 'react-app-rewired']
  // If possible, try to parse `package.json` and look for a known binary beeing called in `scripts.test`
  try {
    const packagePath = join(rootPath, 'package.json')
    const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (!packageJSON || !packageJSON.scripts || !packageJSON.scripts.test) {
      return ''
    }
    const testCommand = packageJSON.scripts.test as string
    if (packageBinaryNames.some(binary => testCommand.indexOf(binary + ' test') === 0)) {
      return testCommand
    }
  } catch {}
  return ''
}

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private fileNameToRun: string = ''
  private testToRun: string = ''

  public prepareTestRun(fileNameToRun: string, testToRun: string) {
    this.fileNameToRun = fileNameToRun
    this.testToRun = testToRun
  }

  provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken) {
    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'vscode-jest-tests',
      name: 'vscode-jest-tests',
      request: 'launch',
      args: ['--runInBand'],
      cwd: '${workspaceRoot}',
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
    }
    const craCommand = tryGetCRACommand(folder.uri.fsPath).split(' ')
    if (craCommand.length > 1 || craCommand[0]) {
      debugConfiguration.runtimeExecutable = '${workspaceRoot}/node_modules/.bin/' + craCommand.shift()
      debugConfiguration.args = [...craCommand, ...debugConfiguration.args]
      debugConfiguration.protocol = 'inspector'
    } else {
      debugConfiguration.program = '${workspaceFolder}/node_modules/jest/bin/jest'
    }
    return [debugConfiguration]
  }

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ) {
    debugConfiguration.type = 'node'
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
}
