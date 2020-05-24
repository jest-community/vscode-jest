import * as vscode from 'vscode';
import { Snapshot } from 'jest-editor-support';

import { extensionName } from '../appGlobals';
import { previewCommand } from './SnapshotPreviewProvider';

const missingSnapshotCommand = `${extensionName}.snapshot.missing`;

class SnapshotCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {
    const snapshots = new Snapshot();
    return snapshots.getMetadata(document.uri.fsPath).map((snapshot) => {
      const { line } = snapshot.node.loc.start;
      const range = new vscode.Range(line - 1, 0, line - 1, 0);
      let command: vscode.Command;
      if (snapshot.exists) {
        command = {
          title: 'view snapshot',
          command: previewCommand,
          arguments: [snapshot],
        };
      } else {
        command = {
          title: 'snapshot missing',
          command: missingSnapshotCommand,
        };
      }

      return new vscode.CodeLens(range, command);
    });
  }
}

export function registerSnapshotCodeLens(enableSnapshotPreviews: boolean) {
  if (!enableSnapshotPreviews) {
    return [];
  }
  return [
    vscode.languages.registerCodeLensProvider(
      { pattern: '**/*.{ts,tsx,js,jsx}' },
      new SnapshotCodeLensProvider()
    ),
    vscode.commands.registerCommand(missingSnapshotCommand, () => {
      vscode.window.showInformationMessage('Run test to generate snapshot.');
    }),
  ];
}
