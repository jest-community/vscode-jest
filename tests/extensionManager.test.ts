jest.unmock('../src/extensionManager');
jest.unmock('../src/appGlobals');

import * as vscode from 'vscode';
import { addFolderToDisabledWorkspaceFolders, ExtensionManager } from '../src/extensionManager';
import { readFileSync } from 'fs';
import { extensionName } from '../src/appGlobals';
import { JestExt } from '../src/JestExt';
import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import { CoverageCodeLensProvider } from '../src/Coverage';
import { startWizard } from '../src/setup-wizard';

const mockEnabledWorkspaceFolders = jest.fn();
jest.mock('../src/workspace-manager', () => ({
  enabledWorkspaceFolders: () => mockEnabledWorkspaceFolders(),
}));

const updateConfigurationMock = jest.fn();

// (vscode.commands as any).registerCommand = jest.fn().mockImplementation((...args) => args);
(vscode.window as any).onDidChangeActiveTextEditor = jest
  .fn()
  .mockReturnValue('onDidChangeActiveTextEditor');
vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValue({ name: 'workspaceFolder1' });
(vscode.workspace as any).onDidChangeConfiguration = jest
  .fn()
  .mockReturnValue('onDidChangeConfiguration');
(vscode.workspace as any).onDidChangeTextDocument = jest
  .fn()
  .mockReturnValue('onDidChangeTextDocument');
(vscode.workspace as any).onDidChangeWorkspaceFolders = jest
  .fn()
  .mockReturnValue('onDidChangeWorkspaceFolders');
(vscode.workspace as any).onDidCloseTextDocument = jest
  .fn()
  .mockReturnValue('onDidCloseTextDocument');

const mockGetConfiguration = jest.fn().mockImplementation((section) => {
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
    stopSession: jest.fn(),
    runAllTests: jest.fn(),
    debugTests: jest.fn(),
    onDidCreateFiles: jest.fn(),
    onDidRenameFiles: jest.fn(),
    onDidDeleteFiles: jest.fn(),
    onDidSaveTextDocument: jest.fn(),
    onWillSaveTextDocument: jest.fn(),
    triggerUpdateSettings: jest.fn(),
    toggleAutoRun: jest.fn(),
    toggleCoverageOverlay: jest.fn(),
    enableLoginShell: jest.fn(),
    runItemCommand: jest.fn(),
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
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
});
const initWorkspaces = (all: string[], enabled?: string[]): any[] => {
  const allWorspaces = all.map((name) => makeWorkspaceFolder(name));
  (vscode.workspace as any).workspaceFolders = allWorspaces;
  const enabledWorkspaces = enabled
    ? allWorspaces.filter((w) => enabled.includes(w.name))
    : allWorspaces;
  mockEnabledWorkspaceFolders.mockReturnValue(enabledWorkspaces);
  return allWorspaces;
};

const createExtensionManager = (workspaceFolders: string[], context?: any): ExtensionManager => {
  const allFolders = initWorkspaces(workspaceFolders);

  (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) => {
    return allFolders.find((ws) => ws.name === uri);
  });
  mockJestExt();
  const extensionContext = context ?? createExtensionContext();
  const em = new ExtensionManager(extensionContext);
  allFolders.forEach((ws) => em.registerWorkspace(ws));
  return em;
};

