import * as vscode from 'vscode'

import { JestExt } from '../JestExt'
import { extensionName } from '../appGlobals'

const coverageCommand = `${extensionName}.coverage.metrics`

export function registerCoverageCodeLens(jestExt: JestExt) {
  return [
    vscode.languages.registerCodeLensProvider(
      { pattern: '**/*.{ts,tsx,js,jsx}' },
      new CoverageCodeLensProvider(jestExt)
    ),
    vscode.commands.registerCommand(coverageCommand, () => {
      vscode.window.showInformationMessage('You have unit tests!')
    }),
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
      command: coverageCommand,
    }

    return [new vscode.CodeLens(range, command)]
  }
}
