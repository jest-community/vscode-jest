import { AbstractFormatter } from './Formatters/AbstractFormatter'
import { CoverageMapProvider } from './CoverageMapProvider'
import { DefaultFormatter } from './Formatters/DefaultFormatter'
import * as vscode from 'vscode'
import { hasDocument } from '../editor'

export class CoverageOverlay {
  static readonly defaultVisibility = false
  private _enabled: boolean
  formatter: AbstractFormatter

  constructor(coverageMapProvider: CoverageMapProvider, enabled: boolean = CoverageOverlay.defaultVisibility) {
    this._enabled = enabled
    this.formatter = new DefaultFormatter(coverageMapProvider)
  }

  get enabled() {
    return this._enabled
  }

  set enabled(value: boolean) {
    this._enabled = value
    this.updateVisibleEditors()
  }

  toggleVisibility() {
    this._enabled = !this._enabled
    this.updateVisibleEditors()
  }

  updateVisibleEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
      this.update(editor)
    }
  }

  update(editor: vscode.TextEditor) {
    if (!hasDocument(editor)) {
      return
    }

    if (this._enabled) {
      this.formatter.format(editor)
    } else {
      this.formatter.clear(editor)
    }
  }
}
