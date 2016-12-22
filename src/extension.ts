import * as vscode from 'vscode';
import { ProjectWorkspace } from 'jest-editor-support';

import { pathToJest, pathToConfig } from './helpers';
import { JestExt } from './JestExt';
import { IPluginSettings } from './IPluginSettings';

let extensionInstance: JestExt;

export function activate(context: vscode.ExtensionContext) {
    // To make us VS Code agnostic outside of this file
    const workspaceConfig = vscode.workspace.getConfiguration('jest');
    const pluginSettings: IPluginSettings = {
        autoEnable: workspaceConfig.get<boolean>('autoEnable'),
        pathToConfig: workspaceConfig.get<string>('pathToConfig'),
        pathToJest: workspaceConfig.get<string>('pathToJest'),
        rootPath: vscode.workspace.rootPath
    };
    const jestPath = pathToJest(pluginSettings);
    const configPath = pathToConfig(pluginSettings); 
    const currentJestVersion = 18;
    const workspace = new ProjectWorkspace(pluginSettings.rootPath, jestPath, configPath, currentJestVersion);

    // Create our own console
    const channel = vscode.window.createOutputChannel('Jest');

    // We need a singleton to represent the extension
    extensionInstance = new JestExt(workspace, channel, pluginSettings);

    // Register for commands   
    vscode.commands.registerCommand('io.orta.show-jest-output', () => {
        channel.show();
    });
    vscode.commands.registerTextEditorCommand('io.orta.jest.start', ()=> {
        vscode.window.showInformationMessage('Started Jest, press escape to hide this message.');
        extensionInstance.startProcess();
    });

    vscode.commands.registerTextEditorCommand('io.orta.jest.stop', ()=> {
        extensionInstance.stopProcess();
    });

    // Setup the file change watchers
    let activeEditor = vscode.window.activeTextEditor;

    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;
        if (editor) {
            extensionInstance.triggerUpdateDecorations(activeEditor);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidSaveTextDocument(document => {
        if (document) {
            extensionInstance.triggerUpdateDecorations(vscode.window.activeTextEditor);
        }
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        if (activeEditor && event.document === activeEditor.document) {
            extensionInstance.triggerUpdateDecorations(activeEditor);
        }
    }, null, context.subscriptions);

}

export function deactivate() {
    extensionInstance.deactivate();
}
