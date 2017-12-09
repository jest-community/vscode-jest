import * as vscode from 'vscode'
import { extensionName } from './appGlobals'
import { basename } from 'path'
import { DecorationOptions } from './types'

class CodeLens extends vscode.CodeLens {
  readonly identifier: string
  readonly fileName: string
  constructor(range: vscode.Range, fileName: string, identifier: string) {
    super(range)
    this.fileName = fileName
    this.identifier = identifier
  }
}

export class CodeLensProvider implements vscode.CodeLensProvider {
  private didChangeCodeLenses: vscode.EventEmitter<void>
  private decorations: DecorationOptions[]
  private enabled: boolean

  constructor(enabled: boolean) {
    this.didChangeCodeLenses = new vscode.EventEmitter()
    this.enabled = enabled
  }

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.didChangeCodeLenses.event
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (!this.enabled) {
      return []
    }

    return (this.decorations || []).map(o => {
      const range = new vscode.Range(
        o.range.start.line,
        o.range.start.character,
        o.range.start.line,
        o.range.start.character + 5 // lenses all have text 'Debug'
      )
      return new CodeLens(range, basename(document.fileName), o.identifier)
    })
  }

  resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
    if (codeLens instanceof CodeLens) {
      codeLens.command = {
        arguments: [codeLens.fileName, codeLens.identifier],
        command: `${extensionName}.run-test`,
        title: 'Debug',
      }
    }
    return codeLens
  }

  updateLenses(decorations: DecorationOptions[]) {
    this.decorations = decorations
    this.didChangeCodeLenses.fire()
  }

  setEnabled(enabled) {
    this.enabled = enabled
    this.didChangeCodeLenses.fire()
  }
}
