import * as vscode from 'vscode'
import * as path from 'path'
import { ProjectWorkspace } from 'jest-editor-support'
import { pathToJest, pathToConfig } from './helpers'
import { JestExt } from './JestExt'
import { DebugCodeLensProvider, TestState } from './DebugCodeLens'
import { DebugConfigurationProvider } from './DebugConfigurationProvider'
import { IPluginResourceSettings, IPluginWindowSettings } from './Settings'
import { statusBar } from './StatusBar'

export type GetJestExtByURI = (uri: vscode.Uri) => JestExt | undefined

export class ExtensionManager {
  debugCodeLensProvider: DebugCodeLensProvider
  debugConfigurationProvider: DebugConfigurationProvider

  private extByWorkspace: Map<string, JestExt> = new Map()
  private context: vscode.ExtensionContext
  private commonPluginSettings: IPluginWindowSettings

  constructor(context: vscode.ExtensionContext) {
    this.context = context

    this.commonPluginSettings = getExtensionWindowSettings()

    this.debugConfigurationProvider = new DebugConfigurationProvider()
    this.debugCodeLensProvider = new DebugCodeLensProvider(uri => this.getByDocUri(uri))
    this.applySettings(getExtensionWindowSettings())
    this.registerAll()
  }
  applySettings(settings: IPluginWindowSettings) {
    this.commonPluginSettings = settings
    const { debugCodeLens } = settings
    this.debugCodeLensProvider.showWhenTestStateIn = debugCodeLens.enabled ? debugCodeLens.showWhenTestStateIn : []
    settings.disabledWorkspaceFolders.forEach(this.unregisterByName, this)
  }
  register(workspaceFolder: vscode.WorkspaceFolder) {
    if (!this.shouldStart(workspaceFolder.name)) {
      return
    }
    const pluginSettings = getExtensionResourceSettings(workspaceFolder.uri)
    const jestPath = pathToJest(pluginSettings)
    const configPath = pathToConfig(pluginSettings)
    const currentJestVersion = 20
    const debugMode = pluginSettings.debugMode
    const instanceSettings = {
      multirootEnv: vscode.workspace.workspaceFolders.length > 1,
    }
    const jestWorkspace = new ProjectWorkspace(
      pluginSettings.rootPath,
      jestPath,
      configPath,
      currentJestVersion,
      workspaceFolder.name,
      null,
      debugMode
    )

    // Create our own console
    const channel = vscode.window.createOutputChannel(`Jest (${workspaceFolder.name})`)

    const failDiagnostics = vscode.languages.createDiagnosticCollection(`Jest (${workspaceFolder.name})`)

    this.extByWorkspace.set(
      workspaceFolder.name,
      new JestExt(
        this.context,
        workspaceFolder,
        jestWorkspace,
        channel,
        pluginSettings,
        this.debugCodeLensProvider,
        this.debugConfigurationProvider,
        failDiagnostics,
        instanceSettings
      )
    )
  }
  registerAll() {
    vscode.workspace.workspaceFolders.forEach(this.register, this)
  }
  unregister(workspaceFolder: vscode.WorkspaceFolder) {
    this.unregisterByName(workspaceFolder.name)
  }
  unregisterByName(name: string) {
    const extension = this.extByWorkspace.get(name)
    if (extension) {
      extension.deactivate()
      this.extByWorkspace.delete(name)
    }
  }
  unregisterAll() {
    const keys = this.extByWorkspace.keys()
    for (const key of keys) {
      this.unregisterByName(key)
    }
  }
  shouldStart(workspaceFolderName: string): boolean {
    const {
      commonPluginSettings: { disabledWorkspaceFolders },
    } = this
    if (this.extByWorkspace.has(workspaceFolderName)) {
      return false
    }
    if (disabledWorkspaceFolders.includes(workspaceFolderName)) {
      return false
    }
    return true
  }
  getByName(workspaceFolderName: string) {
    return this.extByWorkspace.get(workspaceFolderName)
  }
  public getByDocUri: GetJestExtByURI = (uri: vscode.Uri) => {
    const workspace = vscode.workspace.getWorkspaceFolder(uri)
    if (workspace) {
      return this.getByName(workspace.name)
    }
  }
  async get() {
    const workspace =
      vscode.workspace.workspaceFolders.length <= 1
        ? vscode.workspace.workspaceFolders[0]
        : await vscode.window.showWorkspaceFolderPick()

    const instance = workspace && this.getByName(workspace.name)
    if (instance) {
      return instance
    } else if (workspace) {
      throw new Error(`No Jest instance in ${workspace.name} workspace`)
    }
  }
  registerCommand(command: string, callback: (extension: JestExt, ...args: any[]) => any, thisArg?: any) {
    return vscode.commands.registerCommand(command, async (...args) => {
      const extension = await this.get()
      if (extension) {
        callback.call(thisArg, extension, ...args)
      }
    })
  }
  onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
    if (e.affectsConfiguration('jest')) {
      this.applySettings(getExtensionWindowSettings())
      this.registerAll()
    }
    vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
      const jestExt = this.getByName(workspaceFolder.name)
      if (jestExt && e.affectsConfiguration('jest', workspaceFolder.uri)) {
        const updatedSettings = getExtensionResourceSettings(workspaceFolder.uri)
        jestExt.triggerUpdateSettings(updatedSettings)
      }
    })
  }
  onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent) {
    e.added.forEach(this.register, this)
    e.removed.forEach(this.unregister, this)
  }
  onDidCloseTextDocument(document: vscode.TextDocument) {
    const ext = this.getByDocUri(document.uri)
    if (ext) {
      ext.onDidCloseTextDocument(document)
    }
  }
  onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    if (editor && editor.document) {
      statusBar.onDidChangeActiveTextEditor(editor)
      const ext = this.getByDocUri(editor.document.uri)
      if (ext) {
        ext.onDidChangeActiveTextEditor(editor)
      }
    }
  }
  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    const ext = this.getByDocUri(event.document.uri)
    if (ext) {
      ext.onDidChangeTextDocument(event)
    }
  }
}

export function getExtensionResourceSettings(uri: vscode.Uri): IPluginResourceSettings {
  const config = vscode.workspace.getConfiguration('jest', uri)
  return {
    autoEnable: config.get<boolean>('autoEnable'),
    enableInlineErrorMessages: config.get<boolean>('enableInlineErrorMessages'),
    enableSnapshotUpdateMessages: config.get<boolean>('enableSnapshotUpdateMessages'),
    pathToConfig: config.get<string>('pathToConfig'),
    pathToJest: config.get<string>('pathToJest'),
    restartJestOnSnapshotUpdate: config.get<boolean>('restartJestOnSnapshotUpdate'),
    rootPath: path.join(uri.fsPath, config.get<string>('rootPath')),
    runAllTestsFirst: config.get<boolean>('runAllTestsFirst'),
    showCoverageOnLoad: config.get<boolean>('showCoverageOnLoad'),
    coverageFormatter: config.get<string>('coverageFormatter'),
    debugMode: config.get<boolean>('debugMode'),
  }
}

export function getExtensionWindowSettings(): IPluginWindowSettings {
  const config = vscode.workspace.getConfiguration('jest')
  return {
    debugCodeLens: {
      enabled: config.get<boolean>('enableCodeLens'),
      showWhenTestStateIn: config.get<TestState[]>('debugCodeLens.showWhenTestStateIn'),
    },
    enableSnapshotPreviews: config.get<boolean>('enableSnapshotPreviews'),
    disabledWorkspaceFolders: config.get<string[]>('disabledWorkspaceFolders'),
  }
}
