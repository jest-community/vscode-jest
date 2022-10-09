import * as vscode from 'vscode';
import { JestExt } from './JestExt';
import { DebugCodeLensProvider, TestState } from './DebugCodeLens';
import { DebugConfigurationProvider } from './DebugConfigurationProvider';
import { PluginWindowSettings } from './Settings';
import { statusBar } from './StatusBar';
import { CoverageCodeLensProvider } from './Coverage';
import { extensionId, extensionName } from './appGlobals';

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
      type: 'active-text-editor' | 'active-text-editor-workspace';
      name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (extension: JestExt, textEditor: vscode.TextEditor, ...args: any[]) => any;
    };
type CommandType = RegisterCommand['type'];
const CommandPrefix: Record<CommandType, string> = {
  'all-workspaces': `${extensionName}`,
  'select-workspace': `${extensionName}.workspace`,
  'active-text-editor': `${extensionName}.editor`,
  'active-text-editor-workspace': `${extensionName}.editor.workspace`,
};
export class ExtensionManager {
  debugCodeLensProvider: DebugCodeLensProvider;
  debugConfigurationProvider: DebugConfigurationProvider;
  coverageCodeLensProvider: CoverageCodeLensProvider;

  private extByWorkspace: Map<string, JestExt> = new Map();
  private context: vscode.ExtensionContext;
  private commonPluginSettings: PluginWindowSettings;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    this.commonPluginSettings = getExtensionWindowSettings();

    this.debugConfigurationProvider = new DebugConfigurationProvider();
    this.debugCodeLensProvider = new DebugCodeLensProvider(this.getByDocUri);
    this.coverageCodeLensProvider = new CoverageCodeLensProvider(this.getByDocUri);
    this.applySettings(this.commonPluginSettings);
  }
  applySettings(settings: PluginWindowSettings): void {
    this.commonPluginSettings = settings;
    const { debugCodeLens } = settings;
    this.debugCodeLensProvider.showWhenTestStateIn = debugCodeLens.enabled
      ? debugCodeLens.showWhenTestStateIn
      : [];
    settings.disabledWorkspaceFolders.forEach(this.unregisterByName, this);

    //register workspace folder not in the disable list
    vscode.workspace.workspaceFolders?.forEach((ws) => {
      if (!this.extByWorkspace.get(ws.name)) {
        this.register(ws);
      }
    });
  }
  register(workspaceFolder: vscode.WorkspaceFolder): void {
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

  unregister(workspaceFolder: vscode.WorkspaceFolder): void {
    this.unregisterByName(workspaceFolder.name);
  }
  unregisterByName(name: string): void {
    const extension = this.extByWorkspace.get(name);
    if (extension) {
      extension.deactivate();
      this.extByWorkspace.delete(name);
    }
  }
  unregisterAll(): void {
    const keys = this.extByWorkspace.keys();
    for (const key of keys) {
      this.unregisterByName(key);
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
    if (e.affectsConfiguration('jest')) {
      this.applySettings(getExtensionWindowSettings());
    }
    vscode.workspace.workspaceFolders?.forEach((workspaceFolder) => {
      const jestExt = this.getByName(workspaceFolder.name);
      if (jestExt && e.affectsConfiguration('jest', workspaceFolder.uri)) {
        jestExt.triggerUpdateSettings();
      }
    });
  }
  onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent): void {
    e.added.forEach(this.register, this);
    e.removed.forEach(this.unregister, this);
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
  '5.0.0': `${ReleaseNoteBase}/release-note-v5.md#v500-pre-release`,
};