describe('ExtensionManager', () => {
  const jestInstance = makeJestExt(makeWorkspaceFolder('workspace-1'));
  let context;
  let extensionManager: ExtensionManager;

  const registerSpy = jest.spyOn(ExtensionManager.prototype, 'registerWorkspace');
  const unregisterSpy = jest.spyOn(ExtensionManager.prototype, 'unregisterWorkspace');
  let workspaceFolder1;
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration = mockGetConfiguration;
    (JestExt as jest.Mocked<any>).mockImplementation(() => jestInstance);
    context = createExtensionContext();
    [workspaceFolder1] = initWorkspaces(['workspaceFolder1']);
  });

  describe('constructor()', () => {
    it('should register extensions for all wrokspace folders', () => {
      new ExtensionManager(context);
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });
    it('should created the components shared across of all workspaces', () => {
      new ExtensionManager(context);
      expect(DebugConfigurationProvider).toHaveBeenCalled();
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
      (vscode.window.showQuickPick as any).mockReset();
      (vscode.commands.registerCommand as any).mockReset();
    });

    describe('applySettings()', () => {
      const ws1 = makeWorkspaceFolder('ws-1');
      const ws2 = makeWorkspaceFolder('ws-2');
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [ws1, ws2];
      });
      it('will register enabled workspace and unregister disabled ones', () => {
        //set up
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2]);
        extensionManager.registerWorkspace(ws1);
        extensionManager.registerWorkspace(ws2);
        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeDefined();

        // when disable ws2
        mockEnabledWorkspaceFolders.mockReturnValue([ws1]);
        extensionManager.applySettings();
        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeUndefined();
      });
    });

    describe('registerWorkspace', () => {
      const ws1 = makeWorkspaceFolder('ws-1');
      const ws2 = makeWorkspaceFolder('ws-2');
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [ws1, ws2];
      });
      it('should register an instance', () => {
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2]);
        extensionManager.registerWorkspace(ws1);
        expect(extensionManager.getByName(ws1.name)).toBeDefined();
      });
      it('should not register disabled workspace', () => {
        mockEnabledWorkspaceFolders.mockReturnValue([ws2]);
        extensionManager.registerWorkspace(ws1);
        expect(extensionManager.getByName(ws1.name)).toBeUndefined();
      });
    });

    describe('unregisterWorkspace', () => {
      it('should unregister instance by wokspaceFolder', () => {
        extensionManager.registerWorkspace(workspaceFolder1);
        extensionManager.unregisterWorkspace(workspaceFolder1);
        expect(extensionManager.getByName(workspaceFolder1.name)).toBeUndefined();
        expect(jestInstance.deactivate).toHaveBeenCalled();
      });
    });

    describe('unregisterByName', () => {
      it('should unregister instance by wokspaceFolder name', () => {
        extensionManager.registerWorkspace(workspaceFolder1);
        extensionManager.unregisterWorkspaceByName('workspaceFolder1');
        expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
        expect(jestInstance.deactivate).toHaveBeenCalled();
      });
    });

    describe('unregisterAllWorkspaces', () => {
      it('should unregister all instances', () => {
        const [ws1, ws2] = initWorkspaces(['workspaceFolder1', 'workspaceFolder2']);
        extensionManager.registerWorkspace(ws1);
        extensionManager.registerWorkspace(ws2);

        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeDefined();

        extensionManager.unregisterAllWorkspaces();

        expect(extensionManager.getByName(ws1.name)).toBeUndefined();
        expect(extensionManager.getByName(ws2.name)).toBeUndefined();
        expect(jestInstance.deactivate).toHaveBeenCalledTimes(2);
      });
    });

    describe('getByName()', () => {
      it('should return extension', () => {
        extensionManager.registerWorkspace(workspaceFolder1);
        expect(extensionManager.getByName('workspaceFolder1')).toBe(jestInstance);
        expect(extensionManager.getByName('workspaceFolder2')).toBeUndefined();
      });
    });

    describe('getByDocUri()', () => {
      it('should return extension', async () => {
        extensionManager.registerWorkspace(workspaceFolder1);
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
        extensionManager.registerWorkspace(workspaceFolder1);
        expect(await extensionManager.selectExtension()).toBe(jestInstance);
      });

      it('should prompt for workspace if there are more then one enabled workspace folder', async () => {
        const [ws1, ws2] = initWorkspaces(['ws1', 'ws2', 'ws3'], ['ws1', 'ws2']);
        extensionManager.registerWorkspace(ws1);
        (vscode.window.showQuickPick as any).mockReturnValue(ws1.name);
        expect(await extensionManager.selectExtension()).toBe(jestInstance);
        expect(vscode.window.showQuickPick).toHaveBeenCalledWith([ws1.name, ws2.name]);
      });

      it('should return undefined if no workspace opened', async () => {
        initWorkspaces([]);
        expect(await extensionManager.selectExtension()).toBeUndefined();
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      });
      it('should return undefined if no workspace selected', async () => {
        const [ws1] = initWorkspaces(['ws1', 'ws2']);
        extensionManager.registerWorkspace(ws1);
        (vscode.window.showQuickPick as any).mockReturnValue(undefined);
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
          ${'workspace'}        | ${`${extensionName}.with-workspace`}
        `('can generate command id by $type', ({ type, expectedNamePrefix }) => {
          extensionManager.registerCommand({ type, name: 'something', callback: jest.fn() });
          expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            `${expectedNamePrefix}.something`,
            expect.anything()
          );
        });
        it('can execute command for all enabled workspaces', () => {
          const callback = jest.fn();
          const someObject = {};

          const // recreate extensionManager with new workspaceFolders
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

          (vscode.window.showQuickPick as jest.Mocked<any>).mockReturnValue(
            vscode.workspace.workspaceFolders[1].name
          );

          extensionManager.registerCommand({
            type: 'select-workspace',
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
            .calls[0][1];
          await registeredCallback('arg1', 2);
          expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(extensionManager.getByName('ws-2'), 'arg1', 2);
        });
        it('can execute command with a workspaces', async () => {
          const callback = jest.fn();
          const someObject = {};

          // recreate extensionManager with new workspaceFolders
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
          jest.clearAllMocks();

          extensionManager.registerCommand(
            { type: 'workspace', name: 'something', callback },
            someObject
          );
          const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
            .calls[0][1];
          await registeredCallback({ name: 'ws-2' }, 'extra');

          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(extensionManager.getByName('ws-2'), 'extra');
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
        const affectsConfiguration = jest.fn().mockImplementation((section: string, scope: any) => {
          if (section === 'jest') {
            if (typeof value === 'boolean') {
              return value;
            }
            return !scope || value.includes(scope?.fsPath);
          }
        });
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
      describe('when enabled workspace is changed', () => {
        it('will unregister disabled workpsaces', () => {
          expect(extensionManager.getByName('ws-1')).not.toBeUndefined();
          expect(extensionManager.getByName('ws-2')).not.toBeUndefined();

          // disabled ws2
          mockEnabledWorkspaceFolders.mockReturnValue(
            vscode.workspace.workspaceFolders.filter((ws) => ws.name == 'ws-1')
          );

          const event = mockEvent(true);
          event.affectsConfiguration
            .mockReturnValueOnce(false) //ws1 did not change
            .mockReturnValueOnce(true) //ws2 change
            .mockReturnValueOnce(true); // ws2 jest.enable changed

          extensionManager.onDidChangeConfiguration(event);
          expect(applySettingsSpy).toHaveBeenCalledTimes(1);
          expect(extensionManager.getByName('ws-1')).not.toBeUndefined();
          expect(extensionManager.getByName('ws-2')).toBeUndefined();
        });
        it('will register newly enabled workspace', () => {
          const [ws1, ws2] = vscode.workspace.workspaceFolders;
          extensionManager.unregisterWorkspace(ws1);
          expect(extensionManager.getByName(ws1.name)).toBeUndefined();
          expect(extensionManager.getByName(ws2.name)).not.toBeUndefined();

          const event = mockEvent(true);
          event.affectsConfiguration
            .mockReturnValueOnce(true) //ws1 changed
            .mockReturnValueOnce(true) //ws1 jest.enable changed
            .mockReturnValueOnce(true); // ws2 did not change

          extensionManager.onDidChangeConfiguration(event);
          expect(applySettingsSpy).toHaveBeenCalledTimes(1);
          expect(extensionManager.getByName(ws1.name)).not.toBeUndefined();
          expect(extensionManager.getByName(ws2.name)).not.toBeUndefined();
        });
      });
    });

    describe('onDidChangeWorkspaceFolders()', () => {
      it('will ignore folder change if IgnoreWorkspaceChanges is true', () => {
        context.workspaceState.get.mockReturnValue(true);
        extensionManager.onDidChangeWorkspaceFolders({
          added: [makeWorkspaceFolder('wokspaceFolderAdded')],
          removed: [],
        } as any);
        expect(registerSpy).not.toHaveBeenCalled();
      });
      it('should register all new folders', () => {
        extensionManager.onDidChangeWorkspaceFolders({
          added: [makeWorkspaceFolder('wokspaceFolderAdded')],
          removed: [],
        } as any);
        expect(registerSpy).toHaveBeenCalledTimes(1);
      });

      it('should unregister all removed folders', () => {
        const ws = makeWorkspaceFolder('wokspaceFolderToRemove');
        extensionManager.registerWorkspace(ws);
        extensionManager.onDidChangeWorkspaceFolders({
          added: [],
          removed: [ws],
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
    describe('register', () => {
      beforeEach(() => {
        extensionManager = createExtensionManager(['ws-1', 'ws-2']);
      });
      it.each`
        name                                   | extFunc
        ${'start'}                             | ${'startSession'}
        ${'workspace.start'}                   | ${'startSession'}
        ${'stop'}                              | ${'stopSession'}
        ${'workspace.stop'}                    | ${'stopSession'}
        ${'toggle-coverage'}                   | ${'toggleCoverageOverlay'}
        ${'workspace.toggle-coverage'}         | ${'toggleCoverageOverlay'}
        ${'run-all-tests'}                     | ${'runAllTests'}
        ${'workspace.run-all-tests'}           | ${'runAllTests'}
        ${'with-workspace.toggle-auto-run'}    | ${'toggleAutoRun'}
        ${'with-workspace.toggle-coverage'}    | ${'toggleCoverageOverlay'}
        ${'with-workspace.enable-login-shell'} | ${'enableLoginShell'}
        ${'with-workspace.item-command'}       | ${'runItemCommand'}
      `('extension-based commands "$name"', async ({ name, extFunc }) => {
        extensionManager.register();
        const expectedName = `${extensionName}.${name}`;
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
          expectedName,
          expect.anything()
        );
        const call = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls.find(
          (args) => args[0] === expectedName
        );
        expect(call).not.toBeUndefined();

        (vscode.window.showQuickPick as jest.Mocked<any>).mockImplementation(() =>
          Promise.resolve(vscode.workspace.workspaceFolders[1].name)
        );
        const registeredCallback = call[1];
        await registeredCallback({ name: 'ws-2' });
        const ext = extensionManager.getByName('ws-2');
        expect(ext[extFunc]).toHaveBeenCalled();
      });
      it.each`
        name                                  | extFunc
        ${'editor.workspace.toggle-coverage'} | ${'toggleCoverageOverlay'}
        ${'editor.workspace.run-all-tests'}   | ${'runAllTests'}
        ${'editor.run-all-tests'}             | ${'runAllTests'}
        ${'editor.debug-tests'}               | ${'debugTests'}
      `('editor-based commands "$name"', async ({ name, extFunc }) => {
        extensionManager.register();
        const expectedName = `${extensionName}.${name}`;
        expect(vscode.commands.registerTextEditorCommand).toHaveBeenCalledWith(
          `${extensionName}.${name}`,
          expect.anything()
        );
        const call = (
          vscode.commands.registerTextEditorCommand as jest.Mocked<any>
        ).mock.calls.find((args) => args[0] === expectedName);
        expect(call).not.toBeUndefined();

        (vscode.window.showWorkspaceFolderPick as jest.Mocked<any>).mockImplementation(() =>
          Promise.resolve(vscode.workspace.workspaceFolders[1])
        );
        const registeredCallback = call[1];
        const editor = makeEditor('ws-2');
        await registeredCallback(editor);
        const ext = extensionManager.getByName('ws-2');
        expect(ext[extFunc]).toHaveBeenCalled();
      });

      it('event handlers', () => {
        extensionManager.register();
        expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalled();
        expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
        expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
        expect(vscode.workspace.onWillSaveTextDocument).toHaveBeenCalled();
        expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
        expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled();
      });

      it('DebugConfigurationProvider', () => {
        const register = vscode.debug.registerDebugConfigurationProvider as jest.Mock<any>;
        register.mockReset();

        extensionManager.register();

        expect(register).toHaveBeenCalledTimes(2);
        const registeredAsNode = register.mock.calls.some((parameters) => parameters[0] === 'node');
        const registeredAsJestTest = register.mock.calls.some(
          (parameters) => parameters[0] === 'vscode-jest-tests'
        );
        expect(registeredAsNode && registeredAsJestTest).toBeTruthy();
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
