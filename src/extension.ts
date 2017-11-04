import * as vscode from 'vscode'
import { ProjectWorkspace } from 'jest-editor-support'
import * as path from 'path'

import { extensionName } from './appGlobals'
import { pathToJest, pathToConfig } from './helpers'
import { JestExt } from './JestExt'
import { IPluginSettings } from './IPluginSettings'
import { registerStatusBar } from './statusBar'
import { registerFileChangeWatchers } from './fileChangeWatchers'
import { registerCoverageCodeLens, registerToggleCoverageOverlay } from './Coverage'
import { initializeTestRunner } from './testRunner'

let extensionInstance: JestExt

export function activate(context: vscode.ExtensionContext) {
  // To make us VS Code agnostic outside of this file
  const workspaceConfig = vscode.workspace.getConfiguration('jest')
  const pluginSettings: IPluginSettings = {
    autoEnable: workspaceConfig.get<boolean>('autoEnable'),
    pathToConfig: workspaceConfig.get<string>('pathToConfig'),
    pathToJest: workspaceConfig.get<string>('pathToJest'),
    enableInlineErrorMessages: workspaceConfig.get<boolean>('enableInlineErrorMessages'),
    enableSnapshotUpdateMessages: workspaceConfig.get<boolean>('enableSnapshotUpdateMessages'),
    rootPath: path.join(vscode.workspace.rootPath, workspaceConfig.get<string>('rootPath')),
  }
  const jestPath = pathToJest(pluginSettings)
  const configPath = pathToConfig(pluginSettings)
  const currentJestVersion = 20
  const workspace = new ProjectWorkspace(pluginSettings.rootPath, jestPath, configPath, currentJestVersion)

  // Create our own console
  const channel = vscode.window.createOutputChannel('Jest')

  // We need a singleton to represent the extension
  extensionInstance = new JestExt(workspace, channel, pluginSettings)

  // wire up test runner ...
  initializeTestRunner(configPath, context, channel, currentJestVersion, workspaceConfig)

  context.subscriptions.push(
    registerStatusBar(channel),
    vscode.commands.registerTextEditorCommand(`${extensionName}.start`, () => {
      vscode.window.showInformationMessage('Started Jest, press escape to hide this message.')
      extensionInstance.startProcess()
    }),
    vscode.commands.registerTextEditorCommand(`${extensionName}.stop`, () => extensionInstance.stopProcess()),
    vscode.commands.registerTextEditorCommand('io.orta.jest.show-channel', () => {
      channel.show()
    }),
    ...registerFileChangeWatchers(extensionInstance),
    ...registerCoverageCodeLens(extensionInstance),
    registerToggleCoverageOverlay()
  )
}

export function deactivate() {
  extensionInstance.deactivate()
}
