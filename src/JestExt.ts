import * as vscode from 'vscode'
import * as path from 'path'
import { Settings, ProjectWorkspace, JestTotalResults } from 'jest-editor-support'
import { matcher } from 'micromatch'

import * as decorations from './decorations'
import { IPluginSettings } from './Settings'
import * as status from './statusBar'
import {
  TestReconciliationState,
  TestResultProvider,
  TestResult,
  resultsWithLowerCaseWindowsDriveLetters,
} from './TestResults'
import { pathToJest, pathToConfig } from './helpers'
import { CoverageMapProvider } from './Coverage'
import { updateDiagnostics, resetDiagnostics, failedSuiteCount } from './diagnostics'
import { DebugCodeLensProvider } from './DebugCodeLens'
import { DebugConfigurationProvider } from './DebugConfigurationProvider'
import { DecorationOptions } from './types'
import { hasDocument, isOpenInMultipleEditors } from './editor'
import { CoverageOverlay } from './Coverage/CoverageOverlay'
import { JestProcess, JestProcessManager } from './JestProcessManagement'
import { isWatchNotSupported, WatchMode } from './Jest'
import * as messaging from './messaging'

export class JestExt {
  private workspace: ProjectWorkspace
  private jestSettings: Settings
  private pluginSettings: IPluginSettings

  coverageMapProvider: CoverageMapProvider
  coverageOverlay: CoverageOverlay

  testResultProvider: TestResultProvider
  public debugCodeLensProvider: DebugCodeLensProvider
  debugConfigurationProvider: DebugConfigurationProvider

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

  private jestProcessManager: JestProcessManager
  private jestProcess: JestProcess

  private clearOnNextInput: boolean

  constructor(
    context: vscode.ExtensionContext,
    workspace: ProjectWorkspace,
    outputChannel: vscode.OutputChannel,
    pluginSettings: IPluginSettings
  ) {
    this.workspace = workspace
    this.channel = outputChannel
    this.failingAssertionDecorators = {}
    this.failDiagnostics = vscode.languages.createDiagnosticCollection('Jest')
    this.clearOnNextInput = true
    this.jestSettings = new Settings(workspace)
    this.pluginSettings = pluginSettings

    this.coverageMapProvider = new CoverageMapProvider()
    this.coverageOverlay = new CoverageOverlay(
      context,
      this.coverageMapProvider,
      pluginSettings.showCoverageOnLoad,
      pluginSettings.coverageFormatter
    )

    this.testResultProvider = new TestResultProvider()
    this.debugCodeLensProvider = new DebugCodeLensProvider(
      this.testResultProvider,
      pluginSettings.debugCodeLens.enabled ? pluginSettings.debugCodeLens.showWhenTestStateIn : []
    )
    this.debugConfigurationProvider = new DebugConfigurationProvider()

    this.jestProcessManager = new JestProcessManager({
      projectWorkspace: workspace,
      runAllTestsFirstInWatchMode: this.pluginSettings.runAllTestsFirst,
    })

    this.getSettings()
    // The theme stuff
    this.setupDecorators()
    // The bottom bar thing
    this.setupStatusBar()
    //reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics)

    // If we should start the process by default, do so
    if (this.pluginSettings.autoEnable) {
      this.startProcess()
    } else {
      this.channel.appendLine('Skipping initial Jest runner process start.')
    }
  }

  private handleStdErr(error: Buffer) {
    const message = error.toString()

    if (this.shouldIgnoreOutput(message)) {
      return
    }

    if (isWatchNotSupported(message)) {
      this.jestProcess.watchMode = WatchMode.WatchAll
    }

    // The "tests are done" message comes through stdErr
    // We want to use this as a marker that the console should
    // be cleared, as the next input will be from a new test run.
    if (this.clearOnNextInput) {
      this.clearOnNextInput = false
      this.parsingTestFile = false
      this.channel.clear()
    }
    // thanks Qix, http://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
    const noANSI = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    if (noANSI.includes('snapshot test failed')) {
      this.detectedSnapshotErrors()
    }

    this.channel.appendLine(noANSI)
  }

  private assignHandlers(jestProcess: JestProcess) {
    jestProcess
      .onJestEditorSupportEvent('executableJSON', (data: JestTotalResults) => {
        this.updateWithData(data)
      })
      .onJestEditorSupportEvent('executableOutput', (output: string) => {
        if (!this.shouldIgnoreOutput(output)) {
          this.channel.appendLine(output)
        }
      })
      .onJestEditorSupportEvent('executableStdErr', (error: Buffer) => this.handleStdErr(error))
      .onJestEditorSupportEvent('nonTerminalError', (error: string) => {
        this.channel.appendLine(`Received an error from Jest Runner: ${error.toString()}`)
        this.channel.show(true)
      })
      .onJestEditorSupportEvent('exception', result => {
        this.channel.appendLine(`\nException raised: [${result.type}]: ${result.message}\n`)
        this.channel.show(true)
      })
      .onJestEditorSupportEvent('terminalError', (error: string) => {
        this.channel.appendLine('\nException raised: ' + error)
        this.channel.show(true)
      })
  }

