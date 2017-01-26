import * as vscode from 'vscode'
import { SnapshotMetadata } from 'jest-editor-support'

import { extensionName } from '../appGlobals'

export const previewCommand = `${extensionName}.snapshot.preview`

export function registerSnapshotPreview() {
  const previewUri = vscode.Uri.parse(`${extensionName}.snapshot.preview://snapshot-preview`)
  const provider = new SnapshotPreviewProvider()
  return [
    vscode.commands.registerCommand(previewCommand, (snapshot: SnapshotMetadata) => {
      vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two, snapshot.name)
      provider.update(previewUri, snapshot.content)
    }),
    vscode.workspace.registerTextDocumentContentProvider(`${extensionName}.snapshot.preview`, provider),
  ]
}

class SnapshotPreviewProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
  private snapshot: string

  get onDidChange() {
    return this._onDidChange.event
  }

  public update(uri: vscode.Uri, snapshot: string) {
    this.snapshot = snapshot
    this._onDidChange.fire(uri)
  }

  public provideTextDocumentContent() {
    if (this.snapshot) {
      const escaped = this.snapshot
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<pre>${escaped}</pre>`
    }
  }
}
