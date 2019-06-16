import * as vscode from 'vscode'

import { GetJestExtByURI } from '../extensionManager'

export class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private getJestExt: GetJestExtByURI

  constructor(getJestExt: GetJestExtByURI) {
    this.getJestExt = getJestExt
  }

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
    const ext = this.getJestExt(document.uri)
    const coverage = ext && ext.coverageMapProvider.getFileCoverage(document.fileName)
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
