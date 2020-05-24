jest.unmock('../src/extensionManager');

const jestInstance = {
  deactivate: jest.fn(),
  onDidCloseTextDocument: jest.fn(),
  onDidChangeActiveTextEditor: jest.fn(),
  onDidChangeTextDocument: jest.fn(),
};

jest.mock('../src/JestExt', () => ({
  JestExt: jest.fn().mockImplementation(() => jestInstance),
}));

import * as vscode from 'vscode';
import {
  ExtensionManager,
  getExtensionResourceSettings,
  getExtensionWindowSettings,
} from '../src/extensionManager';
import { TestState } from '../src/DebugCodeLens';
import { readFileSync } from 'fs';
import { PluginWindowSettings } from '../src/Settings';

vscode.workspace.getConfiguration = jest.fn().mockImplementation((section) => {
  const data = readFileSync('./package.json');
  const config = JSON.parse(data.toString()).contributes.configuration.properties;

  const defaults = {};
  for (const key of Object.keys(config)) {
    if (section.length === 0 || key.startsWith(`${section}.`)) {
      defaults[key] = config[key].default;
    }
  }

  return {
    get: jest.fn().mockImplementation((key) => defaults[`${section}.${key}`]),
  };
});

describe('InstancesManager', () => {
  let extensionManager: ExtensionManager;
  const registerInstance = (folderName: string) => {
    extensionManager.register({ name: folderName, uri: { fsPath: folderName } } as any);
  };
  const registerSpy = jest.spyOn(ExtensionManager.prototype, 'register');
  const unregisterSpy = jest.spyOn(ExtensionManager.prototype, 'unregister');

  beforeEach(() => {
    extensionManager = new ExtensionManager({} as any);
    registerSpy.mockClear();
    unregisterSpy.mockClear();
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: 'workspaceFolder1' }, name: 'workspaceFolder1' },
    ] as any;
    (jestInstance.deactivate as any).mockReset();
    (vscode.window.showWorkspaceFolderPick as any).mockReset();
    (vscode.commands.registerCommand as any).mockReset();
  });

  describe('constructor()', () => {
    it('should register extensions for all wrokspace folders', () => {
      new ExtensionManager({} as any);
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('applySettings()', () => {
    it('should save settings to instance', () => {
      const newSettings: PluginWindowSettings = {
        debugCodeLens: {
          enabled: true,
          showWhenTestStateIn: [],
        },
        disabledWorkspaceFolders: [],
      };
      extensionManager.applySettings(newSettings);
      expect((extensionManager as any).commonPluginSettings).toEqual(newSettings);
    });
    it('should update debugCodeLensProvider instance', () => {
      const newSettings: PluginWindowSettings = {
        debugCodeLens: {
          enabled: true,
          showWhenTestStateIn: [TestState.Fail],
        },
        disabledWorkspaceFolders: ['workspaceFolder1'],
      };
      extensionManager.applySettings(newSettings);
      expect((extensionManager as any).debugCodeLensProvider.showWhenTestStateIn).toEqual(
        newSettings.debugCodeLens.showWhenTestStateIn
      );
    });

    it('should respect disabledWorkspaceFolders', () => {
      registerInstance('workspaceFolder1');
      registerInstance('workspaceFolder2');

      expect(extensionManager.getByName('workspaceFolder1')).toBeDefined();
      expect(extensionManager.getByName('workspaceFolder2')).toBeDefined();
      const newSettings: PluginWindowSettings = {
        debugCodeLens: {
          enabled: true,
          showWhenTestStateIn: [],
        },
        disabledWorkspaceFolders: ['workspaceFolder1'],
      };
      extensionManager.applySettings(newSettings);
      expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
      expect(extensionManager.getByName('workspaceFolder2')).toBeDefined();
    });
  });

  describe('register()', () => {
    it('should register an instance', () => {
      registerInstance('workspaceFolder1');
      expect(extensionManager.getByName('workspaceFolder1')).toBe(jestInstance);
    });
  });

  describe('unregister()', () => {
    it('should unregister instance by wokspaceFolder', () => {
      registerInstance('workspaceFolder1');
      extensionManager.unregister({ name: 'workspaceFolder1' } as any);
      expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
      expect(jestInstance.deactivate).toHaveBeenCalled();
    });
  });

  describe('unregisterByName()', () => {
    it('should unregister instance by wokspaceFolder name', () => {
      registerInstance('workspaceFolder1');
      extensionManager.unregisterByName('workspaceFolder1');
      expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
      expect(jestInstance.deactivate).toHaveBeenCalled();
    });
  });

  describe('unregisterAll()', () => {
    it('should unregister all instances', () => {
      registerInstance('workspaceFolder1');
      registerInstance('workspaceFolder2');
      extensionManager.unregisterAll();
      expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
      expect(extensionManager.getByName('workspaceFolder2')).toBeUndefined();
      expect(jestInstance.deactivate).toHaveBeenCalledTimes(2);
    });
  });

  describe('shouldStart()', () => {
    it('should check whether instance already started', () => {
      registerInstance('workspaceFolder1');
      expect(extensionManager.shouldStart('workspaceFolder1')).toEqual(false);
      expect(extensionManager.shouldStart('workspaceFolder2')).toEqual(true);
    });
    it('should check if folder is in disabledFolderNames', () => {
      (extensionManager as any).commonPluginSettings.disabledWorkspaceFolders = [
        'workspaceFolder2',
      ];
      expect(extensionManager.shouldStart('workspaceFolder2')).toEqual(false);
      expect(extensionManager.shouldStart('workspaceFolder3')).toEqual(true);
    });
  });

  describe('getByName()', () => {
    it('should return extension', () => {
      registerInstance('workspaceFolder1');
      expect(extensionManager.getByName('workspaceFolder1')).toBe(jestInstance);
      expect(extensionManager.getByName('workspaceFolder2')).toBeUndefined();
    });
  });

  describe('getByDocUri()', () => {
    it('should return extension', async () => {
      registerInstance('workspaceFolder1');
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
        name: 'workspaceFolder1',
      });
      expect(extensionManager.getByDocUri(null)).toBe(jestInstance);
    });
    it('should return undefined if no workspace found for uri', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
      expect(extensionManager.getByDocUri(null)).toBeUndefined();
    });
  });

  describe('get()', () => {
    afterEach(() => {
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: 'workspaceFolder1' }, name: 'workspaceFolder1' },
      ] as any;
    });

    it('should return extension at once if there is only one workspace folder', async () => {
      registerInstance('workspaceFolder1');
      expect(await extensionManager.get()).toBe(jestInstance);
    });

    it('should prompt for workspace if there are more then one workspace folder', async () => {
      registerInstance('workspaceFolder1');
      (vscode.workspace as any).workspaceFolders = [
        { name: 'workspaceFolder1' },
        { name: 'workspaceFolder2' },
      ] as any;
      (vscode.window.showWorkspaceFolderPick as any).mockReturnValue({ name: 'workspaceFolder1' });
      expect(await extensionManager.get()).toBe(jestInstance);
      expect(vscode.window.showWorkspaceFolderPick).toHaveBeenCalled();
    });

    it('should return undefined if no workspace selected', async () => {
      (vscode.workspace as any).workspaceFolders = [
        { name: 'workspaceFolder1' },
        { name: 'workspaceFolder2' },
      ] as any;
      (vscode.window.showWorkspaceFolderPick as any).mockReturnValue(undefined);
      expect(await extensionManager.get()).toBeUndefined();
    });

    it('should throw if no jest instance found for workspace', async () => {
      extensionManager.getByName = jest.fn().mockReturnValue(undefined);
      let error;
      try {
        await extensionManager.get();
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
    });
  });

  describe('registerCommand()', () => {
    it('should register command and preserve context', async () => {
      const command = 'command';
      const thisArg = {};
      const callback = jest.fn(function () {
        expect(this).toBe(thisArg);
      });
      (vscode.commands.registerCommand as any).mockImplementation((_command, _callback) => {
        expect(_command).toBe(command);
        expect(_callback).toBeDefined();
        return _callback;
      });
      const callbackWrap = extensionManager.registerCommand(command, callback, thisArg) as any;
      await callbackWrap();
      expect(callback).toHaveBeenCalled();
      expect(vscode.commands.registerCommand).toHaveBeenCalled();
    });

    it('should pass jest instance before other arguments to callback', async () => {
      registerInstance('workspaceFolder1');
      const arg0 = 'arg0';
      const callback = jest.fn();
      (vscode.commands.registerCommand as any).mockImplementation(async (_command, _callback) => {
        await _callback(arg0);
      });
      await extensionManager.registerCommand('command', callback);
      expect(callback).toHaveBeenCalledWith(jestInstance, arg0);
    });
  });

  describe('onDidChangeConfiguration()', () => {
    it('checks if changes affects jest', () => {
      const arg = {
        affectsConfiguration: jest.fn(),
      };
      extensionManager.onDidChangeConfiguration(arg);
      expect(arg.affectsConfiguration).toHaveBeenCalled();
    });

    it('checks configuration for every workspace', () => {
      const arg = {
        affectsConfiguration: jest.fn(),
      };
      extensionManager.onDidChangeConfiguration(arg);
      // 1 for window settings + 1 for workspace folder
      expect(arg.affectsConfiguration).toHaveBeenCalledTimes(2);
    });
  });

  describe('onDidChangeWorkspaceFolders()', () => {
    it('should register all new folders', () => {
      extensionManager.onDidChangeWorkspaceFolders({
        added: [{ name: 'wokspaceFolderAdded', uri: { fsPath: 'wokspaceFolderAdded' } }],
        removed: [],
      } as any);
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });

    it('should unregister all removed folders', () => {
      registerInstance('wokspaceFolderAdded');
      extensionManager.onDidChangeWorkspaceFolders({
        added: [],
        removed: [{ name: 'wokspaceFolderAdded', uri: { fsPath: 'wokspaceFolderAdded' } }],
      } as any);
      expect(unregisterSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDidCloseTextDocument()', () => {
    afterEach(() => {
      jestInstance.onDidCloseTextDocument.mockClear();
    });
    it('should call extension method', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
        name: 'workspaceFolder1',
      });
      extensionManager.onDidCloseTextDocument({} as any);
      expect(jestInstance.onDidCloseTextDocument).toHaveBeenCalled();
    });

    it('should not call try to call extension method if no extension', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
      extensionManager.onDidCloseTextDocument({} as any);
      expect(jestInstance.onDidCloseTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('onDidChangeActiveTextEditor()', () => {
    afterEach(() => {
      jestInstance.onDidChangeActiveTextEditor.mockClear();
    });
    it('should call extension method', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
        name: 'workspaceFolder1',
      });
      extensionManager.onDidChangeActiveTextEditor({ document: {} } as any);
      expect(jestInstance.onDidChangeActiveTextEditor).toHaveBeenCalled();
    });

    it('should not call try to call extension method if no document', () => {
      extensionManager.onDidChangeActiveTextEditor({} as any);
      expect(jestInstance.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
    });

    it('should not call try to call extension method if no extension', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
      extensionManager.onDidChangeActiveTextEditor({ document: {} } as any);
      expect(jestInstance.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
    });
  });

  describe('onDidChangeTextDocument()', () => {
    afterEach(() => {
      jestInstance.onDidChangeTextDocument.mockClear();
    });
    it('should call extension method', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
        name: 'workspaceFolder1',
      });
      extensionManager.onDidChangeTextDocument({ document: {} } as any);
      expect(jestInstance.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should not call try to call extension method if no extension', () => {
      (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
      extensionManager.onDidChangeTextDocument({ document: {} } as any);
      expect(jestInstance.onDidChangeTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('getExtensionResourceSettings()', () => {
    it('should return the extension resource configuration', async () => {
      expect(getExtensionResourceSettings(vscode.workspace.workspaceFolders[0].uri)).toEqual({
        autoEnable: true,
        coverageFormatter: 'DefaultFormatter',
        enableInlineErrorMessages: false,
        enableSnapshotUpdateMessages: true,
        pathToConfig: '',
        pathToJest: null,
        restartJestOnSnapshotUpdate: false,
        rootPath: 'workspaceFolder1',
        runAllTestsFirst: true,
        showCoverageOnLoad: false,
        debugMode: false,
      });
    });
  });

  describe('getExtensionWindowSettings()', () => {
    it('should return the extension window configuration', async () => {
      expect(getExtensionWindowSettings()).toEqual({
        debugCodeLens: {
          enabled: true,
          showWhenTestStateIn: [TestState.Fail, TestState.Unknown],
        },
        enableSnapshotPreviews: true,
        disabledWorkspaceFolders: [],
      });
    });
  });
});
