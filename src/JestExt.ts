import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Runner, Settings, ProjectWorkspace, JestTotalResults } from 'jest-editor-support'
import { matcher } from 'micromatch'

import * as decorations from './decorations'
import { IPluginSettings } from './IPluginSettings'
import * as status from './statusBar'
import {
  TestReconciliationState,
  TestResultProvider,
  TestResult,
  resultsWithLowerCaseWindowsDriveLetters,
} from './TestResults'
import { pathToJestPackageJSON } from './helpers'
import { readFileSync } from 'fs'
import { CoverageMapProvider } from './Coverage'
import { updateDiagnostics, resetDiagnostics, failedSuiteCount } from './diagnostics'
import { DebugCodeLensProvider } from './DebugCodeLens'
import { DecorationOptions } from './types'
import { hasDocument, isOpenInMultipleEditors } from './editor'
import { CoverageOverlay } from './Coverage/CoverageOverlay'
import { setTimeout } from 'timers'

export class JestExt {
  private workspace: ProjectWorkspace
  private jestProcess: Runner
  private jestSettings: Settings
  private pluginSettings: IPluginSettings

  coverageMapProvider: CoverageMapProvider
  coverageOverlay: CoverageOverlay

  testResultProvider: TestResultProvider
  public debugCodeLensProvider: DebugCodeLensProvider

  // So you can read what's going on
  private channel: vscode.OutputChannel

  // The ability to show fails in the problems section
  private failDiagnostics: vscode.DiagnosticCollection

  private passingItStyle: vscode.TextEditorDecorationType
  private failingItStyle: vscode.TextEditorDecorationType
  private skipItStyle: vscode.TextEditorDecorationType
  private unknownItStyle: vscode.TextEditorDecorationType

  private parsingTestFile = false

  // We have to keep track of our inline assert fails to remove later
  failingAssertionDecorators: { [fileName: string]: vscode.TextEditorDecorationType[] }

  private clearOnNextInput: boolean
  private forcedClose = {}
  private jestProcessId = 0

  constructor(workspace: ProjectWorkspace, outputChannel: vscode.OutputChannel, pluginSettings: IPluginSettings) {
    this.workspace = workspace
    this.channel = outputChannel
    this.failingAssertionDecorators = {}
    this.failDiagnostics = vscode.languages.createDiagnosticCollection('Jest')
    this.clearOnNextInput = true
    this.jestSettings = new Settings(workspace)
    this.pluginSettings = pluginSettings

    this.coverageMapProvider = new CoverageMapProvider()
    this.coverageOverlay = new CoverageOverlay(this.coverageMapProvider, pluginSettings.showCoverageOnLoad)

    this.testResultProvider = new TestResultProvider()
    this.debugCodeLensProvider = new DebugCodeLensProvider(this.testResultProvider, pluginSettings.enableCodeLens)

    this.getSettings()
  }

  public startProcess(watchMode?: boolean) {
    // The Runner is an event emitter that handles taking the Jest
    // output and converting it into different types of data that
    // we can handle here differently.
    if (this.jestProcess) {
      return
    }

    this.jestProcess = new Runner(this.workspace)

    this.jestProcessId = this.jestProcessId + 1
    const jestProcessId = this.jestProcessId.toString()
    this.forcedClose[jestProcessId] = false
    let maxRestart = 6

    this.jestProcess
      .on('debuggerProcessExit', () => {
        if (this.forcedClose[jestProcessId]) {
          // only clean up the jest process if no more
          // recent jest process is running
          if (this.jestProcessId.toString() === jestProcessId) {
            delete this.jestProcess
          }
          return
        }

        this.channel.appendLine('Closed Jest')

        if (maxRestart-- <= 0) {
          console.warn('jest has been restarted too many times, please check your system')
          status.stopped('(too many restarts)')
          return
        }
        this.forcedClose[jestProcessId] = true
        // only clean up the jest process if no more
        // recent jest process is running
        if (this.jestProcessId.toString() === jestProcessId) {
          delete this.jestProcess
        }

        setTimeout(() => {
          this.startProcess(true)
        }, 0)
      })
      .on('executableJSON', (data: JestTotalResults) => {
        this.updateWithData(data)
      })
      .on('executableOutput', (output: string) => {
        if (!this.shouldIgnoreOutput(output)) {
          this.channel.appendLine(output)
        }
      })
      .on('executableStdErr', (error: Buffer) => {
        const message = error.toString()

        if (this.shouldIgnoreOutput(message)) {
          return
        }

        // The "tests are done" message comes through stdErr
        // We want to use this as a marker that the console should
        // be cleared, as the next input will be from a new test run.
        if (this.clearOnNextInput) {
          this.clearOnNextInput = false
          this.parsingTestFile = false
          this.testsHaveStartedRunning()
        }
        // thanks Qix, http://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
        const noANSI = message.replace(
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          ''
        )
        if (noANSI.includes('snapshot test failed')) {
          this.detectedSnapshotErrors()
        }

        this.channel.appendLine(noANSI)
      })
      .on('nonTerminalError', (error: string) => {
        this.channel.appendLine(`Received an error from Jest Runner: ${error.toString()}`)
      })
      .on('exception', result => {
        this.channel.appendLine(`\nException raised: [${result.type}]: ${result.message}\n`)
      })
      .on('terminalError', (error: string) => {
        this.channel.appendLine('\nException raised: ' + error)
      })

    // The theme stuff
    this.setupDecorators()
    // The bottom bar thing
    this.setupStatusBar()
    //reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics)

    // Go!
    if (this.pluginSettings.runAllTestsFirst && !watchMode) {
      this.jestProcess.start(false)
    } else {
      this.startWatchMode()
    }
  }

