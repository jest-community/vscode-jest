import * as vscode from 'vscode'

export class DebugCodeLens extends vscode.CodeLens {
  readonly fileName: string
  readonly testName: string

  constructor(range: vscode.Range, fileName: string, testName: string) {
    super(range)
    this.fileName = fileName
    this.testName = testName
  }
}