  public startProcess() {
    if (this.jestProcessManager.numberOfProcesses > 0) {
      return
    }

    if (this.pluginSettings.runAllTestsFirst) {
      this.testsHaveStartedRunning()
    }

    this.jestProcess = this.jestProcessManager.startJestProcess({
      watchMode: WatchMode.Watch,
      keepAlive: true,
      exitCallback: (jestProcess, jestProcessInWatchMode) => {
        if (jestProcessInWatchMode) {
          this.jestProcess = jestProcessInWatchMode

          this.channel.appendLine('Finished running all tests. Starting watch mode.')
          status.running('Starting watch mode')

          this.assignHandlers(this.jestProcess)
        } else {
          status.stopped()
          if (!jestProcess.stopRequested) {
            const msg = `Starting Jest in Watch mode failed too many times and has been stopped.`
            this.channel.appendLine(`${msg}\n see troubleshooting: ${messaging.TroubleShootingURL}`)
            this.channel.show(true)
            messaging.systemErrorMessage(msg, messaging.showTroubleshootingAction)
          }
        }
      },
    })

    this.assignHandlers(this.jestProcess)
  }

  public stopProcess() {
    this.channel.appendLine('Closing Jest')
    this.jestProcessManager.stopAll()
    status.stopped()
  }

  private validateJestSettings(showSettingPrefix?: string): boolean {
    let isValid = true

    // check if setting is a default: jestVersionMajor == null
    if (!this.jestSettings.jestVersionMajor) {
      messaging.systemWarningMessage(
        'Failed to retrieve jest config, will fallback to default config that might not be compatible with your env.',
        messaging.showTroubleshootingAction
      )
      isValid = false
    } else if (this.jestSettings.jestVersionMajor < 20) {
      // version is just a hint, we don't really use this specifically.
      // the main settings we care is the testMatch or testRegex, which is used to
      // detect if a given file is a jest test suite.
      messaging.systemWarningMessage(
        `Found jest version '${this.jestSettings
          .jestVersionMajor}'. This extension relies on Jest 20+ features, some features may not work correctly.`
      )
    }

    // check if we can detect jest test patterns
    if (
      !this.jestSettings.settings ||
      ((!this.jestSettings.settings.testMatch || !this.jestSettings.settings.testMatch.length) &&
        !this.jestSettings.settings.testRegex)
    ) {
      isValid = false
      console.error(`invalid settings: ${JSON.stringify(this.jestSettings.settings)}`)

      messaging.systemErrorMessage(
        'Invalid jest config, the plugin might not be able to function properly.',
        messaging.showTroubleshootingAction
      )
    }

    // display settings in debug mode
    if (this.workspace.debug && showSettingPrefix) {
      console.log(`${showSettingPrefix}:
                jestVersionMajor=${this.jestSettings.jestVersionMajor}
                testMatch=${this.jestSettings.settings.testMatch} 
                testRegex=${this.jestSettings.settings.testRegex} 
              `)
    }

    return isValid
  }

  private getSettings() {
    try {
      this.jestSettings.getConfig(() => {
        if (this.validateJestSettings('Jest Config Retrieved')) {
          this.workspace.localJestMajorVersion = this.jestSettings.jestVersionMajor
        }
      })
    } catch (error) {
      console.error('jestSettings.getConfig() failed:', error)
      // most likely validating the default setting, which will trigger a warning
      // that should be fine as this is an error condition that could impact the plugin functionality
      this.validateJestSettings('Jest Config Retrieval Failed')
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
              this.jestProcessManager.stopJestProcess(this.jestProcess).then(() => {
                this.startProcess()
              })
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
    this.pluginSettings = updatedSettings

    this.workspace.rootPath = updatedSettings.rootPath
    this.workspace.pathToJest = pathToJest(updatedSettings)
    this.workspace.pathToConfig = pathToConfig(updatedSettings)
    this.workspace.debug = updatedSettings.debugMode

    this.jestSettings = new Settings(this.workspace)
    this.getSettings()

    this.coverageOverlay.enabled = updatedSettings.showCoverageOnLoad

    this.debugCodeLensProvider.showWhenTestStateIn = updatedSettings.debugCodeLens.enabled
      ? updatedSettings.debugCodeLens.showWhenTestStateIn
      : []

    this.stopProcess()

    setTimeout(() => {
      this.startProcess()
    }, 500)
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
    const globs = this.jestSettings.settings.testMatch

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
    status.initial()
  }

  private setupDecorators() {
    this.passingItStyle = decorations.passingItName()
    this.failingItStyle = decorations.failingItName()
    this.skipItStyle = decorations.skipItName()
    this.unknownItStyle = decorations.notRanItName()
  }

  private shouldIgnoreOutput(text: string): boolean {
    // this fails when snapshots change - to be revised - returning always false for now
    return text.includes('Watch Usage')
  }

  private testsHaveStartedRunning() {
    this.channel.clear()
    status.running('initial full test run')
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
    this.jestProcessManager.stopAll()
  }

  public runTest = async (fileName: string, identifier: string) => {
    const restart = this.jestProcessManager.numberOfProcesses > 0
    this.jestProcessManager.stopAll()

    this.debugConfigurationProvider.prepareTestRun(fileName, identifier)

    const handle = vscode.debug.onDidTerminateDebugSession(_ => {
      handle.dispose()
      if (restart) {
        this.startProcess()
      }
    })

    const workspaceFolder = vscode.workspace.workspaceFolders[0]
    try {
      // try to run the debug configuration from launch.json
      await vscode.debug.startDebugging(workspaceFolder, 'vscode-jest-tests')
    } catch {
      // if that fails, there (probably) isn't any debug configuration (at least no correctly named one)
      // therefore debug the test using the default configuration
      const debugConfiguration = this.debugConfigurationProvider.provideDebugConfigurations(workspaceFolder)[0]
      await vscode.debug.startDebugging(workspaceFolder, debugConfiguration)
    }
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
