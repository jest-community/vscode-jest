import * as vscode from 'vscode'
import { ProjectWorkspace } from 'jest-editor-support'
import * as path from 'path'

import { extensionName } from './appGlobals'
import { pathToJest, pathToConfig } from './helpers'
import { JestExt } from './JestExt'
import { IPluginSettings } from './IPluginSettings'
import { registerStatusBar } from './statusBar'
import { registerCoverageCodeLens, registerToggleCoverageOverlay } from './Coverage'

let extensionInstance: JestExt

export function activate(context: vscode.ExtensionContext) {
  // To make us VS Code agnostic outside of this file
  const pluginSettings = getExtensionSettings()
  const jestPath = pathToJest(pluginSettings)
  const configPath = pathToConfig(pluginSettings)
  const currentJestVersion = 20
  const workspace = new ProjectWorkspace(pluginSettings.rootPath, jestPath, configPath, currentJestVersion)

  // Create our own console
  const channel = vscode.window.createOutputChannel('Jest')

  // We need a singleton to represent the extension
  extensionInstance = new JestExt(workspace, channel, pluginSettings)

  const languages = [
    { language: 'javascript' },
    { language: 'javascriptreact' },
    { language: 'typescript' },
    { language: 'typescriptreact' },
  ]
  context.subscriptions.push(
    registerStatusBar(channel),
    vscode.commands.registerTextEditorCommand(`${extensionName}.start`, () => {
      vscode.window.showInformationMessage('Started Jest, press escape to hide this message.')
      extensionInstance.startProcess()
    }),
    vscode.commands.registerTextEditorCommand(`${extensionName}.stop`, () => extensionInstance.stopProcess()),
    vscode.commands.registerTextEditorCommand(`${extensionName}.show-channel`, () => {
      channel.show()
    }),
    ...registerCoverageCodeLens(extensionInstance),
    registerToggleCoverageOverlay(pluginSettings.showCoverageOnLoad),
    vscode.commands.registerCommand(`${extensionName}.run-test`, extensionInstance.runTest),
    vscode.languages.registerCodeLensProvider(languages, extensionInstance.debugCodeLensProvider),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('jest')) {
        const updatedSettings = getExtensionSettings()
        extensionInstance.triggerUpdateSettings(updatedSettings)
      }
    }),

    vscode.workspace.onDidCloseTextDocument(document => {
      extensionInstance.onDidCloseTextDocument(document)
    }),

    vscode.window.onDidChangeActiveTextEditor(extensionInstance.onDidChangeActiveTextEditor, extensionInstance),
    vscode.workspace.onDidChangeTextDocument(extensionInstance.onDidChangeTextDocument, extensionInstance)
  )
}

export function deactivate() {
  extensionInstance.deactivate()
}

function getExtensionSettings(): IPluginSettings {
  const config = vscode.workspace.getConfiguration('jest')
  return {
    autoEnable: config.get<boolean>('autoEnable'),
    pathToConfig: config.get<string>('pathToConfig'),
    pathToJest: config.get<string>('pathToJest'),
    enableCodeLens: config.get<boolean>('enableCodeLens'),
    enableInlineErrorMessages: config.get<boolean>('enableInlineErrorMessages'),
    enableSnapshotUpdateMessages: config.get<boolean>('enableSnapshotUpdateMessages'),
    rootPath: path.join(vscode.workspace.rootPath, config.get<string>('rootPath')),
    runAllTestsFirst: config.get<boolean>('runAllTestsFirst'),
    showCoverageOnLoad: config.get<boolean>('showCoverageOnLoad'),
  }
}
