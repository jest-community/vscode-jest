import * as vscode from 'vscode'

import { JestExt } from '../JestExt'

export function registerCoverageCodeLens(jestExt: JestExt) {
  return [
    vscode.languages.registerCodeLensProvider(
      { pattern: '**/*.{ts,tsx,js,jsx}' },
      new CoverageCodeLensProvider(jestExt)
    ),
  ]
}

class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private jestExt: JestExt

  constructor(jestExt: JestExt) {
    this.jestExt = jestExt
  }

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
    const coverage = this.jestExt.coverage.getCoverageForFile(document.fileName)
    if (!coverage) {
      return
    }

    const summary = coverage.toSummary()
    const json = summary.toJSON()
    const metrics = Object.keys(json).reduce((previous, metric) => {
      return `${previous}${previous ? ', ' : ''}${metric}: ${json[metric].pct}%`
    }, '')

    const range = new vscode.Range(0, 0, 0, 0)
    const command: vscode.Command = {
      title: metrics,
      command: null,
    }

    return [new vscode.CodeLens(range, command)]
  }
}
