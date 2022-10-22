jest.unmock('../src/extensionManager');
jest.unmock('../src/appGlobals');

import * as vscode from 'vscode';
import {
  addFolderToDisabledWorkspaceFolders,
  ExtensionManager,
  getExtensionWindowSettings,
} from '../src/extensionManager';
import { DebugCodeLensProvider, TestState } from '../src/DebugCodeLens';
import { readFileSync } from 'fs';
import { PluginWindowSettings } from '../src/Settings';
import { extensionName } from '../src/appGlobals';
import { JestExt } from '../src/JestExt';
import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import { CoverageCodeLensProvider } from '../src/Coverage';
import { startWizard } from '../src/setup-wizard';

const updateConfigurationMock = jest.fn();

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
    update: updateConfigurationMock,
  };
});

const makeJestExt = (workspace: vscode.WorkspaceFolder): any => {
  return {
    deactivate: jest.fn(),
    activate: jest.fn(),
    onDidCloseTextDocument: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn(),
    onDidChangeTextDocument: jest.fn(),
    startSession: jest.fn(),
    onDidCreateFiles: jest.fn(),
    onDidRenameFiles: jest.fn(),
    onDidDeleteFiles: jest.fn(),
    onDidSaveTextDocument: jest.fn(),
    onWillSaveTextDocument: jest.fn(),
    triggerUpdateSettings: jest.fn(),
    workspace,
  };
};
const makeWorkspaceFolder = (name: string): any => ({ uri: { fsPath: name }, name });
const makeEditor = (name: string): any => ({ document: { uri: name, fileName: name } });
const mockJestExt = () => {
  (JestExt as jest.Mocked<any>).mockImplementation((...args: any[]) => {
    return makeJestExt(args[1]);
  });
};
const createExtensionContext = () => ({
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
  },
});
const createExtensionManager = (workspaceFolders: string[], context?: any): ExtensionManager => {
  (vscode.workspace as any).workspaceFolders =
    workspaceFolders?.map((f) => makeWorkspaceFolder(f)) ?? [];

  (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) => {
    return vscode.workspace.workspaceFolders.find((ws) => ws.name === uri);
  });
  mockJestExt();
  const extensionContext = context ?? createExtensionContext();
  const em = new ExtensionManager(extensionContext);
  vscode.workspace.workspaceFolders.forEach((ws) => em.register(ws));
  return em;
};

