import * as vscode from 'vscode';
import { ProjectWorkspace } from 'jest-editor-support';

import { extensionName } from './appGlobals';
import { pathToJest, pathToConfig } from './helpers';
import { JestExt } from './JestExt';
import { IPluginSettings } from './IPluginSettings'; 
import { registerStatusBar } from './statusBar';
import { registerFileChangeWatchers } from './fileChangeWatchers';

let extensionInstance: JestExt;

export function activate(context: vscode.ExtensionContext) {
    // To make us VS Code agnostic outside of this file
    const workspaceConfig = vscode.workspace.getConfiguration('jest');
    const pluginSettings: IPluginSettings = {
        autoEnable: workspaceConfig.get<boolean>('autoEnable'),
        pathToConfig: workspaceConfig.get<string>('pathToConfig'),
        pathToJest: workspaceConfig.get<string>('pathToJest'),
        enableInlineErrorMessages: workspaceConfig.get<boolean>('enableInlineErrorMessages'),
        rootPath: vscode.workspace.rootPath,
    };

    const jestPath = pathToJest(pluginSettings);
    const configPath = pathToConfig(pluginSettings); 
    const currentJestVersion = 18;
    const workspace = new ProjectWorkspace(pluginSettings.rootPath, jestPath, configPath, currentJestVersion);

    // Create our own console
    const channel = vscode.window.createOutputChannel('Jest');

    // We need a singleton to represent the extension
    extensionInstance = new JestExt(workspace, channel, pluginSettings);

    context.subscriptions.push(
        registerStatusBar(channel),
        vscode.commands.registerTextEditorCommand(
            `${extensionName}.start`,
            () => {
                vscode.window.showInformationMessage('Started Jest, press escape to hide this message.');
                extensionInstance.startProcess();
            },
        ),
        vscode.commands.registerTextEditorCommand(
            `${extensionName}.stop`,
            () => extensionInstance.stopProcess(),
        ),
        vscode.commands.registerTextEditorCommand('io.orta.jest.show-channel', ()=> {
            channel.show();
        }),
        ...registerFileChangeWatchers(extensionInstance),
    );
}

export function deactivate() {
    extensionInstance.deactivate();
}
