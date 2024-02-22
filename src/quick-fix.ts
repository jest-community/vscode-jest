import * as vscode from 'vscode';
import { LONG_RUN_TROUBLESHOOTING_URL, TROUBLESHOOTING_URL, extensionName } from './appGlobals';
import { WizardTaskId } from './setup-wizard';

export type QuickFixActionType =
  | 'help'
  | 'wizard'
  | 'disable-folder'
  | 'defer'
  | 'help-long-run'
  | 'setup-cmdline'
  | 'setup-monorepo';

interface QuickFixItem extends vscode.QuickPickItem {
  action: () => void;
}

/**
 * Showing configurable quick fix menu via a quick pick
 *
 * @param folderName
 * @param types
 */
export const showQuickFix = async (folderName: string, types: QuickFixActionType[]) => {
  const buildItems = (): QuickFixItem[] => {
    const setupToolItem = (taskId?: WizardTaskId): QuickFixItem => ({
      label: '$(tools) Customize Extension',
      description: 'if you can run jest via CLI but not via the extension',
      action: () => {
        vscode.commands.executeCommand(
          `${extensionName}.with-workspace.setup-extension`,
          folderName,
          taskId && { taskId }
        );
      },
    });

    const items: QuickFixItem[] = [];
    for (const t of types) {
      switch (t) {
        case 'help':
          items.push({
            label: '$(info) Help',
            description: 'See troubleshooting guide',
            action: () => {
              vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(TROUBLESHOOTING_URL));
            },
          });
          break;
        case 'wizard':
          items.push(setupToolItem());
          break;
        case 'setup-cmdline':
          items.push(setupToolItem('cmdLine'));
          break;
        case 'setup-monorepo':
          items.push(setupToolItem('monorepo'));
          break;
        case 'disable-folder':
          items.push({
            label: '$(error) Disable Extension',
            description: "if you don't intend to run jest in this folder ever",
            action: () => {
              vscode.commands.executeCommand(`${extensionName}.with-workspace.disable`, folderName);
            },
          });
          break;
        case 'defer':
          items.push({
            label: '$(play) Defer or Change Run Mode',
            description: 'if you are not ready to run jest yet',
            action: () => {
              vscode.commands.executeCommand(
                `${extensionName}.with-workspace.change-run-mode`,
                folderName
              );
            },
          });
          break;
        case 'help-long-run':
          items.push({
            label: '$(info) Help',
            description: 'See LongRun troubleshooting guide',
            action: () => {
              vscode.commands.executeCommand(
                'vscode.open',
                vscode.Uri.parse(LONG_RUN_TROUBLESHOOTING_URL)
              );
            },
          });
          break;
      }
    }
    return items;
  };

  const items = buildItems();
  const item = await vscode.window.showQuickPick(items, { placeHolder: 'Select a fix action' });
  item?.action();
};