describe('ExtensionManager', () => {
  const jestInstance = makeJestExt(makeWorkspaceFolder('workspace-1'));
  let context;
  let extensionManager: ExtensionManager;
  const registerInstance = (folderName: string) => {
    extensionManager.register(makeWorkspaceFolder(folderName));
  };
  const registerSpy = jest.spyOn(ExtensionManager.prototype, 'register');
  const unregisterSpy = jest.spyOn(ExtensionManager.prototype, 'unregister');

  beforeEach(() => {
    jest.clearAllMocks();
    (JestExt as jest.Mocked<any>).mockImplementation(() => jestInstance);
    context = createExtensionContext();
    (vscode.workspace as any).workspaceFolders = [makeWorkspaceFolder('workspaceFolder1')];
  });

  describe('constructor()', () => {
    it('should register extensions for all wrokspace folders', () => {
      new ExtensionManager(context);
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });
    it('should created the components shared across of all workspaces', () => {
      new ExtensionManager(context);
      expect(DebugConfigurationProvider).toHaveBeenCalled();
      expect(DebugCodeLensProvider).toHaveBeenCalled();
      expect(CoverageCodeLensProvider).toHaveBeenCalled();
    });
  });
  describe('upon pending monorepo setup task', () => {
    beforeEach(() => {});
    it('will skip jest run and resume setup task instead', () => {
      context.globalState.get.mockReturnValue({
        workspace: 'workspaceFolder1',
        taskId: 'monorepo',
      });
      new ExtensionManager(context);
      expect(registerSpy).not.toHaveBeenCalled();

      expect(startWizard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ taskId: 'monorepo' })
      );
    });
    it('if pending task is not for the given root folder, all will continue as usual', () => {
      context.globalState.get.mockReturnValue({
        workspace: 'something else',
        taskId: 'monorepo',
      });
      new ExtensionManager(context);
      expect(registerSpy).toHaveBeenCalled();
    });
  });
  describe('with an extensionManager', () => {
    beforeEach(() => {
      extensionManager = new ExtensionManager(context);
      registerSpy.mockClear();
      unregisterSpy.mockClear();
      (vscode.window.showWorkspaceFolderPick as any).mockReset();
      (vscode.commands.registerCommand as any).mockReset();
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
      it('will register workspace not in disable list', () => {
        expect(extensionManager.getByName('workspaceFolder1')).not.toBeUndefined();

        const newSettings: PluginWindowSettings = {
          debugCodeLens: {
            enabled: true,
            showWhenTestStateIn: [],
          },
          disabledWorkspaceFolders: ['workspaceFolder1'],
        };
        extensionManager.applySettings(newSettings);
        expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();

        newSettings.disabledWorkspaceFolders = [];
        extensionManager.applySettings(newSettings);

        expect(extensionManager.getByName('workspaceFolder1')).not.toBeUndefined();
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

    describe('selectExtension()', () => {
      afterEach(() => {
        (vscode.workspace as any).workspaceFolders = [makeWorkspaceFolder('workspaceFolder1')];
      });

      it('should return extension at once if there is only one workspace folder', async () => {
        registerInstance('workspaceFolder1');
        expect(await extensionManager.selectExtension()).toBe(jestInstance);
      });

      it('should prompt for workspace if there are more then one workspace folder', async () => {
        registerInstance('workspaceFolder1');
        (vscode.workspace as any).workspaceFolders = [
          makeWorkspaceFolder('workspaceFolder1'),
          makeWorkspaceFolder('workspaceFolder2'),
        ];
        (vscode.window.showWorkspaceFolderPick as any).mockReturnValue({
          name: 'workspaceFolder1',
        });
        expect(await extensionManager.selectExtension()).toBe(jestInstance);
        expect(vscode.window.showWorkspaceFolderPick).toHaveBeenCalled();
      });

      it('should return undefined if no workspace selected', async () => {
        (vscode.workspace as any).workspaceFolders = [
          { name: 'workspaceFolder1' },
          { name: 'workspaceFolder2' },
        ] as any;
        (vscode.window.showWorkspaceFolderPick as any).mockReturnValue(undefined);
        expect(await extensionManager.selectExtension()).toBeUndefined();
      });

      it('should throw if no jest instance found for workspace', async () => {
        extensionManager.getByName = jest.fn().mockReturnValue(undefined);
        let error;
        try {
          await extensionManager.selectExtension();
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
      });
    });

    describe('registerCommand()', () => {
      describe('non-editor specific commands', () => {
        it.each`
          type                  | expectedNamePrefix
          ${'all-workspaces'}   | ${`${extensionName}`}
          ${'select-workspace'} | ${`${extensionName}.workspace`}
        `('can generate command id by $type', ({ type, expectedNamePrefix }) => {
          extensionManager.registerCommand({ type, name: 'something', callback: jest.fn() });
          expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            `${expectedNamePrefix}.something`,
            expect.anything()
          );
        });
        it('can execute command for all workspaces', () => {
          const callback = jest.fn();
          const someObject = {};

          // recreate extensionManager with new workspaceFolders
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
          jest.clearAllMocks();

          extensionManager.registerCommand(
            { type: 'all-workspaces', name: 'something', callback },
            someObject
          );
          const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
            .calls[0][1];
          registeredCallback('addtional argument');

          expect(callback).toHaveBeenCalledTimes(vscode.workspace.workspaceFolders.length);
          ['ws-1', 'ws-2'].forEach((ws) =>
            expect(callback).toHaveBeenCalledWith(
              extensionManager.getByName(ws),
              'addtional argument'
            )
          );
        });
        it('can execute command for the selected workspace', async () => {
          const callback = jest.fn();
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
          jest.clearAllMocks();

          (vscode.window.showWorkspaceFolderPick as jest.Mocked<any>).mockImplementation(() =>
            Promise.resolve(vscode.workspace.workspaceFolders[1])
          );

          extensionManager.registerCommand({
            type: 'select-workspace',
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
            .calls[0][1];
          await registeredCallback('arg1', 2);
          expect(vscode.window.showWorkspaceFolderPick).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(extensionManager.getByName('ws-2'), 'arg1', 2);
        });
      });
      describe.each`
        type                              | expectedNamePrefix
        ${'active-text-editor'}           | ${`${extensionName}.editor`}
        ${'active-text-editor-workspace'} | ${`${extensionName}.editor.workspace`}
      `('editor specific command type: $type', ({ type, expectedNamePrefix }) => {
        const callback = jest.fn();
        const editor = makeEditor('ws-1');
        beforeEach(() => {
          // recreate extensionManager with new workspaceFolders
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
          jest.clearAllMocks();
        });
        it('can generate command id by type', () => {
          extensionManager.registerCommand({ type, name: 'something', callback: jest.fn() });
          expect(vscode.commands.registerTextEditorCommand).toHaveBeenCalledWith(
            expect.stringContaining(expectedNamePrefix),
            expect.anything()
          );
        });
        it('can execute command with the active text editor', () => {
          extensionManager.registerCommand({
            type,
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerTextEditorCommand as jest.Mocked<any>)
            .mock.calls[0][1];

          registeredCallback(editor, {}, 'addtional argument');
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(
            extensionManager.getByName('ws-1'),
            editor,
            'addtional argument'
          );
        });
        it('can skip command if active workspace is unknown', () => {
          (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockReturnValue(undefined);

          extensionManager.registerCommand({
            type,
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerTextEditorCommand as jest.Mocked<any>)
            .mock.calls[0][1];

          registeredCallback(editor, {}, 'addtional argument');
          expect(callback).not.toHaveBeenCalled();
        });
      });
    });

    describe('onDidChangeConfiguration()', () => {
      let applySettingsSpy;
      let ws1Ext;
      let ws2Ext;
      const mockEvent = (value: boolean | string[]): any => {
        const affectsConfiguration =
          typeof value === 'boolean'
            ? jest.fn(() => value)
            : jest.fn((_, uri) => !uri || value.includes(uri?.fsPath));
        return { affectsConfiguration };
      };
      beforeEach(() => {
        extensionManager = createExtensionManager(['ws-1', 'ws-2']);
        applySettingsSpy = jest.spyOn(extensionManager, 'applySettings');
        ws1Ext = extensionManager.getByName('ws-1');
        ws2Ext = extensionManager.getByName('ws-2');
      });
      describe('only trigger action if change affects the extensions', () => {
        it.each`
          eventValue          | EMCount | Ws1Count | Ws2Count
          ${true}             | ${1}    | ${1}     | ${1}
          ${false}            | ${0}    | ${0}     | ${0}
          ${['ws-2']}         | ${0}    | ${0}     | ${1}
          ${['ws-1']}         | ${1}    | ${1}     | ${0}
          ${['ws-3']}         | ${0}    | ${0}     | ${0}
          ${['ws-1', 'ws-3']} | ${1}    | ${1}     | ${0}
        `(
          'event $eventValue => trigger count: $EMCount, $Ws1Count, $Ws2Count',
          ({ eventValue, EMCount, Ws1Count, Ws2Count }) => {
            const event = mockEvent(eventValue);
            extensionManager.onDidChangeConfiguration(event);
            expect(applySettingsSpy).toHaveBeenCalledTimes(EMCount);
            expect(ws1Ext.triggerUpdateSettings).toHaveBeenCalledTimes(Ws1Count);
            expect(ws2Ext.triggerUpdateSettings).toHaveBeenCalledTimes(Ws2Count);
          }
        );
      });
    });

    describe('onDidChangeWorkspaceFolders()', () => {
      it('should register all new folders', () => {
        extensionManager.onDidChangeWorkspaceFolders({
          added: [makeWorkspaceFolder('wokspaceFolderAdded')],
          removed: [],
        } as any);
        expect(registerSpy).toHaveBeenCalledTimes(1);
      });

      it('should unregister all removed folders', () => {
        registerInstance('wokspaceFolderAdded');
        extensionManager.onDidChangeWorkspaceFolders({
          added: [],
          removed: [makeWorkspaceFolder('wokspaceFolderAdded')],
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

    describe('addFolderToDisabledWorkspaceFolders()', () => {
      it('should add the folder to the disabledWorkspaceFolders in the configuration', async () => {
        addFolderToDisabledWorkspaceFolders('some-workspace-folder');
        expect(updateConfigurationMock).toHaveBeenCalledWith('disabledWorkspaceFolders', [
          'some-workspace-folder',
        ]);
      });
    });

    describe.each`
      files                       | ext1Call | ext2Call
      ${['ws-3']}                 | ${0}     | ${0}
      ${['ws-1', 'ws-1']}         | ${1}     | ${0}
      ${['ws-1', 'ws-1', 'ws-2']} | ${1}     | ${1}
    `('listens to file lifecycle events with changes: $files', ({ files, ext1Call, ext2Call }) => {
      let ext1;
      let ext2;
      beforeEach(() => {
        extensionManager = createExtensionManager(['ws-1', 'ws-2']);
        jest.clearAllMocks();
        ext1 = extensionManager.getByName('ws-1');
        ext2 = extensionManager.getByName('ws-2');
      });
      it('onDidCreateFiles', () => {
        const event: any = { files };
        extensionManager.onDidCreateFiles(event);
        expect(ext1.onDidCreateFiles).toHaveBeenCalledTimes(ext1Call);
        expect(ext2.onDidCreateFiles).toHaveBeenCalledTimes(ext2Call);
      });
      it('onDidDeleteFiles', () => {
        const event: any = { files };
        extensionManager.onDidDeleteFiles(event);
        expect(ext1.onDidDeleteFiles).toHaveBeenCalledTimes(ext1Call);
        expect(ext2.onDidDeleteFiles).toHaveBeenCalledTimes(ext2Call);
      });
      it('onDidRenameFiles', () => {
        const renameFiles = files.map((f) => ({ oldUri: f, newUri: 'ws-1' }));
        const event: any = { files: renameFiles };
        extensionManager.onDidRenameFiles(event);
        expect(ext1.onDidRenameFiles).toHaveBeenCalledTimes(1);
        expect(ext2.onDidRenameFiles).toHaveBeenCalledTimes(ext2Call);
      });
    });
    describe('listen for save events', () => {
      let ext1, ext2;
      beforeEach(() => {
        extensionManager = createExtensionManager(['ws-1', 'ws-2']);
        jest.clearAllMocks();
        ext1 = extensionManager.getByName('ws-1');
        ext2 = extensionManager.getByName('ws-2');
      });
      it('onDidSaveTextDocument', () => {
        const document: any = { uri: 'ws-1' };
        extensionManager.onDidSaveTextDocument(document);
        expect(ext1.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(ext2.onDidSaveTextDocument).toHaveBeenCalledTimes(0);

        document.uri = 'ws-2';
        extensionManager.onDidSaveTextDocument(document);
        expect(ext1.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(ext2.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
      });
      it('onWillSaveTextDocument', () => {
        const event: any = { document: { uri: 'ws-1' } };
        extensionManager.onWillSaveTextDocument(event);
        expect(ext1.onWillSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(ext2.onWillSaveTextDocument).toHaveBeenCalledTimes(0);

        event.document.uri = 'ws-2';
        extensionManager.onWillSaveTextDocument(event);
        expect(ext1.onWillSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(ext2.onWillSaveTextDocument).toHaveBeenCalledTimes(1);
      });
    });
    describe('activate', () => {
      let ext1, ext2, mockExtension;
      beforeEach(() => {
        const map = new Map<string, boolean>();
        const globalState = {
          get: jest.fn((key) => map.get(key)),
          update: jest.fn((key: string, value: boolean) => map.set(key, value)),
        };

        extensionManager = createExtensionManager(['ws-1', 'ws-2'], { globalState });
        ext1 = extensionManager.getByName('ws-1');
        ext2 = extensionManager.getByName('ws-2');
        (vscode.window.showInformationMessage as jest.Mocked<any>).mockReturnValue(
          Promise.resolve('')
        );
        mockExtension = { packageJSON: { version: '5.0.0' } };
        (vscode.extensions as any) = {
          getExtension: () => mockExtension,
        };
      });
      it('with active editor => can trigger active extension to render it', () => {
        const document: any = { document: { uri: 'ws-2' } };
        (vscode.window.activeTextEditor as any) = document;
        extensionManager.activate();
        expect(ext1.activate).not.toHaveBeenCalled();
        expect(ext2.activate).toHaveBeenCalled();
      });
      it('without active editor => do nothing', () => {
        (vscode.window.activeTextEditor as any) = undefined;
        extensionManager.activate();
        expect(ext1.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
        expect(ext2.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
      });
      it('with inactive workspace => do nothing', () => {
        const document: any = { document: { uri: 'ws-3' } };
        (vscode.window.activeTextEditor as any) = document;
        extensionManager.activate();
        expect(ext1.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
        expect(ext2.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
      });
      it.each`
        case | version    | showChoice | choice                   | showRN
        ${1} | ${'4.6'}   | ${false}   | ${undefined}             | ${false}
        ${2} | ${'5.0.0'} | ${true}    | ${undefined}             | ${false}
        ${3} | ${'5.0.0'} | ${true}    | ${'See What Is Changed'} | ${true}
        ${4} | ${'5.0.1'} | ${true}    | ${undefined}             | ${false}
        ${5} | ${'6.0.0'} | ${false}   | ${undefined}             | ${false}
      `(
        'show release note once for specific version: case $case',
        async ({ version, showChoice, choice, showRN }) => {
          expect.hasAssertions();

          // we can't pass a "done" function in ts each, so use this dummy async to give us a chance
          // to test the showInformationMessage async action
          const dummyAsync = () => new Promise<void>((r) => r());

          mockExtension.packageJSON.version = version;
          (vscode.window.showInformationMessage as jest.Mocked<any>).mockReturnValue(
            Promise.resolve(choice)
          );
          (vscode.Uri.parse as jest.Mocked<any>).mockReturnValue('');

          extensionManager.activate();
          await dummyAsync();

          if (showChoice) {
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();

            if (showRN) {
              expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.open',
                expect.anything()
              );
            } else {
              expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            }
          } else {
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
          }

          // calling activate again should not show release note again
          (vscode.window.showInformationMessage as jest.Mocked<any>).mockClear();
          extensionManager.activate();
          await dummyAsync();
          expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        }
      );
    });
  });
});