  public stopProcess() {
    this.channel.appendLine('Closing Jest')
    this.closeJest()
    delete this.jestProcess
    status.stopped()
  }

  private closeJest() {
    if (!this.jestProcess) {
      return
    }
    this.forcedClose[this.jestProcessId.toString()] = true
    this.jestProcess.closeProcess()
  }

  private startWatchMode() {
    const msg = this.jestProcess.watchMode ? 'Jest exited unexpectedly, restarting watch mode' : 'Starting watch mode'
    this.channel.appendLine(msg)
    this.jestProcess.start(true)
    status.running(msg)
  }

  private getSettings() {
    this.getJestVersion(jestVersionMajor => {
      if (jestVersionMajor < 20) {
        vscode.window.showErrorMessage(
          'This extension relies on Jest 20+ features, it will continue to work, but some features may not work correctly.'
        )
      }
      this.workspace.localJestMajorVersion = jestVersionMajor

      // If we should start the process by default, do so
      if (this.pluginSettings.autoEnable) {
        this.startProcess()
      } else {
        this.channel.appendLine('Skipping initial Jest runner process start.')
      }
    })

    // Do nothing for the minute, the above ^ can come back once
    // https://github.com/facebook/jest/pull/3592 is deployed
    try {
      this.jestSettings.getConfig(() => {})
    } catch (error) {
      console.log('[vscode-jest] Getting Jest config crashed, likely due to Jest version being below version 20.')
    }
  }

  private detectedSnapshotErrors() {
    if (!this.pluginSettings.enableSnapshotUpdateMessages) {
      return
    }
    vscode.window
      .showInformationMessage('Would you like to update your Snapshots?', { title: 'Replace them' })
      .then(response => {
        // No response == cancel
        if (response) {
          this.jestProcess.runJestWithUpdateForSnapshots(() => {
            if (this.pluginSettings.restartJestOnSnapshotUpdate) {
              this.stopProcess()
              this.startProcess()
              vscode.window.showInformationMessage('Updated Snapshots and restarted Jest.')
            } else {
              vscode.window.showInformationMessage('Updated Snapshots. It will show in your next test run.')
            }
          })
        }
      })
  }

  public triggerUpdateDecorations(editor: vscode.TextEditor) {
    this.coverageOverlay.updateVisibleEditors()

    if (!this.canUpdateDecorators(editor)) {
      return
    }

    // OK - lets go
    this.parsingTestFile = true
    this.updateDotDecorators(editor)
    this.parsingTestFile = false
  }

  public triggerUpdateSettings(updatedSettings: IPluginSettings) {
    this.debugCodeLensProvider.enabled = updatedSettings.enableCodeLens
  }

  private updateDotDecorators(editor: vscode.TextEditor) {
    const filePath = editor.document.fileName
    const testResults = this.testResultProvider.getSortedResults(filePath)

    // Dots
    const styleMap = [
      { data: testResults.success, decorationType: this.passingItStyle, state: TestReconciliationState.KnownSuccess },
      { data: testResults.fail, decorationType: this.failingItStyle, state: TestReconciliationState.KnownFail },
      { data: testResults.skip, decorationType: this.skipItStyle, state: TestReconciliationState.KnownSkip },
      { data: testResults.unknown, decorationType: this.unknownItStyle, state: TestReconciliationState.Unknown },
    ]

    styleMap.forEach(style => {
      const decorators = this.generateDotsForItBlocks(style.data, style.state)
      editor.setDecorations(style.decorationType, decorators)
    })

    // Debug CodeLens
    this.debugCodeLensProvider.didChange()

    // Inline error messages
    this.resetInlineErrorDecorators(editor)
    if (this.pluginSettings.enableInlineErrorMessages) {
      const fileName = editor.document.fileName
      testResults.fail.forEach(a => {
        const { style, decorator } = this.generateInlineErrorDecorator(fileName, a)
        editor.setDecorations(style, [decorator])
      })
    }
  }

