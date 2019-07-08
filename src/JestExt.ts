import * as vscode from 'vscode'
import { ProjectWorkspace, JestTotalResults } from 'jest-editor-support'

import * as decorations from './decorations'
import { IPluginResourceSettings } from './Settings'
import { statusBar, StatusBar } from './StatusBar'
import {
  TestReconciliationState,
  TestResultProvider,
  TestResult,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
} from './TestResults'
import { pathToJest, pathToConfig } from './helpers'
import { CoverageMapProvider } from './Coverage'
import { updateDiagnostics, updateCurrentDiagnostics, resetDiagnostics, failedSuiteCount } from './diagnostics'
import { DebugCodeLensProvider } from './DebugCodeLens'
import { DebugConfigurationProvider } from './DebugConfigurationProvider'
import { DecorationOptions } from './types'
import { isOpenInMultipleEditors } from './editor'
import { CoverageOverlay } from './Coverage/CoverageOverlay'
import { JestProcess, JestProcessManager } from './JestProcessManagement'
import { isWatchNotSupported, WatchMode } from './Jest'
import * as messaging from './messaging'

interface InstanceSettings {
  multirootEnv: boolean
}

export class JestExt {
  coverageMapProvider: CoverageMapProvider
  coverageOverlay: CoverageOverlay

  testResultProvider: TestResultProvider
  debugCodeLensProvider: DebugCodeLensProvider
  debugConfigurationProvider: DebugConfigurationProvider

  // So you can read what's going on
  channel: vscode.OutputChannel

  failingAssertionDecorators: { [fileName: string]: vscode.TextEditorDecorationType[] }

  private jestWorkspace: ProjectWorkspace
  private pluginSettings: IPluginResourceSettings
  private workspaceFolder: vscode.WorkspaceFolder
  private instanceSettings: InstanceSettings

  // The ability to show fails in the problems section
  private failDiagnostics: vscode.DiagnosticCollection

  private passingItStyle: vscode.TextEditorDecorationType
  private failingItStyle: vscode.TextEditorDecorationType
  private skipItStyle: vscode.TextEditorDecorationType
  private unknownItStyle: vscode.TextEditorDecorationType

  private parsingTestFile = false

  // We have to keep track of our inline assert fails to remove later

  private jestProcessManager: JestProcessManager
  private jestProcess: JestProcess

  private clearOnNextInput: boolean
  private status: ReturnType<StatusBar['bind']>

  constructor(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    jestWorkspace: ProjectWorkspace,
    outputChannel: vscode.OutputChannel,
    pluginSettings: IPluginResourceSettings,
    debugCodeLensProvider: DebugCodeLensProvider,
    debugConfigurationProvider: DebugConfigurationProvider,
    failDiagnostics: vscode.DiagnosticCollection,
    instanceSettings: InstanceSettings
  ) {
    this.workspaceFolder = workspaceFolder
    this.jestWorkspace = jestWorkspace
    this.channel = outputChannel
    this.failingAssertionDecorators = {}
    this.failDiagnostics = failDiagnostics
    this.clearOnNextInput = true
    this.pluginSettings = pluginSettings
    this.debugCodeLensProvider = debugCodeLensProvider
    this.instanceSettings = instanceSettings

    this.coverageMapProvider = new CoverageMapProvider()
    this.coverageOverlay = new CoverageOverlay(
      context,
      this.coverageMapProvider,
      pluginSettings.showCoverageOnLoad,
      pluginSettings.coverageFormatter
    )

    this.testResultProvider = new TestResultProvider(this.pluginSettings.debugMode)
    this.debugConfigurationProvider = debugConfigurationProvider

    this.jestProcessManager = new JestProcessManager({
      projectWorkspace: jestWorkspace,
      runAllTestsFirstInWatchMode: this.pluginSettings.runAllTestsFirst,
    })

    this.status = statusBar.bind(workspaceFolder.name)

    // The theme stuff
    this.setupDecorators()
    // The bottom bar thing
    this.setupStatusBar()
    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics)

    // If we should start the process by default, do so
    if (this.pluginSettings.autoEnable) {
      this.startProcess()
    } else {
      this.channel.appendLine('Skipping initial Jest runner process start.')
    }
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
          this.status.running('Starting watch mode')

