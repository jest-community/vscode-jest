import * as vscode from 'vscode'
import { extensionName } from '../appGlobals'
import { basename } from 'path'
import { DebugCodeLens } from './DebugCodeLens'
import { TestReconciliationState } from '../TestReconciliationState'
import { TestResultProvider } from '../TestResultProvider'

export class DebugCodeLensProvider implements vscode.CodeLensProvider {
  private _enabled: boolean
  onDidChange: vscode.EventEmitter<void>
  testResultProvider: TestResultProvider

  constructor(testResultProvider: TestResultProvider, enabled: boolean) {
    this.testResultProvider = testResultProvider
    this._enabled = enabled
    this.onDidChange = new vscode.EventEmitter()
  }

  get enabled() {
    return this._enabled
  }

  set enabled(value: boolean) {
    this._enabled = value
    this.onDidChange.fire()
  }

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChange.event
  }

  provideCodeLenses(document: vscode.TextDocument, _: vscode.CancellationToken): vscode.CodeLens[] {
    const result = []

    if (!this._enabled || document.isUntitled) {
      return result
    }

    const filePath = document.fileName
    const testResults = this.testResultProvider.getResults(filePath)
    const fileName = basename(document.fileName)
    for (const test of testResults) {
      if (test.status === TestReconciliationState.KnownSuccess) {
        continue
      }

      const start = new vscode.Position(test.start.line, test.start.column)
      const end = new vscode.Position(test.end.line, test.start.column + 5)
      const range = new vscode.Range(start, end)
      result.push(new DebugCodeLens(range, fileName, test.name))
    }

    return result
  }

  resolveCodeLens(codeLens: vscode.CodeLens, _: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
    if (codeLens instanceof DebugCodeLens) {
      codeLens.command = {
        arguments: [codeLens.fileName, codeLens.testName],
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