  private resetInlineErrorDecorators(editor: vscode.TextEditor) {
    if (!this.failingAssertionDecorators[editor.document.fileName]) {
      this.failingAssertionDecorators[editor.document.fileName] = []
      return
    }

    if (isOpenInMultipleEditors(editor.document)) {
      return
    }

    this.failingAssertionDecorators[editor.document.fileName].forEach(element => {
      element.dispose()
    })
    this.failingAssertionDecorators[editor.document.fileName] = []
  }

  private generateInlineErrorDecorator(fileName: string, test: TestResult) {
    const errorMessage = test.terseMessage || test.shortMessage
    const decorator = {
      range: new vscode.Range(test.lineNumberOfError, 0, test.lineNumberOfError, 0),
      hoverMessage: errorMessage,
    }

    // We have to make a new style for each unique message, this is
    // why we have to remove off of them beforehand
    const style = decorations.failingAssertionStyle(errorMessage)
    this.failingAssertionDecorators[fileName].push(style)

    return { style, decorator }
  }

  canUpdateDecorators(editor: vscode.TextEditor) {
    const atEmptyScreen = !editor
    if (atEmptyScreen) {
      return false
    }

    const inSettings = !editor.document
    if (inSettings) {
      return false
    }

    if (this.parsingTestFile) {
      return false
    }

    const isATestFile = this.wouldJestRunURI(editor.document.uri)
    return isATestFile
  }

  private wouldJestRunURI(uri: vscode.Uri) {
    const filePath = uri.fsPath

    const globs: string[] = (this.jestSettings.settings as any).testMatch
    if (globs && globs.length) {
      const matchers = globs.map(each => matcher(each, { dot: true }))
      const matched = matchers.some(isMatch => isMatch(filePath))
      return matched
    }

    const root = this.pluginSettings.rootPath
    let relative = path.normalize(path.relative(root, filePath))
    // replace windows path separator with normal slash
    if (path.sep === '\\') {
      relative = relative.replace(/\\/g, '/')
    }
    const testRegex = new RegExp(this.jestSettings.settings.testRegex)
    const matches = relative.match(testRegex)
    return matches && matches.length > 0
  }

  private setupStatusBar() {
    if (this.pluginSettings.autoEnable) {
      this.testsHaveStartedRunning()
    } else {
      status.initial()
    }
  }

  private setupDecorators() {
    this.passingItStyle = decorations.passingItName()
    this.failingItStyle = decorations.failingItName()
    this.skipItStyle = decorations.skipItName()
    this.unknownItStyle = decorations.notRanItName()
  }

  private shouldIgnoreOutput(text: string): boolean {
    return text.includes('Watch Usage')
  }

  private testsHaveStartedRunning() {
    this.channel.clear()
    const details = this.jestProcess && this.jestProcess.watchMode ? 'testing changes' : 'initial full test run'
    status.running(details)
  }

  private updateWithData(data: JestTotalResults) {
    const normalizedData = resultsWithLowerCaseWindowsDriveLetters(data)
    this.coverageMapProvider.update(normalizedData.coverageMap)

    const statusList = this.testResultProvider.updateTestResults(normalizedData)
    updateDiagnostics(statusList, this.failDiagnostics)

    const failedFileCount = failedSuiteCount(this.failDiagnostics)
    if (failedFileCount <= 0 && normalizedData.success) {
      status.success()
    } else {
      status.failed(` (${failedFileCount} test suite${failedFileCount > 1 ? 's' : ''} failed)`)
    }

    for (const editor of vscode.window.visibleTextEditors) {
      this.triggerUpdateDecorations(editor)
    }
    this.clearOnNextInput = true
  }

  private generateDotsForItBlocks(blocks: TestResult[], state: TestReconciliationState): DecorationOptions[] {
    const nameForState = {
      [TestReconciliationState.KnownSuccess]: 'Passed',
      [TestReconciliationState.KnownFail]: 'Failed',
      [TestReconciliationState.KnownSkip]: 'Skipped',
      [TestReconciliationState.Unknown]: 'Test has not run yet, due to Jest only running tests related to changes.',
    }

    return blocks.map(it => {
      return {
        range: new vscode.Range(it.start.line, it.start.column, it.start.line, it.start.column + 1),
        hoverMessage: nameForState[state],

        /* ERROR: this needs to include all ancestor describe block names as well!
          in code bellow it block has identifier = 'aaa bbb ccc': but name is only 'ccc'

          describe('aaa', () => {
            describe('bbb', () => {
              it('ccc', () => {
              });
            });
          });
        */
        identifier: it.name,
      }
    })
  }

  public deactivate() {
    this.jestProcess.closeProcess()
  }

