import * as vscode from 'vscode'
import * as path from 'path'
import {
  ItBlock,
  Runner,
  Settings,
  ProjectWorkspace,
  parse as babylonParse,
  TestReconciler,
  JestTotalResults,
  IParseResults,
  TestAssertionStatus,
} from 'jest-editor-support'
import { parse as typescriptParse } from 'jest-test-typescript-parser'
import { matcher } from 'micromatch'

import * as decorations from './decorations'
import { IPluginSettings } from './IPluginSettings'
import * as status from './statusBar'
import { TestReconciliationState } from './TestReconciliationState'
import { pathToJestPackageJSON } from './helpers'
import { readFileSync } from 'fs'
import { Coverage, showCoverageOverlay } from './Coverage'
import { updateDiagnostics, resetDiagnositics, failedSuiteCount } from './diagnostics'

export class JestExt {
  private workspace: ProjectWorkspace
  private jestProcess: Runner
  private jestSettings: Settings
  private reconciler: TestReconciler
  private pluginSettings: IPluginSettings
  public coverage: Coverage

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
  private failingAssertionDecorators: vscode.TextEditorDecorationType[]

  private clearOnNextInput: boolean
  private forcedClose: boolean

  constructor(workspace: ProjectWorkspace, outputChannel: vscode.OutputChannel, pluginSettings: IPluginSettings) {
    this.workspace = workspace
    this.channel = outputChannel
    this.failingAssertionDecorators = []
    this.failDiagnostics = vscode.languages.createDiagnosticCollection('Jest')
    this.clearOnNextInput = true
    this.reconciler = new TestReconciler()
    this.jestSettings = new Settings(workspace)
    this.pluginSettings = pluginSettings
    this.coverage = new Coverage(this.workspace.rootPath)

    this.getSettings()
  }

