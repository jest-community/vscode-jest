import * as vscode from 'vscode';

import { statusBar } from './StatusBar';
import { ExtensionManager } from './extensionManager';
import { tiContextManager } from './test-provider/test-item-context-manager';

let extensionManager: ExtensionManager;

const addSubscriptions = (context: vscode.ExtensionContext): void => {
  const languages = [
    { language: 'javascript' },
    { language: 'javascriptreact' },
    { language: 'typescript' },
    { language: 'typescriptreact' },
    { language: 'vue' },
  ];

  // command function

  context.subscriptions.push(
    ...statusBar.register((folder: string) => extensionManager.getByName(folder)),
    ...extensionManager.register(),
    vscode.languages.registerCodeLensProvider(languages, extensionManager.coverageCodeLensProvider),
    vscode.languages.registerCodeLensProvider(languages, extensionManager.debugCodeLensProvider),
    ...tiContextManager.registerCommands()
  );
};

export function activate(context: vscode.ExtensionContext): void {
  extensionManager = new ExtensionManager(context);
  addSubscriptions(context);
  extensionManager.activate();
}
export function deactivate(): void {
  extensionManager.unregisterAllWorkspaces();
}
