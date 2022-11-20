import * as vscode from 'vscode';
import { JestExt } from './JestExt';
import { DebugCodeLensProvider, TestState } from './DebugCodeLens';
import { DebugConfigurationProvider } from './DebugConfigurationProvider';
import { PluginWindowSettings } from './Settings';
import { statusBar } from './StatusBar';
import { CoverageCodeLensProvider } from './Coverage';
import { extensionId, extensionName } from './appGlobals';
import {
  PendingSetupTask,
  PendingSetupTaskKey,
  startWizard,
  StartWizardOptions,
  WizardTaskId,
} from './setup-wizard';

export type GetJestExtByURI = (uri: vscode.Uri) => JestExt | undefined;

export function getExtensionWindowSettings(): PluginWindowSettings {
  const config = vscode.workspace.getConfiguration('jest');

  return {
    debugCodeLens: {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enabled: config.get<boolean>('enableCodeLens')!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      showWhenTestStateIn: config.get<TestState[]>('debugCodeLens.showWhenTestStateIn')!,
    },
    enableSnapshotPreviews: config.get<boolean>('enableSnapshotPreviews'),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    disabledWorkspaceFolders: config.get<string[]>('disabledWorkspaceFolders')!,
  };
}

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
  debugCodeLensProvider: DebugCodeLensProvider;
  debugConfigurationProvider: DebugConfigurationProvider;
  coverageCodeLensProvider: CoverageCodeLensProvider;
  startWizard: StartWizardFunc;

  private extByWorkspace: Map<string, JestExt> = new Map();
  private context: vscode.ExtensionContext;
  private commonPluginSettings: PluginWindowSettings;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    this.commonPluginSettings = getExtensionWindowSettings();

    this.debugConfigurationProvider = new DebugConfigurationProvider();
    this.debugCodeLensProvider = new DebugCodeLensProvider(this.getByDocUri);
    this.coverageCodeLensProvider = new CoverageCodeLensProvider(this.getByDocUri);
    this.startWizard = (options?: StartWizardOptions) =>
      startWizard(this.debugConfigurationProvider, context, options);
    this.applySettings(this.commonPluginSettings);
  }
  private getPendingSetupTask(): WizardTaskId | undefined {
    const task = this.context.globalState.get<PendingSetupTask>(PendingSetupTaskKey);
    if (
      task &&
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders[0].name === task.workspace
    ) {
      return task.taskId;
    }
  }
  applySettings(settings: PluginWindowSettings): void {
    const setupTask = this.getPendingSetupTask();
    if (setupTask) {
      console.warn(
        `setup task ${setupTask} in progress, skip extension activation to resume setup`
      );
      this.startWizard({ taskId: setupTask });
      return;
    }
    this.commonPluginSettings = settings;
    const { debugCodeLens } = settings;
    this.debugCodeLensProvider.showWhenTestStateIn = debugCodeLens.enabled
      ? debugCodeLens.showWhenTestStateIn
      : [];
    settings.disabledWorkspaceFolders.forEach(this.unregisterWorkspaceByName, this);

    //register workspace folder not in the disable list
    vscode.workspace.workspaceFolders?.forEach((ws) => {
      if (!this.extByWorkspace.get(ws.name)) {
        this.registerWorkspace(ws);
      }
    });
  }
  registerWorkspace(workspaceFolder: vscode.WorkspaceFolder): void {
    if (!this.shouldStart(workspaceFolder.name)) {
      return;
    }

    const jestExt = new JestExt(
      this.context,
      workspaceFolder,
      this.debugCodeLensProvider,
      this.debugConfigurationProvider,
      this.coverageCodeLensProvider
    );
    this.extByWorkspace.set(workspaceFolder.name, jestExt);
    jestExt.startSession();
  }

  unregisterWorkspace(workspaceFolder: vscode.WorkspaceFolder): void {
    this.unregisterWorkspaceByName(workspaceFolder.name);
  }
  unregisterWorkspaceByName(name: string): void {
    const extension = this.extByWorkspace.get(name);
    if (extension) {
      extension.deactivate();
      this.extByWorkspace.delete(name);
    }
  }
  unregisterAllWorkspaces(): void {
    const keys = this.extByWorkspace.keys();
    for (const key of keys) {
      this.unregisterWorkspaceByName(key);
    }
  }
  shouldStart(workspaceFolderName: string): boolean {
    const {
      commonPluginSettings: { disabledWorkspaceFolders },
    } = this;
    if (this.extByWorkspace.has(workspaceFolderName)) {
      return false;
    }
    if (disabledWorkspaceFolders.includes(workspaceFolderName)) {
      return false;
    }
    return true;
  }
  public getByName = (workspaceFolderName: string): JestExt | undefined => {
    return this.extByWorkspace.get(workspaceFolderName);
  };
  public getByDocUri: GetJestExtByURI = (uri: vscode.Uri) => {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (workspace) {
      return this.getByName(workspace.name);
    }
  };

  async selectExtension(): Promise<JestExt | undefined> {
    const workspace =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length <= 1
        ? vscode.workspace.workspaceFolders[0]
        : await vscode.window.showWorkspaceFolderPick();

    const instance = workspace && this.getByName(workspace.name);
    if (instance) {
      return instance;
    } else if (workspace) {
      throw new Error(`No Jest instance in ${workspace.name} workspace`);
    }
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
          vscode.workspace.workspaceFolders?.forEach((ws) => {
            const extension = this.getByName(ws.name);
            if (extension) {
              command.callback.call(thisArg, extension, ...args);
            }
          });
        });
      }
      case 'select-workspace': {
        return vscode.commands.registerCommand(commandName, async (...args) => {
          const extension = await this.selectExtension();
          if (extension) {
            command.callback.call(thisArg, extension, ...args);
          }
        });
      }
      case 'workspace': {
        return vscode.commands.registerCommand(
          commandName,
          async (workspace: vscode.WorkspaceFolder, ...args) => {
            const extension = this.getByName(workspace.name);
            if (extension) {
              command.callback.call(thisArg, extension, ...args);
            }
          }
        );
      }
      case 'active-text-editor':
      case 'active-text-editor-workspace': {
        return vscode.commands.registerTextEditorCommand(
          commandName,
          (editor: vscode.TextEditor, _edit, ...args: unknown[]) => {
            const workspace = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            if (!workspace) {
              return;
            }
            const extension = this.getByName(workspace.name);
            if (extension) {
              command.callback.call(thisArg, extension, editor, ...args);
            }
          }
        );
      }
    }
  }

  onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent): void {
    vscode.workspace.workspaceFolders?.forEach((workspaceFolder, idx) => {
      if (e.affectsConfiguration('jest', workspaceFolder.uri)) {
        if (idx === 0) {
          this.applySettings(getExtensionWindowSettings());
        }
        this.getByName(workspaceFolder.name)?.triggerUpdateSettings();
      }
    });
  }
  onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent): void {
    e.added.forEach(this.registerWorkspace, this);
    e.removed.forEach(this.unregisterWorkspace, this);
  }
  onDidCloseTextDocument(document: vscode.TextDocument): void {
    const ext = this.getByDocUri(document.uri);
    if (ext) {
      ext.onDidCloseTextDocument(document);
    }
  }
  onDidChangeActiveTextEditor(editor?: vscode.TextEditor): void {
    if (editor && editor.document) {
      statusBar.onDidChangeActiveTextEditor(editor);
      const ext = this.getByDocUri(editor.document.uri);
      if (ext) {
        ext.onDidChangeActiveTextEditor(editor);
      }
    }
  }
  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    const ext = this.getByDocUri(event.document.uri);
    if (ext) {
      ext.onDidChangeTextDocument(event);
    }
  }

  onWillSaveTextDocument(event: vscode.TextDocumentWillSaveEvent): void {
    const ext = this.getByDocUri(event.document.uri);
    if (ext) {
      ext.onWillSaveTextDocument(event);
    }
  }
  onDidSaveTextDocument(document: vscode.TextDocument): void {
    const ext = this.getByDocUri(document.uri);
    if (ext) {
      ext.onDidSaveTextDocument(document);
    }
  }
  private onFilesChange(files: readonly vscode.Uri[], handler: (ext: JestExt) => void) {
    const exts = files.map((f) => this.getByDocUri(f)).filter((ext) => ext != null) as JestExt[];
    const set = new Set<JestExt>(exts);
    set.forEach(handler);
  }

  onDidCreateFiles(event: vscode.FileCreateEvent): void {
    this.onFilesChange(event.files, (ext) => ext.onDidCreateFiles(event));
  }
  onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
    this.onFilesChange(event.files, (ext) => ext.onDidDeleteFiles(event));
  }
  onDidRenameFiles(event: vscode.FileRenameEvent): void {
    const files = event.files.reduce((list, f) => {
      list.push(f.newUri, f.oldUri);
      return list;
    }, [] as vscode.Uri[]);
    this.onFilesChange(files, (ext) => ext.onDidRenameFiles(event));
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
      const ext = this.getByDocUri(vscode.window.activeTextEditor.document.uri);
      if (ext) {
        ext.activate();
      }
    }
  }
}

const ReleaseNoteBase = 'https://github.com/jest-community/vscode-jest/blob/master/release-notes';
const ReleaseNotes: Record<string, string> = {
  '5.0.3': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.2': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.1': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
  '5.0.0': `${ReleaseNoteBase}/release-note-v5.md#v50-pre-release-roll-up`,
};
