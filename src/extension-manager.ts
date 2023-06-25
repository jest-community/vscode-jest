import * as vscode from 'vscode';
import { JestExt } from './JestExt';
import { DebugConfigurationProvider } from './DebugConfigurationProvider';
import { statusBar } from './StatusBar';
import { CoverageCodeLensProvider } from './Coverage';
import { extensionId, extensionName } from './appGlobals';
import {
  PendingSetupTask,
  PendingSetupTaskKey,
  startWizard,
  StartWizardOptions,
  WizardTaskId,
  IgnoreWorkspaceChanges,
} from './setup-wizard';
import { ItemCommand } from './test-provider/types';
import { enabledWorkspaceFolders } from './workspace-manager';
import { VirtualFolderBasedCache } from './virtual-workspace-folder';

export type GetJestExtByURI = (uri: vscode.Uri) => JestExt[];

export function addFolderToDisabledWorkspaceFolders(folder: string): void {
  const config = vscode.workspace.getConfiguration('jest');
  const disabledWorkspaceFolders = new Set(config.get<string[]>('disabledWorkspaceFolders') ?? []);
  disabledWorkspaceFolders.add(folder);
  config.update('disabledWorkspaceFolders', [...disabledWorkspaceFolders]);
}

export type RegisterCommand =
  | {
      type: 'all-workspaces';
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (extension: JestExt, ...args: any[]) => any;
    }
  | {
      type: 'select-workspace';
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (extension: JestExt, ...args: any[]) => any;
    }
  | {
      type: 'workspace';
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (extension: JestExt, ...args: any[]) => any;
    }
  | {
      type: 'active-text-editor' | 'active-text-editor-workspace';
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (extension: JestExt, textEditor: vscode.TextEditor, ...args: any[]) => any;
    };
type CommandType = RegisterCommand['type'];
const CommandPrefix: Record<CommandType, string> = {
  'all-workspaces': `${extensionName}`,
  'select-workspace': `${extensionName}.workspace`,
  workspace: `${extensionName}.with-workspace`,
  'active-text-editor': `${extensionName}.editor`,
  'active-text-editor-workspace': `${extensionName}.editor.workspace`,
};
export type StartWizardFunc = (options?: StartWizardOptions) => ReturnType<typeof startWizard>;

export class ExtensionManager {
  debugConfigurationProvider: DebugConfigurationProvider;
  coverageCodeLensProvider: CoverageCodeLensProvider;
  startWizard: StartWizardFunc;

