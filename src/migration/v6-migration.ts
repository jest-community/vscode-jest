import * as vscode from 'vscode';
import { outputManager } from '../output-manager';

const MIGRATION_GUIDE_URL =
  'https://github.com/jest-community/vscode-jest/blob/master/release-notes//release-note-v6.md#v602-migration-guide';

export class MigrationTool_V6 {
  public async show(): Promise<void> {
    const items = {
      migrateCheck: 'Check "jest.outputConfig" Setting',
      help: 'Migration Guide',
    };
    const answer = await vscode.window.showInformationMessage(
      'V6 Migration',
      {
        modal: true,
        detail: 'Check and fix setting conflicts.',
      },
      items.migrateCheck,
      items.help
    );
    switch (answer) {
      case items.migrateCheck: {
        this.migrateCheck();
        break;
      }
      case items.help: {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(MIGRATION_GUIDE_URL));
        break;
      }
      default: {
        vscode.window.showInformationMessage(
          'Migration cancelled. You can run migration tool later with "Jest:V6 Migration" command.'
        );
        break;
      }
    }
  }

  private async migrateCheck(): Promise<void> {
    const isValid = await outputManager.validate(true);
    const msg = isValid
      ? 'You are all set.'
      : 'You can use "Jest: V6 Migration" command to rerun migration tool later.';
    vscode.window.showInformationMessage(msg, 'Close');
  }
}
