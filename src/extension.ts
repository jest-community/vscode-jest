import * as vscode from 'vscode';

import { statusBar } from './StatusBar';
import { ExtensionManager } from './extension-manager';
import { tiContextManager } from './test-provider/test-item-context-manager';
import * as languageProvider from './language-provider';
import { noOpFileSystemProvider } from './noop-fs-provider';
import { executableTerminalLinkProvider } from './terminal-link-provider';
import { outputManager } from './output-manager';

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
    ...tiContextManager.registerCommands(),
    ...languageProvider.register(),
    noOpFileSystemProvider.register(),
    executableTerminalLinkProvider.register(),
    ...outputManager.register()
  );
};

export function activate(context: vscode.ExtensionContext): void {
  extensionManager = new ExtensionManager(context);
  addSubscriptions(context);
  extensionManager.activate();
}
export function deactivate(): void {
  extensionManager.deleteAllExtensions();
}
