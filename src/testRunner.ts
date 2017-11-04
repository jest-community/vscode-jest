import { spawn } from 'child_process'
import { JestTotalResults, Options, ProjectWorkspace, Runner } from 'jest-editor-support'
import * as path from 'path'
import * as vscode from 'vscode'
import * as vscodeTestRunner from 'vscode-test-runner'
import * as babylon from 'babylon'

// these are used from within 'executeTest' but i dont want then as arguments because 'vscode-test-runner' dont know
// anything about them ...
let _configPath: string
let _debugPort: number
let _debugTrace: string
let _jestPath: string
let _jestVersion: number
let _nodePath: string
let _tsConfigPath: string
let _webpackConfigPath: string

export function initializeTestRunner(
  configPath: string,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  jestVersion: number,
  workspaceConfig: vscode.WorkspaceConfiguration
) {
  _configPath = configPath
  _jestVersion = jestVersion

  const { babylonPlugins, globPatterns, stateJsonPath } = loadConfig(workspaceConfig)

  const { commandRunTest } = vscodeTestRunner.initializeCommands(
    channel,
    _nodePath,
    _webpackConfigPath,
    _tsConfigPath,
    globPatterns,
    executeTest,
    context
  )

  const options: vscodeTestRunner.CodeLensProviderOptions = {
    testNames: ['test', 'it'],
    groupNames: ['describe', 'suite'],
    babylonPlugins,
    channel,
    commandRunTest,
    stateJsonPath: stateJsonPath,
    globPatterns: globPatterns,
  }

  const provider = new vscodeTestRunner.CodeLensProvider(options)

  const languages = [
    { language: 'javascript' },
    { language: 'javascriptreact' },
    { language: 'typescript' },
    { language: 'typescriptreact' },
  ]

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(languages, provider))
}

function loadConfig(workspaceConfig: vscode.WorkspaceConfiguration) {
  _debugPort = workspaceConfig.get<number>('testRunner.debugPort')
  _debugTrace = workspaceConfig.get<string>('testRunner.debugTrace')

  _jestPath = workspaceConfig.get<string>('testRunner.jestCli')
  if (_jestPath && !path.isAbsolute(_jestPath)) {
    _jestPath = path.resolve(vscode.workspace.rootPath, _jestPath)
  }

  _nodePath = workspaceConfig.get<string>('testRunner.nodePath')
  if (_nodePath && !path.isAbsolute(_nodePath)) {
    _nodePath = path.resolve(vscode.workspace.rootPath, _nodePath)
  }

  let stateJsonPath = workspaceConfig.get<string>('testRunner.stateJsonPath')
  if (stateJsonPath && !path.isAbsolute(stateJsonPath)) {
    stateJsonPath = path.resolve(vscode.workspace.rootPath, stateJsonPath)
  }

  _tsConfigPath = workspaceConfig.get<string>('testRunner.tsConfigPath')
  if (_tsConfigPath && !path.isAbsolute(_tsConfigPath)) {
    _tsConfigPath = path.resolve(vscode.workspace.rootPath, _tsConfigPath)
  }

  _webpackConfigPath = workspaceConfig.get<string>('testRunner.webpackConfigPath')
  if (_webpackConfigPath && !path.isAbsolute(_webpackConfigPath)) {
    _webpackConfigPath = path.resolve(vscode.workspace.rootPath, _webpackConfigPath)
  }

  return {
    babylonPlugins: workspaceConfig.get<babylon.PluginName[]>('testRunner.babylonPlugins'),
    globPatterns: workspaceConfig.get<string[]>('testRunner.globPatterns'),
    stateJsonPath,
  }
}

async function executeTest(channel: vscode.OutputChannel, fileName?: string, testNamePattern?: string, debug = false) {
  const results = await startTest(channel, fileName, testNamePattern, debug)
  if (results) {
    updateStates(results)
  }
}