          this.assignHandlers(this.jestProcess)
        } else {
          this.status.stopped()
          if (!jestProcess.stopRequested()) {
            let msg = `Starting Jest in Watch mode failed too many times and has been stopped.`
            if (this.instanceSettings.multirootEnv) {
              msg += `\nConsider add this workspace folder to disabledWorkspaceFolders`
            }
            this.channel.appendLine(`${msg}\n see troubleshooting: ${messaging.TROUBLESHOOTING_URL}`)
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
    return this.jestProcessManager.stopAll().then(() => {
      this.status.stopped()
    })
  }

  public restartProcess() {
    return this.stopProcess().then(() => {
      this.startProcess()
    })
  }

  public triggerUpdateActiveEditor(editor: vscode.TextEditor) {
    this.coverageOverlay.updateVisibleEditors()

    if (!this.canUpdateActiveEditor(editor)) {
      return
    }

    // not sure why we need to protect this block with parsingTestFile ?
    // using an ivar as a locking mechanism has bad smell
    // TODO: refactor maybe?
    this.parsingTestFile = true

    const filePath = editor.document.fileName
    const testResults = this.testResultProvider.getSortedResults(filePath)

    this.updateDecorators(testResults, editor)
    updateCurrentDiagnostics(testResults.fail, this.failDiagnostics, editor)

    this.parsingTestFile = false
  }

  public triggerUpdateSettings(updatedSettings: IPluginResourceSettings) {
    this.pluginSettings = updatedSettings

    this.jestWorkspace.rootPath = updatedSettings.rootPath
    this.jestWorkspace.pathToJest = pathToJest(updatedSettings)
    this.jestWorkspace.pathToConfig = pathToConfig(updatedSettings)
    this.jestWorkspace.debug = updatedSettings.debugMode
    this.testResultProvider.verbose = updatedSettings.debugMode

    this.coverageOverlay.enabled = updatedSettings.showCoverageOnLoad

    this.restartProcess()
  }

  updateDecorators(testResults: SortedTestResults, editor: vscode.TextEditor) {
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

  canUpdateActiveEditor(editor: vscode.TextEditor) {
    const inSettings = !editor.document
    if (inSettings) {
      return false
    }

    if (this.parsingTestFile) {
      return false
    }

    // check if file is a possible code file: js/jsx/ts/tsx
    const codeRegex = /\.[t|j]sx?$/
    return codeRegex.test(editor.document.uri.fsPath)
  }

  public deactivate() {
    this.jestProcessManager.stopAll()
  }

  public runTest = async (workspaceFolder: vscode.WorkspaceFolder, fileName: string, identifier: string) => {
    const restart = this.jestProcessManager.numberOfProcesses > 0
    this.jestProcessManager.stopAll()

    this.debugConfigurationProvider.prepareTestRun(fileName, identifier)

    const handle = vscode.debug.onDidTerminateDebugSession(_ => {
      handle.dispose()
      if (restart) {
        this.startProcess()
      }
    })

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
    this.triggerUpdateActiveEditor(editor)
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
        this.triggerUpdateActiveEditor(editor)
      }
    }
  }

  toggleCoverageOverlay() {
    this.coverageOverlay.toggleVisibility()
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
    if (/(snapshots? failed)|(snapshot test failed)/i.test(noANSI)) {
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

  private setupStatusBar() {
    this.status.initial()
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
    this.status.running('initial full test run')
  }

  private updateWithData(data: JestTotalResults) {
    const normalizedData = resultsWithLowerCaseWindowsDriveLetters(data)
    this.coverageMapProvider.update(normalizedData.coverageMap)

    const statusList = this.testResultProvider.updateTestResults(normalizedData)
    updateDiagnostics(statusList, this.failDiagnostics)

    const failedFileCount = failedSuiteCount(this.failDiagnostics)
    if (failedFileCount <= 0 && normalizedData.success) {
      this.status.success()
    } else {
      this.status.failed(` (${failedFileCount} test suite${failedFileCount > 1 ? 's' : ''} failed)`)
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (vscode.workspace.getWorkspaceFolder(editor.document.uri) === this.workspaceFolder) {
        this.triggerUpdateActiveEditor(editor)
      }
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
        identifier: it.name,
      }
    })
  }
}