  public startProcess() {
    // The Runner is an event emitter that handles taking the Jest
    // output and converting it into different types of data that
    // we can handle here differently.
    if (this.jestProcess) {
      this.jestProcess.closeProcess()
      delete this.jestProcess
    }

    this.jestProcess = new Runner(this.workspace)

    this.jestProcess
      .on('debuggerProcessExit', () => {
        this.channel.appendLine('Closed Jest')
        if (!this.jestProcess.watchMode && !this.forcedClose) {
          this.channel.appendLine('Starting watch mode...')
          this.jestProcess.closeProcess()
          this.jestProcess.start(true)
        }
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
    resetDiagnositics(this.failDiagnostics)

    this.forcedClose = false
    // Go!
    this.jestProcess.start(false)
  }

  public stopProcess() {
    this.channel.appendLine('Closing Jest jest_runner.')
    this.forcedClose = true
    this.jestProcess.closeProcess()
    delete this.jestProcess
    status.stopped()
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
            vscode.window.showInformationMessage('Updated Snapshots. It will show in your next test run.')
          })
        }
      })
  }

  public triggerUpdateDecorations(editor: vscode.TextEditor) {
    showCoverageOverlay(editor, this.coverage)
    if (!this.canUpdateDecorators(editor)) {
      return
    }

    // OK - lets go
    this.parsingTestFile = true
    this.updateDotDecorators(editor)
    this.parsingTestFile = false
  }

  private parseTestFile(path: string): IParseResults {
    const isTypeScript = path.match(/.(ts|tsx)$/)
    const parser = isTypeScript ? typescriptParse : babylonParse
    return parser(path)
  }

  private sortDecorationBlocks(
    itBlocks: ItBlock[],
    assertions: TestAssertionStatus[],
    enableInlineErrorMessages: boolean
  ): {
    successes: Array<ItBlock>
    fails: Array<ItBlock>
    skips: Array<ItBlock>
    unknowns: Array<ItBlock>
    inlineErrors: Array<TestAssertionStatus>
  } {
    // This makes it cheaper later down the line
    const successes: Array<ItBlock> = []
    const fails: Array<ItBlock> = []
    const skips: Array<ItBlock> = []
    const unknowns: Array<ItBlock> = []
    const inlineErrors: Array<TestAssertionStatus> = []

    const assertionMap: { [title: string]: TestAssertionStatus } = {}
    assertions.forEach(a => (assertionMap[a.title] = a))

    // Use the parsers it blocks for references
    itBlocks.forEach(it => {
      const state = assertionMap[it.name]
      if (state) {
        switch (state.status) {
          case TestReconciliationState.KnownSuccess:
            successes.push(it)
            break
          case TestReconciliationState.KnownFail:
            fails.push(it)
            if (enableInlineErrorMessages) {
              inlineErrors.push(state)
            }
            break
          case TestReconciliationState.KnownSkip:
            skips.push(it)
            break
          case TestReconciliationState.Unknown:
            unknowns.push(it)
            break
        }
      } else {
        unknowns.push(it)
      }
    })

    return { successes, fails, skips, unknowns, inlineErrors }
  }

  private updateDotDecorators(editor: vscode.TextEditor) {
    const filePath = editor.document.uri.fsPath
    const { itBlocks } = this.parseTestFile(filePath)
    const assertions = this.reconciler.assertionsForTestFile(filePath)
    const { successes, fails, skips, unknowns, inlineErrors } = this.sortDecorationBlocks(
      itBlocks,
      assertions,
      this.pluginSettings.enableInlineErrorMessages
    )

    const styleMap = [
      { data: successes, decorationType: this.passingItStyle, state: TestReconciliationState.KnownSuccess },
      { data: fails, decorationType: this.failingItStyle, state: TestReconciliationState.KnownFail },
      { data: skips, decorationType: this.skipItStyle, state: TestReconciliationState.KnownSkip },
      { data: unknowns, decorationType: this.unknownItStyle, state: TestReconciliationState.Unknown },
    ]
    styleMap.forEach(style => {
      const decorators = this.generateDotsForItBlocks(style.data, style.state)
      editor.setDecorations(style.decorationType, decorators)
    })

    this.resetInlineErrorDecorators(editor)
    inlineErrors.forEach(a => {
      const { style, decorator } = this.generateInlineErrorDecorator(a)
      editor.setDecorations(style, [decorator])
    })
  }

  private resetInlineErrorDecorators(_: vscode.TextEditor) {
    this.failingAssertionDecorators.forEach(element => {
      element.dispose()
    })
    this.failingAssertionDecorators = []
  }

  private generateInlineErrorDecorator(assertion: TestAssertionStatus) {
    const errorMessage = assertion.terseMessage || assertion.shortMessage
    const decorator = {
      range: new vscode.Range(assertion.line - 1, 0, assertion.line - 1, 0),
      hoverMessage: errorMessage,
    }
    // We have to make a new style for each unique message, this is
    // why we have to remove off of them beforehand
    const style = decorations.failingAssertionStyle(errorMessage)
    this.failingAssertionDecorators.push(style)

    return { style, decorator }
  }

  private canUpdateDecorators(editor: vscode.TextEditor) {
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
    const details = this.jestProcess && this.jestProcess.watchMode ? 'testing for changes' : 'initial full test run'
    status.running(details)
  }

  private updateWithData(data: JestTotalResults) {
    this.coverage.mapCoverage(data.coverageMap)

    const results = this.reconciler.updateFileWithJestStatus(data)
    updateDiagnostics(results, this.failDiagnostics)

    const failedFileCount = failedSuiteCount(this.failDiagnostics)
    if (failedFileCount <= 0 && data.success) {
      status.success()
    } else {
      status.failed(` (${failedFileCount} test suite${failedFileCount > 1 ? 's' : ''} failed)`)
    }

    this.triggerUpdateDecorations(vscode.window.activeTextEditor)
    this.clearOnNextInput = true
  }

  private generateDotsForItBlocks(blocks: ItBlock[], state: TestReconciliationState): vscode.DecorationOptions[] {
    const nameForState = (_name: string, state: TestReconciliationState): string => {
      switch (state) {
        case TestReconciliationState.KnownSuccess:
          return 'Passed'
        case TestReconciliationState.KnownFail:
          return 'Failed'
        case TestReconciliationState.KnownSkip:
          return 'Skipped'
        case TestReconciliationState.Unknown:
          return 'Test has not run yet, due to Jest only running tests related to changes.'
      }
    }
    return blocks.map(it => {
      return {
        // VS Code is indexed starting at 0
        // jest-editor-support is indexed starting at 1
        range: new vscode.Range(it.start.line - 1, it.start.column - 1, it.start.line - 1, it.start.column + 1),
        hoverMessage: nameForState(it.name, state),
      }
    })
  }

  public deactivate() {
    this.jestProcess.closeProcess()
  }

  private getJestVersion(version: (v: number) => void) {
    const packageJSON = pathToJestPackageJSON(this.pluginSettings)
    if (packageJSON) {
      const contents = readFileSync(packageJSON, 'utf8')
      const packageMetadata = JSON.parse(contents)
      if (packageMetadata['version']) {
        version(parseInt(packageMetadata['version']))
        return
      }
    }
    // Fallback to last pre-20 release
    version(18)
  }
}