  private getJestVersion(version: (v: number) => void) {
    let ver = 18 // default to the last pre-20 release if nothing else can be determined
    const packageJSON = pathToJestPackageJSON(this.pluginSettings)

    if (packageJSON) {
      const contents = readFileSync(packageJSON, 'utf8')
      const packageMetadata = JSON.parse(contents)

      if (packageMetadata['version']) {
        ver = parseInt(packageMetadata['version'])
      }
    }

    version(ver)
  }

  /**
   * Primitive way to resolve path to jest.js
   */
  private resolvePathToJestBin() {
    let jest = this.workspace.pathToJest
    if (!path.isAbsolute(jest)) {
      jest = path.join(vscode.workspace.rootPath, jest)
    }

    const basename = path.basename(jest)
    switch (basename) {
      case 'jest.js': {
        return jest
      }

      case 'jest.cmd': {
        /* i need to extract '..\jest-cli\bin\jest.js' from line 2

        @IF EXIST "%~dp0\node.exe" (
          "%~dp0\node.exe"  "%~dp0\..\jest-cli\bin\jest.js" %*
        ) ELSE (
          @SETLOCAL
          @SET PATHEXT=%PATHEXT:;.JS;=;%
          node  "%~dp0\..\jest-cli\bin\jest.js" %*
        )
        */
        const line = fs.readFileSync(jest, 'utf8').split('\n')[1]
        const match = /^\s*"[^"]+"\s+"%~dp0\\([^"]+)"/.exec(line)
        return path.join(path.dirname(jest), match[1])
      }

      case 'jest': {
        /* file without extension uses first line as file type
           in case of node script i can use this file directly,
           in case of linux shell script i need to extract path from line 9
        #!/bin/sh
        basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

        case `uname` in
            *CYGWIN*) basedir=`cygpath -w "$basedir"`;;
        esac

        if [ -x "$basedir/node" ]; then
          "$basedir/node"  "$basedir/../jest-cli/bin/jest.js" "$@"
          ret=$?
        else
          node  "$basedir/../jest-cli/bin/jest.js" "$@"
          ret=$?
        fi
        exit $ret
        */
        const lines = fs.readFileSync(jest, 'utf8').split('\n')
        switch (lines[0]) {
          case '#!/usr/bin/env node': {
            return jest
          }

          case '#!/bin/sh': {
            const line = lines[8]
            const match = /^\s*"[^"]+"\s+"$basedir\/([^"]+)"/.exec(line)
            if (match) {
              return path.join(path.dirname(jest), match[1])
            }

            break
          }
        }

        break
      }
    }

    vscode.window.showErrorMessage('Cannot find jest.js file!')
    return undefined
  }

  public runTest = (fileName: string, identifier: string) => {
    const restart = this.jestProcess !== undefined
    this.closeJest()
    const program = this.resolvePathToJestBin()
    if (!program) {
      console.log("Could not find Jest's CLI path")
      return
    }

    const args = ['--runInBand', fileName, '--testNamePattern', identifier]
    if (this.pluginSettings.pathToConfig.length) {
      args.push('--config', this.pluginSettings.pathToConfig)
    }

    const port = Math.floor(Math.random() * 20000) + 10000
    const configuration = {
      name: 'TestRunner',
      type: 'node',
      request: 'launch',
      program,
      args,
      runtimeArgs: ['--inspect-brk=' + port],
      port,
      protocol: 'inspector',
      console: 'integratedTerminal',
      smartStep: true,
      sourceMaps: true,
    }

    const handle = vscode.debug.onDidTerminateDebugSession(_ => {
      handle.dispose()
      if (restart) {
        this.startProcess()
      }
    })

    vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], configuration)
  }

  onDidCloseTextDocument(document: vscode.TextDocument) {
    this.removeCachedTestResults(document)
    this.removeCachedDecorationTypes(document)
  }

  removeCachedTestResults(document: vscode.TextDocument) {
    if (!document || document.isUntitled) {
      return
    }

    const filePath = document.fileName
    this.testResultProvider.removeCachedResults(filePath)
  }

  removeCachedDecorationTypes(document: vscode.TextDocument) {
    if (!document || !document.fileName) {
      return
    }

    delete this.failingAssertionDecorators[document.fileName]
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    if (!hasDocument(editor)) {
      return
    }

    this.triggerUpdateDecorations(editor)
  }

  /**
   * This event is fired with the document not dirty when:
   * - before the onDidSaveTextDocument event
   * - the document was changed by an external editor
   */
  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (event.document.isDirty) {
      return
    }
    if (event.document.uri.scheme === 'git') {
      return
    }

    // Ignore a clean file with a change:
    if (event.contentChanges.length > 0) {
      return
    }

    this.removeCachedTestResults(event.document)

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === event.document) {
        this.triggerUpdateDecorations(editor)
      }
    }
  }

  toggleCoverageOverlay() {
    this.coverageOverlay.toggleVisibility()
  }
}
