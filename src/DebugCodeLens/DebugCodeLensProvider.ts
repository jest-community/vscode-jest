import * as vscode from 'vscode'
import { extensionName } from '../appGlobals'
import { escapeRegExp } from '../helpers'
import { basename } from 'path'
import { DebugCodeLens } from './DebugCodeLens'
import { TestReconciliationState } from '../TestResults'
import { TestState, TestStateByTestReconciliationState } from './TestState'
import { JestExt } from '../JestExt'

export class DebugCodeLensProvider implements vscode.CodeLensProvider {
  private _showWhenTestStateIn: TestState[]
  private getJestExt: (uri: vscode.Uri) => JestExt
  onDidChange: vscode.EventEmitter<void>

  constructor(getJestExt: (uri: vscode.Uri) => JestExt, showWhenTestStateIn: TestState[]) {
    this.getJestExt = getJestExt
    this._showWhenTestStateIn = showWhenTestStateIn
    this.onDidChange = new vscode.EventEmitter()
  }

  get showWhenTestStateIn() {
    return this._showWhenTestStateIn
  }

  set showWhenTestStateIn(value: TestState[]) {
    this._showWhenTestStateIn = value
    this.onDidChange.fire()
  }

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChange.event
  }

  provideCodeLenses(document: vscode.TextDocument, _: vscode.CancellationToken): vscode.CodeLens[] {
    const result = []

    if (this._showWhenTestStateIn.length === 0 || document.isUntitled) {
      return result
    }

    const filePath = document.fileName
    const testResults = this.getJestExt(document.uri).testResultProvider.getResults(filePath)
    const fileName = basename(document.fileName)

    for (const test of testResults) {
      if (!this.showCodeLensAboveTest(test)) {
        continue
      }

      const start = new vscode.Position(test.start.line, test.start.column)
      const end = new vscode.Position(test.end.line, test.start.column + 5)
      const range = new vscode.Range(start, end)
      result.push(new DebugCodeLens(document, range, fileName, test.name))
    }

    return result
  }

  showCodeLensAboveTest(test: { status: TestReconciliationState }) {
    const state = TestStateByTestReconciliationState[test.status]
    return this._showWhenTestStateIn.includes(state)
  }

  resolveCodeLens(codeLens: vscode.CodeLens, _: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
    if (codeLens instanceof DebugCodeLens) {
      codeLens.command = {
        arguments: [codeLens.document, codeLens.fileName, escapeRegExp(codeLens.testName)],
        command: `${extensionName}.run-test`,
        title: 'Debug',
      }
    }

    return codeLens
  }

  didChange() {
    this.onDidChange.fire()
  }
}
