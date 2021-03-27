import * as vscode from 'vscode';

import { extensionName } from './appGlobals';
import { statusBar } from './StatusBar';
import { ExtensionManager, getExtensionWindowSettings } from './extensionManager';
import { registerSnapshotCodeLens, registerSnapshotPreview } from './SnapshotCodeLens';
import { startWizard, StartWizardOptions } from './setup-wizard';
import { JestExt } from './JestExt';

let extensionManager: ExtensionManager;

const addSubscriptions = (context: vscode.ExtensionContext): void => {
  const languages = [
    { language: 'javascript' },
    { language: 'javascriptreact' },
    { language: 'typescript' },
    { language: 'typescriptreact' },
  ];

  // command function
  const startSession = (extension: JestExt) => {
    extension.startSession();
  };
  const stopSession = (extension: JestExt) => extension.stopSession();
  const toggleCoverage = (extension: JestExt) => extension.toggleCoverageOverlay();
  const runAllTests = (extension: JestExt) => extension.runAllTests();

  context.subscriptions.push(
    ...statusBar.register((folder: string) => extensionManager.getByName(folder)),

    extensionManager.registerCommand({
      type: 'all-workspaces',
      name: 'start',
      callback: startSession,
    }),
    extensionManager.registerCommand({
      type: 'select-workspace',
      name: 'start',
      callback: startSession,
    }),
    extensionManager.registerCommand({
      type: 'all-workspaces',
      name: 'stop',
      callback: stopSession,
    }),
    extensionManager.registerCommand({
      type: 'select-workspace',
      name: 'stop',
      callback: stopSession,
    }),
    extensionManager.registerCommand({
      type: 'all-workspaces',
      name: 'toggle-coverage',
      callback: toggleCoverage,
    }),
    extensionManager.registerCommand({
      type: 'select-workspace',
      name: 'toggle-coverage',
      callback: toggleCoverage,
    }),
    extensionManager.registerCommand({
      type: 'active-text-editor-workspace',
      name: 'toggle-coverage',
      callback: toggleCoverage,
    }),
    extensionManager.registerCommand({
      type: 'all-workspaces',
      name: 'run-all-tests',
      callback: runAllTests,
    }),
    extensionManager.registerCommand({
      type: 'select-workspace',
      name: 'run-all-tests',
      callback: runAllTests,
    }),
    extensionManager.registerCommand({
      type: 'active-text-editor-workspace',
      name: 'run-all-tests',
      callback: (extension) => extension.runAllTests(),
    }),
    extensionManager.registerCommand({
      type: 'active-text-editor',
      name: 'run-all-tests',
      callback: (extension, editor) => extension.runAllTests(editor),
    }),
    extensionManager.registerCommand({
      type: 'active-text-editor',
      name: 'debug-tests',
      callback: (extension, editor, ...identifiers) => {
        extension.debugTests(editor.document, ...identifiers);
      },
    }),
    vscode.commands.registerCommand(
      `${extensionName}.setup-extension`,
      (options: StartWizardOptions = { verbose: true }) =>
        startWizard(extensionManager.debugConfigurationProvider, options)
    ),
    ...registerSnapshotCodeLens(getExtensionWindowSettings()?.enableSnapshotPreviews ?? false),
    ...registerSnapshotPreview(),
    vscode.languages.registerCodeLensProvider(languages, extensionManager.coverageCodeLensProvider),
    vscode.languages.registerCodeLensProvider(languages, extensionManager.debugCodeLensProvider),
    // this provides the opportunity to inject test names into the DebugConfiguration
    vscode.debug.registerDebugConfigurationProvider(
      'node',
      extensionManager.debugConfigurationProvider
    ),
    // this provides the snippets generation
    vscode.debug.registerDebugConfigurationProvider(
      'vscode-jest-tests',
      extensionManager.debugConfigurationProvider
    ),
    vscode.workspace.onDidChangeConfiguration(
      extensionManager.onDidChangeConfiguration,
      extensionManager
    ),

    vscode.workspace.onDidChangeWorkspaceFolders(
      extensionManager.onDidChangeWorkspaceFolders,
      extensionManager
    ),

    vscode.workspace.onDidCloseTextDocument(
      extensionManager.onDidCloseTextDocument,
      extensionManager
    ),

    vscode.window.onDidChangeActiveTextEditor(
      extensionManager.onDidChangeActiveTextEditor,
      extensionManager
    ),
    vscode.workspace.onDidChangeTextDocument(
      extensionManager.onDidChangeTextDocument,
      extensionManager
    ),
    vscode.workspace.onDidCreateFiles(extensionManager.onDidCreateFiles, extensionManager),
    vscode.workspace.onDidRenameFiles(extensionManager.onDidRenameFiles, extensionManager),
    vscode.workspace.onDidDeleteFiles(extensionManager.onDidDeleteFiles, extensionManager)
  );
};

export function activate(context: vscode.ExtensionContext): void {
  extensionManager = new ExtensionManager(context);
  addSubscriptions(context);
  extensionManager.activate();
}
export function deactivate(): void {
  extensionManager.unregisterAll();
}
