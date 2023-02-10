jest.unmock('../../../src/setup-wizard/tasks/setup-monorepo');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

import * as helper from '../../../src/setup-wizard/wizard-helper';
import {
  IgnoreWorkspaceChanges,
  MonorepoSetupActionId,
  setupMonorepo,
} from '../../../src/setup-wizard/tasks/setup-monorepo';
import { isSameWorkspace } from '../../../src/workspace-manager';

import { createWizardContext } from './task-test-helper';
import { mockWizardHelper, workspaceFolder } from '../test-helper';
import { PendingSetupTaskKey } from '../../../src/setup-wizard/start-wizard';
import { setupJestCmdLine } from '../../../src/setup-wizard/tasks/setup-jest-cmdline';

const mockHelper = helper as jest.Mocked<any>;
const { mockShowActionMenu, mockHelperSetup } = mockWizardHelper(mockHelper);

describe('setupMonorepo', () => {
  const mockSaveConfig = jest.fn();
  const debugConfigProvider = {};
  let wizardSettings: { [key: string]: any };
  let context;

  beforeEach(() => {
    jest.resetAllMocks();

    mockHelperSetup();

    vscode.workspace.updateWorkspaceFolders = jest.fn();
    vscode.workspace.openTextDocument = jest.fn();
    vscode.window.showTextDocument = jest.fn();

    wizardSettings = {};
    (isSameWorkspace as jest.Mocked<any>).mockImplementation(
      (ws1, ws2) => ws1.uri.path === ws2.uri.path
    ),
      // default helper function
      mockSaveConfig.mockImplementation(() => Promise.resolve());

    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);
    context = createWizardContext(debugConfigProvider);
  });
  it('without workspace will abort right away', async () => {
    expect.hasAssertions();
    (vscode.workspace as any).workspaceFolders = [];
    await expect(setupMonorepo(context)).rejects.toThrow();
    expect(helper.showActionMenu).not.toHaveBeenCalled();
  });
  describe('with singleroot workspace', () => {
    it('can still support monorepo', async () => {
      expect.hasAssertions();
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
      (setupJestCmdLine as jest.Mocked<any>).mockResolvedValue('success');
      mockShowActionMenu(MonorepoSetupActionId.setupJestCmdLine);
      await expect(setupMonorepo(context)).resolves.toEqual('success');
      expect(setupJestCmdLine).toHaveBeenCalled();
    });
    it('can auto convert to a multi-root workspace', async () => {
      expect.hasAssertions();
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
      mockShowActionMenu(MonorepoSetupActionId.autoConvert);
      await expect(setupMonorepo(context)).resolves.toEqual('exit');

      // updated pending task global state
      expect(context.vscodeContext.globalState.update).toHaveBeenCalledWith(PendingSetupTaskKey, {
        workspace: 'root',
        taskId: 'monorepo',
      });
      // execute saveWorkspaceAs command
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.saveWorkspaceAs'
      );
    });
    it('if not able to run test in terminal => abort', async () => {
      expect.hasAssertions();
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
      mockShowActionMenu(MonorepoSetupActionId.notSetup);
      await expect(setupMonorepo(context)).resolves.toEqual('abort');
    });
    it('user can abort', async () => {
      expect.hasAssertions();
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
      mockShowActionMenu(MonorepoSetupActionId.abort);
      await expect(setupMonorepo(context)).resolves.toEqual('abort');

      // updated pending task global state
      expect(context.vscodeContext.globalState.update).not.toHaveBeenCalled();
      // execute saveWorkspaceAs command
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });
  describe('when multi-root workspace', () => {
    beforeEach(() => {
      (vscode.workspace as any).workspaceFile = 'whatever.code-workspaces';
    });
    describe('when only 1 folder in multi-root workspace', () => {
      let subscription;
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
        (vscode.workspace.updateWorkspaceFolders as jest.Mocked<any>).mockImplementation(
          (_a, _b, ...folders) => {
            (vscode.workspace as any).workspaceFolders = folders.map((folder) =>
              workspaceFolder(folder)
            );
          }
        );
        subscription = { dispose: jest.fn() };
        (vscode.workspace as any).onDidChangeWorkspaceFolders = jest
          .fn()
          .mockImplementation((f) => {
            f();
            return subscription;
          });
      });
      describe('can find folders from file-systems and add to the workspaces', () => {
        it.each`
          case | paths                            | isError
          ${1} | ${['root', 'packages/folder-1']} | ${false}
          ${2} | ${['root']}                      | ${false}
          ${3} | ${[]}                            | ${false}
          ${4} | ${undefined}                     | ${true}
        `('case $case', async ({ paths, isError }) => {
          expect.hasAssertions();
          const folderUris = paths?.map((p) => ({ fsPath: p, path: p }));
          context.wsManager.getFoldersFromFilesystem.mockImplementation(() => {
            if (folderUris) {
              return Promise.resolve(folderUris);
            }
            return Promise.reject(new Error('failed'));
          });
          context.wsManager.getValidWorkspaces.mockReturnValue(Promise.resolve([]));
          (vscode.workspace.updateWorkspaceFolders as jest.Mocked<any>).mockReturnValue(true);

          await expect(setupMonorepo(context)).resolves.toEqual(isError ? 'abort' : 'success');

          if (!isError) {
            expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled();
            expect(subscription.dispose).toHaveBeenCalled();
            expect(context.vscodeContext.workspaceState.update).toHaveBeenCalledTimes(2);
            expect(context.vscodeContext.workspaceState.update).toHaveBeenNthCalledWith(
              1,
              IgnoreWorkspaceChanges,
              true
            );
            expect(context.vscodeContext.workspaceState.update).toHaveBeenNthCalledWith(
              2,
              IgnoreWorkspaceChanges,
              undefined
            );
          }
          if (folderUris) {
            expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
              1,
              null,
              ...folderUris.map((uri) => ({ uri }))
            );
          } else {
            expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
          }
        });
        it('only validate workspace if updateWorkspaceFolders succeeds', async () => {
          expect.hasAssertions();
          const folderUris = [{ fsPath: 'whatever', path: 'whatever' }];
          context.wsManager.getFoldersFromFilesystem.mockImplementation(() => {
            return Promise.resolve(folderUris);
          });
          context.wsManager.getValidWorkspaces.mockReturnValue(Promise.resolve([]));
          (vscode.workspace.updateWorkspaceFolders as jest.Mocked<any>).mockReturnValue(false);

          await expect(setupMonorepo(context)).rejects.toThrow();
        });
      });
    });
    describe('when more than 1 folder in config', () => {
      const wsInfo = (wsName: string, rootPath?: string) => ({
        workspace: workspaceFolder(wsName),
        rootPath,
      });
      const wsNames = ['root', 'folder-1', 'folder-2', 'folder-3'];
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = wsNames.map((d) => workspaceFolder(d));
      });
      describe('can validate each workspace folder and disable invalid ones', () => {
        it.each`
          invalid                 | updateSetting
          ${[]}                   | ${false}
          ${['root', 'folder-2']} | ${true}
          ${wsNames}              | ${true}
        `('invalid workspaces: $invalid', async ({ invalid, updateSetting }) => {
          expect.hasAssertions();

          const validWorkspaceInfo = wsNames
            .filter((n) => !invalid.includes(n))
            .map((vn) => wsInfo(vn));
          context.wsManager.getValidWorkspaces.mockReturnValue(Promise.resolve(validWorkspaceInfo));

          await expect(setupMonorepo(context)).resolves.toEqual('success');
          if (updateSetting) {
            expect(context.workspace).toBeUndefined();
            expect(mockSaveConfig).toHaveBeenCalledWith({
              name: `jest.disabledWorkspaceFolders`,
              value: invalid,
            });
          } else {
            expect(mockSaveConfig).not.toHaveBeenCalled();
          }
        });
      });
      describe('can adjust rootPath', () => {
        beforeEach(() => {
          const validWorkspaceInfo = [wsInfo('folder-2', 'src'), wsInfo('folder-3')];
          context.wsManager.getValidWorkspaces.mockReturnValue(validWorkspaceInfo);
        });
        it('if no rootPath is defined, will automatically update', async () => {
          expect.hasAssertions();

          (vscode.workspace.getConfiguration as jest.Mocked<any>).mockImplementation(() => ({
            get: () => undefined,
          }));
          mockHelper.getConfirmation.mockReturnValue(Promise.resolve(true));

          await expect(setupMonorepo(context)).resolves.toEqual('success');

          expect(mockHelper.getConfirmation).not.toHaveBeenCalled();

          expect(mockSaveConfig).toHaveBeenCalledWith({
            name: `jest.rootPath`,
            value: 'src',
          });
          expect(mockSaveConfig).toHaveBeenCalledTimes(2);
        });
        it.each`
          override
          ${true}
          ${false}
        `('confirm override ($override) if user already defined rootPath', async ({ override }) => {
          (vscode.workspace.getConfiguration as jest.Mocked<any>).mockImplementation(() => ({
            get: () => 'src2',
          }));

          mockHelper.getConfirmation.mockReturnValue(Promise.resolve(override));
          await expect(setupMonorepo(context)).resolves.toEqual('success');
          expect(mockHelper.getConfirmation).toHaveBeenCalled();

          if (override) {
            expect(mockSaveConfig).toHaveBeenCalledWith({
              name: `jest.rootPath`,
              value: 'src',
            });
            expect(mockSaveConfig).toHaveBeenCalledTimes(2);
          } else {
            expect(mockSaveConfig).not.toHaveBeenCalledWith({
              name: `jest.rootPath`,
              value: 'src',
            });
            expect(mockSaveConfig).toHaveBeenCalledTimes(1);
          }
        });
      });
    });
  });
});
