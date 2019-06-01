import * as vscode from 'vscode'

import { JestExt } from '../JestExt'

type GetJestExt = (uri: vscode.Uri) => JestExt | undefined

export class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private getJestExt: GetJestExt

  constructor(getJestExt: GetJestExt) {
    this.getJestExt = getJestExt
  }

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
    const ext = this.getJestExt(document.uri)
    const coverage = ext ? ext.coverageMapProvider.getFileCoverage(document.fileName) : undefined
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