async function startTest(
  channel: vscode.OutputChannel,
  fileName?: string,
  testNamePattern?: string,
  debug = false
): Promise<JestTotalResults> {
  let resolved = false
  const workspace = new ProjectWorkspace(vscode.workspace.rootPath, _jestPath, _configPath, _jestVersion)

  const testFileNamePattern = fileName ? path.basename(fileName, path.extname(fileName)) : undefined

  const options: Options = {
    createProcess: processFactory(debug),
    testFileNamePattern,
    testNamePattern,
  }

  return new Promise<JestTotalResults>((resolve, reject) => {
    const runner = new Runner(workspace, options)

    runner.on('terminalError', (data: string) => {
      reject(data)
      resolved = true
    })

    runner.on('executableJSON', (data: JestTotalResults) => {
      runner.closeProcess()
      resolve(data)
      resolved = true
    })

    runner.on('executableStdErr', (data: Buffer) => {
      channel.appendLine(data.toString())
    })

    runner.on('debuggerProcessExit', () => {
      if (!resolved) {
        reject('Runner process exits with error.')
        resolved = true
      }
    })

    runner.start(false)

    if (debug) {
      vscodeTestRunner.startDebug(_debugPort, _debugTrace, _webpackConfigPath, _tsConfigPath)
    }
  })
}

function convertStatus(status: string) {
  if (status === 'passed') {
    return 'Success'
  }

  if (status === 'failed') {
    return 'Fail'
  }

  return undefined
}

function processFactory(debug = false) {
  // Slightly modified version of createProcess method from jest-editor-support
  return (workspace: ProjectWorkspace, args: string[]) => {
    let command = _nodePath
    if (!path.isAbsolute(command)) {
      command = path.resolve(vscode.workspace.rootPath, command)
    }

    // --silent added, so possible errors would not be printed twice
    const runtimeArgs = [_jestPath, '--silent'].concat(args)

    let pos = runtimeArgs.length - 1
    // Enable debugging ...
    if (debug) {
      // --debug must be first
      runtimeArgs.unshift('--debug=' + _debugPort)
      pos++

      // --runInBand required for single jest process
      // --no-cache required in case source changes
      runtimeArgs.push('--runInBand')
    }

    // If a path to configuration file was defined, push it to runtimeArgs
    const configPath = workspace.pathToConfig
    if (configPath !== '') {
      runtimeArgs.push('--config')
      runtimeArgs.push(configPath)
    }

    if (_webpackConfigPath) {
      // if webpack is used use bundled file instead of source
      delete require.cache[require.resolve(_webpackConfigPath)]
      const webpackConfig = require(_webpackConfigPath)

      const baseName = runtimeArgs[pos]
      for (const key of Object.keys(webpackConfig.entry)) {
        if (webpackConfig.entry[key].indexOf(baseName) !== -1) {
          runtimeArgs[pos] = key
          break
        }
      }

      // fixes 'testMatch' argument
      const testMatch = path.join(webpackConfig.output.path, '**/*.js')
      const index = runtimeArgs.indexOf('--testMatch')
      if (index === -1) {
        runtimeArgs.push('--testMatch', testMatch)
      } else {
        runtimeArgs[index + 1] = testMatch
      }
    }

    // To use our own commands in create-react, we need to tell the command that
    // we're in a CI environment, or it will always append --watch
    const env = process.env
    env.CI = 'true'

    return spawn(command, runtimeArgs, { cwd: workspace.rootPath, env })
  }
}

function updateStates(results: JestTotalResults) {
  // updates vscodeTestRunner internal test states and regenerate lenses
  results.testResults.forEach(file => {
    if ((file.status as string) !== 'pending') {
      file.assertionResults.forEach(test => {
        const testStatus = convertStatus(test.status)
        if (testStatus) {
          vscodeTestRunner.setState(correnctFileName(file.name), test.fullName, testStatus, false)
        }
      })
    }
  })

  vscodeTestRunner.changeState('Running', 'Inconclusive', false)
  vscodeTestRunner.fireChangeEvent()
}

function correnctFileName(fileName: string): string {
  if (_webpackConfigPath) {
    // if webpack is used jest is running tests agains bundle file, this will resolve path to source file
    delete require.cache[require.resolve(_webpackConfigPath)]
    const webpackConfig = require(_webpackConfigPath)
    const baseName = path.basename(fileName, '.js')
    return webpackConfig.entry[baseName] || fileName
  }

  return fileName
}
