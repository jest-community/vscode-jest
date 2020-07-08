import * as vscode from 'vscode';
import { SnapshotMetadata } from 'jest-editor-support';

import { extensionName } from '../appGlobals';

export const previewCommand = `${extensionName}.snapshot.preview`;

export function registerSnapshotPreview() {
  let panel: vscode.WebviewPanel = null;

  const escaped = (snapshot: string) => {
    if (snapshot) {
      // tslint:disable-next-line no-shadowed-variable
      const escaped = snapshot
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre>${escaped}</pre>`;
    }
  };

  return [
    vscode.commands.registerCommand(previewCommand, (snapshot: SnapshotMetadata) => {
      if (panel) {
        panel.reveal();
      } else {
        panel = vscode.window.createWebviewPanel(
          'view_snapshot',
          snapshot.name,
          vscode.ViewColumn.Two,
          {}
        );

        panel.onDidDispose(() => {
          panel = null;
        });
      }

      panel.webview.html = escaped(snapshot.content);
      panel.title = snapshot.name;
    }),
  ];
}
