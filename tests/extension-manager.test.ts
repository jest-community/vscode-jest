jest.unmock('../src/extension-manager');
jest.unmock('../src/virtual-workspace-folder');
jest.unmock('../src/appGlobals');

import * as vscode from 'vscode';
import { ExtensionManager } from '../src/extension-manager';
import { readFileSync } from 'fs';
import { extensionName } from '../src/appGlobals';
import { JestExt } from '../src/JestExt';
import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import { CoverageCodeLensProvider } from '../src/Coverage';
import { startWizard } from '../src/setup-wizard';
import { VirtualWorkspaceFolder } from '../src/virtual-workspace-folder';
import { updateSetting } from '../src/Settings';
import { showQuickFix } from '../src/quick-fix';

const mockEnabledWorkspaceFolders = jest.fn();
jest.mock('../src/workspace-manager', () => ({
  enabledWorkspaceFolders: () => mockEnabledWorkspaceFolders(),
}));

const updateConfigurationMock = jest.fn();

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
    toggleCoverage: jest.fn(),
    enableLoginShell: jest.fn(),
    runItemCommand: jest.fn(),
    changeRunMode: jest.fn(),
    saveRunMode: jest.fn(),
    exitDeferMode: jest.fn(),
    setupExtensionForFolder: jest.fn(),
    workspaceFolder: workspace,
    name: workspace.name,
  };
};
const makeWorkspaceFolder = (name: string): any => ({ uri: { fsPath: name }, name });
const makeEditor = (name: string): any => ({ document: { uri: name, fileName: name } });
const mockJestExt = (callback?: (ext: any) => void) => {
  (JestExt as jest.Mocked<any>).mockImplementation((...args: any[]) => {
    const ext = makeJestExt(args[1]);
    callback?.(ext);
    return ext;
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
  const allWorkspaces = all.map((name) => makeWorkspaceFolder(name));
  (vscode.workspace as any).workspaceFolders = allWorkspaces;
  const enabledWorkspaces = enabled
    ? allWorkspaces.filter((w) => enabled.includes(w.name))
    : allWorkspaces;
  mockEnabledWorkspaceFolders.mockReturnValue(enabledWorkspaces);
  return allWorkspaces;
};

const createExtensionManager = (
  workspaceFolders: string[],
  context?: any,
  recordJestInstances?: (ext: any) => void
): ExtensionManager => {
  const allFolders = initWorkspaces(workspaceFolders, workspaceFolders);

  (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) => {
    return allFolders.find((ws) => ws.name === uri);
  });

  mockJestExt(recordJestInstances);
  const extensionContext = context ?? createExtensionContext();
  const em = new ExtensionManager(extensionContext);
  return em;
};

/**
 * setup an use case where there are 2 actual workspace folders (ws1, ws2); in ws2 there are 2 virtual folders (ws2_v1, ws2_v2)
 * @param em
 * @returns
 */
const setupVirtualFolders = (em: ExtensionManager) => {
  const ws1 = makeWorkspaceFolder('ws-1');
  const ws2 = makeWorkspaceFolder('ws-2');
  const ws2_v1 = new VirtualWorkspaceFolder(ws2, 'ws-2-v1');
  const ws2_v2 = new VirtualWorkspaceFolder(ws2, 'ws-2-v2');

  (vscode.workspace as any).workspaceFolders = [ws1, ws2];
  // but only f1 is enabled
  const enabledFolders = [ws1, ws2_v1, ws2_v2];
  mockEnabledWorkspaceFolders.mockReturnValue(enabledFolders);

  em.applySettings();

  return { ws1, ws2, ws2_v1, ws2_v2 };
};

jest.mock('../src/output-manager', () => ({
  outputManager: jest.fn(),
}));

describe('ExtensionManager', () => {
  const jestInstance = makeJestExt(makeWorkspaceFolder('workspaceFolder1'));
  let context;
  let extensionManager: ExtensionManager;
  const isInWorkspaceSpy = jest.spyOn(VirtualWorkspaceFolder.prototype, 'isInWorkspaceFolder');

  const addExtensionSpy = jest.spyOn(ExtensionManager.prototype, 'addExtension');
  const deleteExtensionSpy = jest.spyOn(ExtensionManager.prototype, 'deleteExtension');

  let workspaceFolder1;
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.workspace.getConfiguration = mockGetConfiguration;
    isInWorkspaceSpy.mockReturnValue(true);

    (JestExt as jest.Mocked<any>).mockImplementation(() => jestInstance);
    context = createExtensionContext();
    [workspaceFolder1] = initWorkspaces(['workspaceFolder1']);
  });

  describe('constructor()', () => {
    it('should register extensions for all workspace folders', () => {
      new ExtensionManager(context);
      expect(addExtensionSpy).toHaveBeenCalledTimes(1);
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
      expect(addExtensionSpy).not.toHaveBeenCalled();

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
      expect(addExtensionSpy).toHaveBeenCalled();
    });
  });
  describe('with an extensionManager', () => {
    const jestInstances = [];
    beforeEach(() => {
      jestInstances.length = 0;
      const recordInstances = (ext: any) => jestInstances.push(ext);
      extensionManager = createExtensionManager([workspaceFolder1.name], context, recordInstances);
      addExtensionSpy.mockClear();
      deleteExtensionSpy.mockClear();
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
        extensionManager.applySettings();
        expect(jestInstances).toHaveLength(3);

        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeDefined();
        expect(extensionManager.getByName(workspaceFolder1.name)).toBeUndefined();

        // when disable ws2
        mockEnabledWorkspaceFolders.mockReturnValue([ws1]);
        extensionManager.applySettings();
        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeUndefined();
      });
      it('can handle virtual workspace folders just like actual folders', () => {
        const v_1 = new VirtualWorkspaceFolder(ws2, 'ws-2-front');
        const v_2 = new VirtualWorkspaceFolder(ws2, 'ws-2-back');

        mockEnabledWorkspaceFolders.mockReturnValue([ws1, v_1, v_2]);
        jestInstances.length = 0;
        extensionManager.applySettings();
        expect(jestInstances).toHaveLength(3);

        expect(jestInstances.map((ext) => ext.name)).toEqual(
          expect.arrayContaining([ws1.name, v_1.name, v_2.name])
        );

        expect(extensionManager.getByName(ws1.name)).toBeDefined();
        expect(extensionManager.getByName(ws2.name)).toBeUndefined();
        expect(extensionManager.getByName(v_1.name)).toBeDefined();
        expect(extensionManager.getByName(v_2.name)).toBeDefined();

        // can disable virtual workspace
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, v_2]);
        extensionManager.applySettings();

        expect(extensionManager.getByName(v_2.name)).toBeDefined();
        expect(extensionManager.getByName(v_1.name)).toBeUndefined();
      });
    });

    describe('addExtension', () => {
      const ws1 = makeWorkspaceFolder('ws-1');
      const ws2 = makeWorkspaceFolder('ws-2');
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [ws1, ws2];
      });
      it('should register an instance', () => {
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2]);
        extensionManager.applySettings();
        const ext = extensionManager.getByName(ws1.name);
        expect(ext.name).toEqual(ws1.name);
        expect(ext).toBe(jestInstances[1]);
      });
      it('should not register disabled workspace', () => {
        mockEnabledWorkspaceFolders.mockReturnValue([ws2]);
        extensionManager.applySettings();
        extensionManager.addExtension(ws1);
        expect(extensionManager.getByName(ws1.name)).toBeUndefined();
      });
      it('will not store instance if extension failed to start up', () => {
        (JestExt as jest.Mocked<any>).mockImplementation(() => {
          throw new Error('mocked error');
        });
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2]);
        extensionManager.applySettings();
        extensionManager.addExtension(ws1);
        expect(extensionManager.getByName(ws1.name)).toBeUndefined();
      });
    });

    describe('deleteExtension', () => {
      it('should unregister instance by workspaceFolder', () => {
        extensionManager.addExtension(workspaceFolder1);
        const ext = extensionManager.getByName(workspaceFolder1.name);
        expect(ext).not.toBeUndefined();
        extensionManager.deleteExtension(ext);
        expect(extensionManager.getByName(workspaceFolder1.name)).toBeUndefined();
        expect(ext.deactivate).toHaveBeenCalled();
      });
    });

    describe('deleteExtensionByFolder', () => {
      it('should unregister instance by workspaceFolder name', () => {
        extensionManager.addExtension(workspaceFolder1);
        const ext = extensionManager.getByName('workspaceFolder1');
        expect(ext).not.toBeUndefined();

        extensionManager.deleteExtensionByFolder(workspaceFolder1);
        expect(extensionManager.getByName('workspaceFolder1')).toBeUndefined();
        expect(ext.deactivate).toHaveBeenCalled();
      });
    });

    describe('deleteAllExtensions', () => {
      it('should delete all instances', () => {
        const [ws1, ws2] = initWorkspaces(['workspaceFolder1', 'workspaceFolder2']);
        extensionManager.applySettings();

        const ext1 = extensionManager.getByName(ws1.name);
        const ext2 = extensionManager.getByName(ws2.name);
        expect(ext1).toBeDefined();
        expect(ext2).toBeDefined();

        extensionManager.deleteAllExtensions();

        expect(extensionManager.getByName(ws1.name)).toBeUndefined();
        expect(extensionManager.getByName(ws2.name)).toBeUndefined();
        expect(ext1.deactivate).toHaveBeenCalledTimes(1);
        expect(ext2.deactivate).toHaveBeenCalledTimes(1);
      });
    });

    describe('getByName()', () => {
      it('should return extension', () => {
        extensionManager.addExtension(workspaceFolder1);
        expect(jestInstances).toHaveLength(1);

        expect(extensionManager.getByName('workspaceFolder1')).toBe(jestInstances[0]);
        expect(extensionManager.getByName('workspaceFolder2')).toBeUndefined();
      });
      it('can return virtual folder extension', () => {
        const { ws2_v1 } = setupVirtualFolders(extensionManager);
        expect(extensionManager.getByName(ws2_v1.name)).not.toBeUndefined();
      });
    });

    describe('getByDocUri()', () => {
      const whateverUri: any = 'whatever';
      it('should return extension', async () => {
        extensionManager.addExtension(workspaceFolder1);
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
          name: 'workspaceFolder1',
        });
        const extList = extensionManager.getByDocUri(whateverUri);
        expect(extList).toHaveLength(1);
        expect(JestExt as jest.Mocked<any>).toHaveBeenCalledTimes(1);
      });
      it('should return undefined if no workspace found for uri', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
        expect(extensionManager.getByDocUri(null)).toHaveLength(0);
      });
      it('will return multiple extensions for venv', () => {
        const ws2 = makeWorkspaceFolder('ws-2');
        const v_1 = new VirtualWorkspaceFolder(ws2, 'ws-2-unit');
        const v_2 = new VirtualWorkspaceFolder(ws2, 'ws-2-integration');

        mockEnabledWorkspaceFolders.mockReturnValue([v_1, v_2]);
        extensionManager.applySettings();

        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
          name: ws2.name,
        });
        const extList = extensionManager.getByDocUri(whateverUri);
        expect(extList).toHaveLength(2);
        expect(extList.map((ext) => ext.name)).toEqual(
          expect.arrayContaining([v_1.name, v_2.name])
        );
      });
    });

    describe('selectExtension()', () => {
      it('should return extension at once if there is only one workspace folder', async () => {
        extensionManager.addExtension(workspaceFolder1);
        expect(await extensionManager.selectExtension()).toBe(jestInstances[0]);
      });

      it('should prompt for workspace if there are more then one enabled workspace folder', async () => {
        const [ws1, ws2] = initWorkspaces(['ws1', 'ws2', 'ws3'], ['ws1', 'ws2']);
        extensionManager.applySettings();
        (vscode.window.showQuickPick as any).mockReturnValue(ws1.name);
        expect(await extensionManager.selectExtension()).toBe(jestInstances[1]);
        expect(vscode.window.showQuickPick).toHaveBeenCalledWith([ws1.name, ws2.name], {
          canPickMany: false,
        });
      });

      it('should return undefined if no workspace opened', async () => {
        initWorkspaces([]);
        extensionManager.applySettings();
        expect(await extensionManager.selectExtension()).toBeUndefined();
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      });
      it('should return undefined if no workspace selected', async () => {
        initWorkspaces(['ws1', 'ws2']);
        extensionManager.applySettings();
        (vscode.window.showQuickPick as any).mockReturnValue(undefined);
        expect(await extensionManager.selectExtension()).toBeUndefined();
      });

      it('could select from a list of extensions passed in', async () => {
        const ext1 = makeJestExt(makeWorkspaceFolder('ext1'));
        const ext2 = makeJestExt(makeWorkspaceFolder('ext2'));

        (vscode.window.showQuickPick as any).mockReturnValue('ext1');
        expect(await extensionManager.selectExtension([ext1, ext2])).toBe(ext1);
        expect(vscode.window.showQuickPick).toHaveBeenCalledWith(['ext1', 'ext2'], {
          canPickMany: false,
        });
      });
      it('will show v-folders in the picker', async () => {
        const ws1 = makeWorkspaceFolder('ws-1');
        const ws2 = makeWorkspaceFolder('ws-2');
        const v_1 = new VirtualWorkspaceFolder(ws2, 'ws-2-front');
        const v_2 = new VirtualWorkspaceFolder(ws2, 'ws-2-back');
        mockEnabledWorkspaceFolders.mockReturnValue([ws1, v_1, v_2]);
        extensionManager.applySettings();

        (vscode.window.showQuickPick as any).mockReturnValue(v_1.name);
        expect(await extensionManager.selectExtension()).toBe(
          jestInstances.find((ext) => ext.name === v_1.name)
        );
        expect(vscode.window.showQuickPick).toHaveBeenCalledWith([ws1.name, v_1.name, v_2.name], {
          canPickMany: false,
        });
      });
    });
    describe('selectExtensions()', () => {
      it('can select multiple extensions', async () => {
        const ext1 = makeJestExt(makeWorkspaceFolder('ext1'));
        const ext2 = makeJestExt(makeWorkspaceFolder('ext2'));
        const ext3 = makeJestExt(makeWorkspaceFolder('ext3'));

        (vscode.window.showQuickPick as any).mockReturnValue(['ext1', 'ext2']);
        expect(await extensionManager.selectExtensions([ext1, ext2, ext3])).toEqual([ext1, ext2]);
        expect(vscode.window.showQuickPick).toHaveBeenCalledWith(['ext1', 'ext2', 'ext3'], {
          canPickMany: true,
        });
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

          // recreate extensionManager with new workspaceFolders
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
          jest.clearAllMocks();

          extensionManager.registerCommand(
            { type: 'all-workspaces', name: 'something', callback },
            someObject
          );
          const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
            .calls[0][1];
          registeredCallback('additional argument');

          expect(callback).toHaveBeenCalledTimes(vscode.workspace.workspaceFolders.length);
          ['ws-1', 'ws-2'].forEach((ws) =>
            expect(callback).toHaveBeenCalledWith(
              extensionManager.getByName(ws),
              'additional argument'
            )
          );
        });
        it.each`
          selections          | calledTimes
          ${undefined}        | ${0}
          ${'ws-1'}           | ${1}
          ${['ws-1']}         | ${1}
          ${['ws-1', 'ws-2']} | ${2}
        `(
          'can execute command for a selected workspaces: $selections',
          async ({ selections, calledTimes }) => {
            const callback = jest.fn();
            extensionManager = createExtensionManager(['ws-1', 'ws-2']);
            jest.clearAllMocks();

            (vscode.window.showQuickPick as jest.Mocked<any>).mockReturnValue(selections);

            extensionManager.registerCommand({
              type: 'select-workspace',
              name: 'something',
              callback,
            });
            const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
              .calls[0][1];
            await registeredCallback('arg1', 2);
            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledTimes(calledTimes);
            if (typeof selections === 'string') {
              expect(callback).toHaveBeenCalledWith(
                extensionManager.getByName(selections),
                'arg1',
                2
              );
            } else if (Array.isArray(selections)) {
              selections.forEach((ws) =>
                expect(callback).toHaveBeenCalledWith(extensionManager.getByName(ws), 'arg1', 2)
              );
            } else {
              expect(callback).not.toHaveBeenCalled();
            }
          }
        );
        describe('can execute command with a workspaces', () => {
          it('when no virtual folder, the command will be executed with the workspace', async () => {
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
          it('if the workspace has virtual folders, a chooser will be prompted', async () => {
            const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);
            jest.clearAllMocks();

            const callback = jest.fn();
            const someObject = {};

            (vscode.window.showQuickPick as jest.Mocked<any>).mockReturnValue([ws2_v2.name]);

            extensionManager.registerCommand(
              { type: 'workspace', name: 'something', callback },
              someObject
            );
            const registeredCallback = (vscode.commands.registerCommand as jest.Mocked<any>).mock
              .calls[0][1];
            await registeredCallback(ws2, 'extra');

            expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
            expect(vscode.window.showQuickPick).toHaveBeenCalledWith([ws2_v1.name, ws2_v2.name], {
              canPickMany: false,
            });
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(extensionManager.getByName(ws2_v2.name), 'extra');
          });
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
          jest.clearAllMocks();
          // recreate extensionManager with new workspaceFolders
          extensionManager = createExtensionManager(['ws-1', 'ws-2']);
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

          registeredCallback(editor, {}, 'additional argument');
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(
            extensionManager.getByName('ws-1'),
            editor,
            'additional argument'
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

          registeredCallback(editor, {}, 'additional argument');
          expect(callback).not.toHaveBeenCalled();
        });
        it('will prompt a chooser if the active workspace has multiple virtual folders', async () => {
          const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);
          jest.clearAllMocks();

          const callback = jest.fn();
          (vscode.window.showQuickPick as jest.Mocked<any>).mockReturnValue([ws2_v2.name]);

          extensionManager.registerCommand({
            type,
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerTextEditorCommand as jest.Mocked<any>)
            .mock.calls[0][1];
          const editor = makeEditor(ws2.name);
          await registeredCallback(editor, {}, 'additional argument');

          expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
          expect(vscode.window.showQuickPick).toHaveBeenCalledWith([ws2_v1.name, ws2_v2.name], {
            canPickMany: true,
          });
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(
            extensionManager.getByName(ws2_v2.name),
            editor,
            'additional argument'
          );
        });
        it('will show warning if no extension supports the given editor file', async () => {
          const { ws2 } = setupVirtualFolders(extensionManager);
          jest.clearAllMocks();
          isInWorkspaceSpy.mockReturnValue(false);

          extensionManager.registerCommand({
            type,
            name: 'something',
            callback,
          });
          const registeredCallback = (vscode.commands.registerTextEditorCommand as jest.Mocked<any>)
            .mock.calls[0][1];
          const editor = makeEditor(ws2.name);
          await registeredCallback(editor, {}, 'additional argument');
          expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
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
            return !scope || value.includes(scope?.uri.fsPath);
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
      it('no op if no workspace folders', () => {
        expect.hasAssertions();
        (vscode.workspace as any).workspaceFolders = undefined;
        const event = mockEvent(true);
        extensionManager.onDidChangeConfiguration(event);
        expect(event.affectsConfiguration).not.toHaveBeenCalled();
      });
      describe('only trigger action if change affects the extensions', () => {
        it.each`
          eventValue          | EMCount | Ws1Count | Ws2Count
          ${true}             | ${1}    | ${1}     | ${1}
          ${false}            | ${0}    | ${0}     | ${0}
          ${['ws-2']}         | ${1}    | ${0}     | ${1}
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
        it('will unregister disabled workspaces', () => {
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
          extensionManager.deleteExtensionByFolder(ws1);
          expect(extensionManager.getByName(ws1.name)).toBeUndefined();
          expect(extensionManager.getByName(ws2.name)).not.toBeUndefined();

          const event = mockEvent(true);
          event.affectsConfiguration
            .mockReturnValueOnce(true) //ws1 changed
            .mockReturnValueOnce(true) //ws1 jest.enable changed
            .mockReturnValueOnce(true); // ws2 did not change

          extensionManager.onDidChangeConfiguration(event);
          expect(applySettingsSpy).toHaveBeenCalledTimes(1);
          expect(extensionManager.getByName(ws1.name)).toBeDefined();
          expect(extensionManager.getByName(ws2.name)).toBeDefined();
        });
        describe('when workspace with virtual folders is changed', () => {
          let v1, v2;
          beforeEach(() => {
            const [, ws2] = vscode.workspace.workspaceFolders;
            v1 = new VirtualWorkspaceFolder(ws2, 'ws-2-front');
            v2 = new VirtualWorkspaceFolder(ws2, 'ws-2-back');
          });
          it('when new v-folder is added, they should be registered and notified', () => {
            const [ws1, ws2] = vscode.workspace.workspaceFolders;
            mockEnabledWorkspaceFolders.mockReturnValue([ws1, v1]);
            extensionManager.applySettings();
            expect(extensionManager.getByName(v1.name)).toBeDefined();
            expect(extensionManager.getByName(ws2.name)).toBeUndefined();

            // adding v2 virtual folders in ws2
            const event = mockEvent(true);
            event.affectsConfiguration.mockImplementation((section: string, scope: any) => {
              if (scope?.name === ws2.name && section === 'jest') {
                return true;
              }
              return false;
            });
            mockEnabledWorkspaceFolders.mockReturnValue([ws1, v1, v2]);

            applySettingsSpy.mockClear();
            extensionManager.onDidChangeConfiguration(event);
            expect(applySettingsSpy).toHaveBeenCalledTimes(1);
            [ws1, v1, v2].forEach((ws) =>
              expect(extensionManager.getByName(ws.name)).toBeDefined()
            );

            [v1, v2].forEach((folder) => {
              const ext = extensionManager.getByName(folder.name);
              expect(ext?.triggerUpdateSettings).toHaveBeenCalledTimes(1);
            });
            expect(ws1Ext.triggerUpdateSettings).not.toHaveBeenCalled();
            expect(ws2Ext.triggerUpdateSettings).not.toHaveBeenCalled();
          });
          it('when venv is removed or disabled, they should be unregistered', () => {
            const [ws1, ws2] = vscode.workspace.workspaceFolders;
            mockEnabledWorkspaceFolders.mockReturnValue([ws1, v1, v2]);
            extensionManager.applySettings();
            expect(extensionManager.getByName(v1.name)).toBeDefined();
            expect(extensionManager.getByName(v2.name)).toBeDefined();

            // adding a new venv v2
            const event = mockEvent(true);
            event.affectsConfiguration.mockImplementation((section: string, scope: any) => {
              if (scope?.name === ws2.name) {
                if (section === 'jest.venv' || section === 'jest') {
                  return true;
                }
              }
              return false;
            });
            mockEnabledWorkspaceFolders.mockReturnValue([ws1, v2]);

            applySettingsSpy.mockClear();
            extensionManager.onDidChangeConfiguration(event);
            expect(applySettingsSpy).toHaveBeenCalledTimes(1);
            [ws1, v2].forEach((ws) => {
              expect(extensionManager.getByName(ws.name)).toBeDefined();
            });
            expect(extensionManager.getByName(v1.name)).toBeUndefined();
          });
        });
      });
    });

    describe('onDidChangeWorkspaceFolders()', () => {
      it('will ignore folder change if IgnoreWorkspaceChanges is true', () => {
        context.workspaceState.get.mockReturnValue(true);
        extensionManager.onDidChangeWorkspaceFolders();
        expect(addExtensionSpy).not.toHaveBeenCalled();
      });
      it('should add/remove extensions for the added/removed folders', () => {
        const f1 = makeWorkspaceFolder('added-1');
        const f2 = makeWorkspaceFolder('added-2');

        expect(extensionManager.getByName(workspaceFolder1.name)).toBeDefined();

        // added 2 folders
        (vscode.workspace as any).workspaceFolders = [workspaceFolder1, f1, f2];
        // but only f1 is enabled
        mockEnabledWorkspaceFolders.mockReturnValue([workspaceFolder1, f1]);

        extensionManager.onDidChangeWorkspaceFolders();

        expect(extensionManager.getByName(workspaceFolder1.name)).toBeDefined();
        expect(extensionManager.getByName(f1.name)).toBeDefined();
        expect(extensionManager.getByName(f2.name)).not.toBeDefined();

        // removed f1
        (vscode.workspace as any).workspaceFolders = [workspaceFolder1, f2];
        mockEnabledWorkspaceFolders.mockReturnValue([workspaceFolder1]);

        extensionManager.onDidChangeWorkspaceFolders();

        expect(extensionManager.getByName(workspaceFolder1.name)).toBeDefined();
        expect(extensionManager.getByName(f1.name)).not.toBeDefined();
        expect(extensionManager.getByName(f2.name)).not.toBeDefined();
      });

      describe('when virtual folders are used', () => {
        it('if a physical workspace folder is removed, it should unregister all virtual extensions under it', () => {
          const { ws1, ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);

          // verify these folder are registered
          [ws1, ws2_v1, ws2_v2].forEach((folder) => {
            expect(extensionManager.getByName(folder.name)).toBeDefined();
          });
          // ws2 is not registered because it used virtual folders
          expect(extensionManager.getByName(ws2.name)).not.toBeDefined();

          // now remove ws2, we should expect all virtual folders under it are unregistered
          (vscode.workspace as any).workspaceFolders = [workspaceFolder1, ws1];
          mockEnabledWorkspaceFolders.mockReturnValue([ws1]);

          extensionManager.onDidChangeWorkspaceFolders();

          [ws2, ws2_v1, ws2_v2].forEach((folder) => {
            expect(extensionManager.getByName(folder.name)).not.toBeDefined();
          });
        });
        it('can add or remove virtual folders', () => {
          const { ws1, ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);

          // adding a virtual folder ws2_v3
          const ws2_v3 = new VirtualWorkspaceFolder(ws2.name, 'ws-2-v3');

          mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2_v1, ws2_v2, ws2_v3]);
          extensionManager.onDidChangeWorkspaceFolders();
          expect(extensionManager.getByName(ws2_v3.name)).toBeDefined();
          expect(extensionManager.getByName(ws2_v1.name)).toBeDefined();

          // removing ws2_v1
          mockEnabledWorkspaceFolders.mockReturnValue([ws1, ws2_v2, ws2_v3]);
          extensionManager.onDidChangeWorkspaceFolders();
          expect(extensionManager.getByName(ws2_v3.name)).toBeDefined();
          expect(extensionManager.getByName(ws2_v1.name)).not.toBeDefined();
        });
      });
    });

    describe('onDidCloseTextDocument()', () => {
      afterEach(() => {
        jestInstances[0].onDidCloseTextDocument.mockClear();
      });
      it('should call extension method', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
          name: 'workspaceFolder1',
        });
        extensionManager.onDidCloseTextDocument({} as any);
        expect(jestInstances[0].onDidCloseTextDocument).toHaveBeenCalled();
      });

      it('should not call try to call extension method if no extension', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
        extensionManager.onDidCloseTextDocument({} as any);
        expect(jestInstances[0].onDidCloseTextDocument).not.toHaveBeenCalled();
      });
      it('will notify all extensions under the same actual workspace folder', () => {
        const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);

        // close a document in ws2, we should expect all extensions under ws2 are notified
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(ws2);
        extensionManager.onDidCloseTextDocument({} as any);
        expect(extensionManager.getByName(ws2_v1.name)?.onDidCloseTextDocument).toHaveBeenCalled();
        expect(extensionManager.getByName(ws2_v2.name)?.onDidCloseTextDocument).toHaveBeenCalled();
      });
    });

    describe('onDidChangeActiveTextEditor()', () => {
      afterEach(() => {
        jestInstances[0].onDidChangeActiveTextEditor.mockClear();
      });
      it('should call extension method', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
          name: 'workspaceFolder1',
        });
        extensionManager.onDidChangeActiveTextEditor({ document: {} } as any);
        expect(jestInstances[0].onDidChangeActiveTextEditor).toHaveBeenCalled();
      });

      it('should not call try to call extension method if no document', () => {
        extensionManager.onDidChangeActiveTextEditor({} as any);
        expect(jestInstances[0].onDidChangeActiveTextEditor).not.toHaveBeenCalled();
      });

      it('should not call try to call extension method if no extension', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
        extensionManager.onDidChangeActiveTextEditor({ document: {} } as any);
        expect(jestInstances[0].onDidChangeActiveTextEditor).not.toHaveBeenCalled();
      });
      it.each`
        case        | isInV1   | isInV2
        ${'case 1'} | ${true}  | ${true}
        ${'case 2'} | ${true}  | ${false}
        ${'case 3'} | ${false} | ${false}
      `(
        'case $case: will notify qualified extensions under the same actual workspace folder',
        ({ isInV1, isInV2 }) => {
          const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);
          isInWorkspaceSpy.mockReturnValueOnce(isInV1).mockReturnValueOnce(isInV2);

          // close a document in ws2, we should expect all extensions under ws2 are notified
          (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(ws2);
          extensionManager.onDidChangeActiveTextEditor({ document: {} } as any);
          if (isInV1) {
            expect(
              extensionManager.getByName(ws2_v1.name)?.onDidChangeActiveTextEditor
            ).toHaveBeenCalled();
          } else {
            expect(
              extensionManager.getByName(ws2_v1.name)?.onDidChangeActiveTextEditor
            ).not.toHaveBeenCalled();
          }
          if (isInV2) {
            expect(
              extensionManager.getByName(ws2_v2.name)?.onDidChangeActiveTextEditor
            ).toHaveBeenCalled();
          } else {
            expect(
              extensionManager.getByName(ws2_v2.name)?.onDidChangeActiveTextEditor
            ).not.toHaveBeenCalled();
          }
        }
      );
    });

    describe('onDidChangeTextDocument()', () => {
      afterEach(() => {
        jestInstances[0].onDidChangeTextDocument.mockClear();
      });
      it('should call extension method', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce({
          name: 'workspaceFolder1',
        });
        extensionManager.onDidChangeTextDocument({ document: {} } as any);
        expect(jestInstances[0].onDidChangeTextDocument).toHaveBeenCalled();
      });

      it('should not call try to call extension method if no extension', () => {
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(undefined);
        extensionManager.onDidChangeTextDocument({ document: {} } as any);
        expect(jestInstances[0].onDidChangeTextDocument).not.toHaveBeenCalled();
      });
      it('will notify all extensions under the same actual workspace folder', () => {
        const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);

        // close a document in ws2, we should expect all extensions under ws2 are notified
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(ws2);
        extensionManager.onDidChangeTextDocument({ document: {} } as any);
        expect(extensionManager.getByName(ws2_v1.name)?.onDidChangeTextDocument).toHaveBeenCalled();
        expect(extensionManager.getByName(ws2_v2.name)?.onDidChangeTextDocument).toHaveBeenCalled();
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
      it('will notify all extensions under the same actual workspace folder', () => {
        const { ws2, ws2_v1, ws2_v2 } = setupVirtualFolders(extensionManager);

        // close a document in ws2, we should expect all extensions under ws2 are notified
        const event: any = { document: {} };
        (vscode.workspace.getWorkspaceFolder as any).mockReturnValueOnce(ws2);
        extensionManager.onWillSaveTextDocument(event);
        expect(extensionManager.getByName(ws2_v1.name)?.onWillSaveTextDocument).toHaveBeenCalled();
        expect(extensionManager.getByName(ws2_v2.name)?.onWillSaveTextDocument).toHaveBeenCalled();
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
        ${'toggle-coverage'}                   | ${'toggleCoverage'}
        ${'workspace.toggle-coverage'}         | ${'toggleCoverage'}
        ${'run-all-tests'}                     | ${'runAllTests'}
        ${'workspace.run-all-tests'}           | ${'runAllTests'}
        ${'with-workspace.change-run-mode'}    | ${'changeRunMode'}
        ${'workspace.save-run-mode'}           | ${'saveRunMode'}
        ${'with-workspace.toggle-coverage'}    | ${'toggleCoverage'}
        ${'with-workspace.enable-login-shell'} | ${'enableLoginShell'}
        ${'with-workspace.item-command'}       | ${'runItemCommand'}
        ${'with-workspace.exit-defer-mode'}    | ${'exitDeferMode'}
        ${'with-workspace.setup-extension'}    | ${'setupExtensionForFolder'}
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
        ${'editor.workspace.toggle-coverage'} | ${'toggleCoverage'}
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
      it('disable workspace command', async () => {
        extensionManager.register();
        const applySettingsSpy = jest.spyOn(extensionManager, 'applySettings');
        (updateSetting as jest.Mocked<any>).mockReturnValue(true);

        const expectedName = `${extensionName}.with-workspace.disable`;
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
          expectedName,
          expect.anything()
        );
        const call = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls.find(
          (args) => args[0] === expectedName
        );
        expect(call).not.toBeUndefined();

        const registeredCallback = call[1];
        await registeredCallback('ws-2');
        expect(updateSetting).toHaveBeenCalled();
        expect(applySettingsSpy).toHaveBeenCalled();

        // if update failed, no applySettings will be called
        (updateSetting as jest.Mocked<any>).mockClear().mockImplementation(() => {
          throw new Error('error');
        });
        applySettingsSpy.mockClear();

        await registeredCallback('ws-2');
        expect(updateSetting).toHaveBeenCalled();
        expect(applySettingsSpy).not.toHaveBeenCalled();
      });
      it('showQuickFix command', async () => {
        extensionManager.register();
        const expectedName = `${extensionName}.with-workspace.show-quick-fix`;
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
          expectedName,
          expect.anything()
        );
        const call = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls.find(
          (args) => args[0] === expectedName
        );
        expect(call).not.toBeUndefined();

        const registeredCallback = call[1];
        await registeredCallback('ws-2', ['help']);
        expect(showQuickFix).toHaveBeenCalled();
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
        case | version     | showChoice | choice                  | showRN
        ${2} | ${'6.2.0'}  | ${true}    | ${undefined}            | ${false}
        ${3} | ${'6.2.0'}  | ${true}    | ${"See What's Changed"} | ${true}
        ${6} | ${'99.0.0'} | ${false}   | ${undefined}            | ${false}
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
              expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'vscode.open',
                expect.anything()
              );
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
