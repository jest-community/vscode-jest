import * as vscode from 'vscode'

import { JestExt } from '../JestExt'

export class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private getJestExt: (uri: vscode.Uri) => JestExt

  constructor(getJestExt: (uri: vscode.Uri) => JestExt) {
    this.getJestExt = getJestExt
  }

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
    const coverage = this.getJestExt(document.uri).coverageMapProvider.getFileCoverage(document.fileName)
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