  private extCache: VirtualFolderBasedCache<JestExt>;
  private enabledFolders: vscode.WorkspaceFolder[] = [];

  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    this.extCache = new VirtualFolderBasedCache<JestExt>();
    this.debugConfigurationProvider = new DebugConfigurationProvider();
    this.coverageCodeLensProvider = new CoverageCodeLensProvider(this.getByDocUri);
    this.startWizard = (options?: StartWizardOptions) =>
      startWizard(this.debugConfigurationProvider, context, options);
    this.applySettings();
  }
  private getPendingSetupTask(): WizardTaskId | undefined {
    const root = vscode.workspace.workspaceFolders?.[0];
    const task = this.context.globalState.get<PendingSetupTask>(PendingSetupTaskKey);
    if (task && root?.name === task.workspace) {
      return task.taskId;
    }
  }
  applySettings(): void {
    const setupTask = this.getPendingSetupTask();
    if (setupTask) {
      console.warn(
        `setup task ${setupTask} in progress, skip extension activation to resume setup`
      );
      this.startWizard({ taskId: setupTask });
      return;
    }
    this.enabledFolders = enabledWorkspaceFolders();

    // update context setting
    vscode.commands.executeCommand('setContext', 'jest.folderCount', this.enabledFolders.length);

    const enabledNames = this.enabledFolders.map((w) => w.name);

    // unregister the not enabled workspaces
    this.extCache.getAllItems().forEach((ext) => {
      if (!enabledNames.includes(ext.name)) {
        this.deleteExtension(ext);
      }
    });
    this.enabledFolders.forEach((folder) => this.addExtension(folder));
  }
  addExtension(workspaceFolder: vscode.WorkspaceFolder): void {
    // abort if extension already exists or not enabled
    if (
      this.extCache.getItemByFolderName(workspaceFolder.name) ||
      !this.enabledFolders.find((f) => f.name === workspaceFolder.name)
    ) {
      return;
    }

    const jestExt = new JestExt(
      this.context,
      workspaceFolder,
      this.debugConfigurationProvider,
      this.coverageCodeLensProvider
    );
    this.extCache.addItem(jestExt);
    jestExt.startSession();
  }

  deleteExtensionByFolder(workspaceFolder: vscode.WorkspaceFolder): void {
    this.deleteExtension(this.extCache.getItemByFolderName(workspaceFolder.name));
  }
  deleteExtension(extension?: JestExt): void {
    if (extension) {
      extension.deactivate();
      this.extCache.deleteItemByFolder(extension.workspaceFolder);
    }
  }
  deleteAllExtensions(): void {
    const extensions = this.extCache.getAllItems();
    for (const ext of extensions) {
      this.deleteExtension(ext);
    }
  }

  public getByName = (workspaceFolderName: string): JestExt | undefined => {
    return this.extCache.getItemByFolderName(workspaceFolderName);
  };

  public getByDocUri: GetJestExtByURI = (uri: vscode.Uri): JestExt[] => {
    return this.extCache.findRelatedItems(uri) ?? [];
  };
  private getExtensionsByFolder(folder: vscode.WorkspaceFolder): JestExt[] {
    const ext = this.extCache.getItemByFolderName(folder.name);
    if (ext) {
      return [ext];
    }
    return this.extCache.getItemsByActualFolderName(folder.name) ?? [];
  }

  async selectExtension(fromExtensions?: JestExt[]): Promise<JestExt | undefined> {
    const selections = await this.selectExtensions(fromExtensions, false);
    if (selections && selections.length === 1) {
      return selections[0];
    }
  }
  async selectExtensions(
    fromExtensions?: JestExt[],
    canPickMany = true
  ): Promise<JestExt[] | undefined> {
    const extensions = fromExtensions ?? this.extCache.getAllItems();
    if (extensions.length <= 0) {
      return Promise.resolve(undefined);
    }
    if (extensions.length === 1) {
      return Promise.resolve(extensions);
    }
    const pick: string | string[] | undefined = await vscode.window.showQuickPick(
      extensions.map((f) => f.name),
      { canPickMany }
    );
    if (!pick) {
      return undefined;
    }
    return extensions.filter((ext) =>
      typeof pick === 'string' ? ext.name === pick : (pick as string[]).includes(ext.name)
    );
  }

  /**
   * register commands in the context of workspaces
   * @param command
   * @param callback
   * @param thisArg
   */
  registerCommand(command: RegisterCommand, thisArg?: unknown): vscode.Disposable {
    const commandName = `${CommandPrefix[command.type]}.${command.name}`;
    switch (command.type) {
      case 'all-workspaces': {
        return vscode.commands.registerCommand(commandName, async (...args) => {
          this.extCache
            .getAllItems()
            .forEach((extension) => command.callback.call(thisArg, extension, ...args));
        });
      }
      case 'select-workspace': {
        return vscode.commands.registerCommand(commandName, async (...args) => {
          const extensions = await this.selectExtensions();
          extensions?.forEach((ext) => command.callback.call(thisArg, ext, ...args));
        });
      }
      case 'workspace': {
        return vscode.commands.registerCommand(
          commandName,
          async (workspace: vscode.WorkspaceFolder, ...args) => {
            const extensions = this.getExtensionsByFolder(workspace);
            let ext;
            if (extensions.length > 1) {
              ext = await this.selectExtension(extensions);
            } else if (extensions.length === 1) {
              ext = extensions[0];
            }
            if (ext) {
              command.callback.call(thisArg, ext, ...args);
            }
          }
        );
      }
      case 'active-text-editor':
      case 'active-text-editor-workspace': {
        return vscode.commands.registerTextEditorCommand(
          commandName,
          async (editor: vscode.TextEditor, _edit, ...args: unknown[]) => {
            const extensions = this.extCache.findRelatedItems(editor.document.uri);
            if (!extensions || extensions.length === 0) {
              vscode.window.showWarningMessage(
                `No Jest extension activated for this file. Please check your vscode settings.`
              );
              return;
            }
            let targetExt;
            if (extensions.length > 1) {
              targetExt = await this.selectExtensions(extensions);
            } else if (extensions.length === 1) {
              targetExt = extensions;
            }
            targetExt?.forEach((ext) => command.callback.call(thisArg, ext, editor, ...args));
          }
        );
      }
    }
  }

  onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent): void {
    if (!vscode.workspace.workspaceFolders) {
      return;
    }
    let shouldApplySettings = true;
    for (const [idx, workspaceFolder] of vscode.workspace.workspaceFolders.entries()) {
      if (e.affectsConfiguration('jest', workspaceFolder)) {
        if (idx === 0 || shouldApplySettings) {
          this.applySettings();
          shouldApplySettings = false;
        }

        this.getExtensionsByFolder(workspaceFolder).forEach((ext) => ext.triggerUpdateSettings());
      }
    }
  }
  onDidChangeWorkspaceFolders(): void {
    if (this.context.workspaceState.get<boolean>(IgnoreWorkspaceChanges)) {
      return;
    }
    this.applySettings();
  }

  private onExtensionByUri(
    uri: vscode.Uri | readonly vscode.Uri[],
    handler: (ext: JestExt) => unknown
  ): void {
    const uriList = Array.isArray(uri) ? uri : [uri];
    const extension = uriList.flatMap((uri) => this.getByDocUri(uri));
    // dedupe
    const set = new Set(extension);
    set.forEach(handler);
  }
  onDidCloseTextDocument(document: vscode.TextDocument): void {
    this.onExtensionByUri(document.uri, (ext) => ext.onDidCloseTextDocument(document));
  }
  onDidChangeActiveTextEditor(editor?: vscode.TextEditor): void {
    if (editor && editor.document) {
      statusBar.onDidChangeActiveTextEditor(editor);
      this.onExtensionByUri(editor?.document?.uri, (ext) => {
        ext.onDidChangeActiveTextEditor(editor);
      });
    }
  }
  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    this.onExtensionByUri(event.document.uri, (ext) => {
      ext.onDidChangeTextDocument(event);
    });
  }

  onWillSaveTextDocument(event: vscode.TextDocumentWillSaveEvent): void {
    this.onExtensionByUri(event.document.uri, (ext) => {
      ext.onWillSaveTextDocument(event);
    });
  }
  onDidSaveTextDocument(document: vscode.TextDocument): void {
    this.onExtensionByUri(document.uri, (ext) => {
      ext.onDidSaveTextDocument(document);
    });
  }

  onDidCreateFiles(event: vscode.FileCreateEvent): void {
    this.onExtensionByUri(event.files, (ext) => ext.onDidCreateFiles(event));
  }
  onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
    this.onExtensionByUri(event.files, (ext) => ext.onDidDeleteFiles(event));
  }
  onDidRenameFiles(event: vscode.FileRenameEvent): void {
    const files = event.files.reduce((list, f) => {
      list.push(f.newUri, f.oldUri);
      return list;
    }, [] as vscode.Uri[]);
    this.onExtensionByUri(files, (ext) => ext.onDidRenameFiles(event));
  }

  public register(): vscode.Disposable[] {
    return [
      this.registerCommand({
        type: 'all-workspaces',
        name: 'start',
        callback: (extension) => extension.startSession(),
      }),
      this.registerCommand({
        type: 'select-workspace',
        name: 'start',
        callback: (extension) => extension.startSession(),
      }),
      this.registerCommand({
        type: 'all-workspaces',
        name: 'stop',
        callback: (extension) => extension.stopSession(),
      }),
      this.registerCommand({
        type: 'select-workspace',
        name: 'stop',
        callback: (extension) => extension.stopSession(),
      }),
      this.registerCommand({
        type: 'all-workspaces',
        name: 'toggle-coverage',
        callback: (extension) => extension.toggleCoverageOverlay(),
      }),
      this.registerCommand({
        type: 'select-workspace',
        name: 'toggle-coverage',
        callback: (extension) => extension.toggleCoverageOverlay(),
      }),
      this.registerCommand({
        type: 'active-text-editor-workspace',
        name: 'toggle-coverage',
        callback: (extension) => extension.toggleCoverageOverlay(),
      }),
      this.registerCommand({
        type: 'all-workspaces',
        name: 'run-all-tests',
        callback: (extension) => extension.runAllTests(),
      }),
      this.registerCommand({
        type: 'select-workspace',
        name: 'run-all-tests',
        callback: (extension) => extension.runAllTests(),
      }),
      this.registerCommand({
        type: 'active-text-editor-workspace',
        name: 'run-all-tests',
        callback: (extension) => extension.runAllTests(),
      }),
      this.registerCommand({
        type: 'active-text-editor',
        name: 'run-all-tests',
        callback: (extension, editor) => extension.runAllTests(editor),
      }),
      this.registerCommand({
        type: 'active-text-editor',
        name: 'debug-tests',
        callback: (extension, editor, ...identifiers) => {
          extension.debugTests(editor.document, ...identifiers);
        },
      }),
      // with-workspace commands
      this.registerCommand({
        type: 'workspace',
        name: 'toggle-auto-run',
        callback: (extension) => {
          extension.toggleAutoRun();
        },
      }),
      this.registerCommand({
        type: 'workspace',
        name: 'toggle-coverage',
        callback: (extension) => {
          extension.toggleCoverageOverlay();
        },
      }),
      this.registerCommand({
        type: 'workspace',
        name: 'enable-login-shell',
        callback: (extension) => {
          extension.enableLoginShell();
        },
      }),
      this.registerCommand({
        type: 'workspace',
        name: 'item-command',
        callback: (extension, testItem: vscode.TestItem, itemCommand: ItemCommand) => {
          extension.runItemCommand(testItem, itemCommand);
        },
      }),

      // setup tool
      vscode.commands.registerCommand(`${extensionName}.setup-extension`, this.startWizard),

      // this provides the opportunity to inject test names into the DebugConfiguration
      vscode.debug.registerDebugConfigurationProvider('node', this.debugConfigurationProvider),
      // this provides the snippets generation
      vscode.debug.registerDebugConfigurationProvider(
        'vscode-jest-tests',
        this.debugConfigurationProvider
      ),
      vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),

      vscode.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this),

      vscode.workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this),

      vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this),
      vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this),
      vscode.workspace.onDidCreateFiles(this.onDidCreateFiles, this),
      vscode.workspace.onDidRenameFiles(this.onDidRenameFiles, this),
      vscode.workspace.onDidDeleteFiles(this.onDidDeleteFiles, this),
      vscode.workspace.onDidSaveTextDocument(this.onDidSaveTextDocument, this),
      vscode.workspace.onWillSaveTextDocument(this.onWillSaveTextDocument, this),
    ];
  }

  private showReleaseMessage(): void {
    const version = vscode.extensions.getExtension(extensionId)?.packageJSON.version;
    const releaseNote = ReleaseNotes[version];
    if (!releaseNote) {
      return;
    }
    const key = `${extensionId}-${version}-launch`;
    const didLaunch = this.context.globalState.get<boolean>(key, false);
    if (!didLaunch) {
      vscode.window
        .showInformationMessage(
          `vscode-jest has been updated to ${version}.`,
          'See What Is Changed'
        )
        .then((value) => {
          if (value === 'See What Is Changed') {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(releaseNote));
          }
        });
      this.context.globalState.update(key, true);
    }
  }

  activate(): void {
    this.showReleaseMessage();

    if (vscode.window.activeTextEditor?.document.uri) {
      this.onExtensionByUri(vscode.window.activeTextEditor?.document.uri, (ext) => {
        ext.activate();
      });
    }
  }
}

const ReleaseNoteBase = 'https://github.com/jest-community/vscode-jest/blob/master/release-notes';
const ReleaseNotes: Record<string, string> = {
  '5.2.3': `${ReleaseNoteBase}/release-note-v5.x.md#v523`,
  '5.2.2': `${ReleaseNoteBase}/release-note-v5.x.md#v522`,
  '5.2.1': `${ReleaseNoteBase}/release-note-v5.x.md#v521-pre-release`,
  '5.2.0': `${ReleaseNoteBase}/release-note-v5.x.md#v520-pre-release`,
  '5.1.0': `${ReleaseNoteBase}/release-note-v5.x.md#v510`,
  '5.0.4': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.3': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.2': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.1': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.0': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
};
