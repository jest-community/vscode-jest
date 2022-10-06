jest.unmock('../../../src/setup-wizard/tasks/setup-monorepo');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

import * as helper from '../../../src/setup-wizard/wizard-helper';
import { setupMonorepo } from '../../../src/setup-wizard/tasks/setup-monorepo';
import { WorkspaceManager } from '../../../src/setup-wizard/tasks/workspace-manager';

import { createWizardContext } from './task-test-helper';
import { workspaceFolder } from '../test-helper';

const mockWorkspaceManager = {
  getValidWorkspaces: jest.fn(),
  getFoldersFromFilesystem: jest.fn(),
};

const mockHelper = helper as jest.Mocked<any>;

describe('setupMonorepo', () => {
  const mockSaveConfig = jest.fn();
  const debugConfigProvider = {};
  let wizardSettings: { [key: string]: any };
  let context;

  beforeEach(() => {
    jest.resetAllMocks();

    vscode.workspace.updateWorkspaceFolders = jest.fn();
    vscode.workspace.openTextDocument = jest.fn();
    vscode.window.showTextDocument = jest.fn();

    wizardSettings = {};
    (WorkspaceManager as jest.Mocked<any>).mockImplementation(() => mockWorkspaceManager);
    // default helper function
    mockSaveConfig.mockImplementation(() => Promise.resolve());

    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);
    context = createWizardContext(debugConfigProvider);
  });

  describe('with singleroot workspace', () => {
    it('requires a multi-root workspace', async () => {
      expect.hasAssertions();
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
      await expect(setupMonorepo(context)).resolves.toEqual('exit');
      expect(context.message).toBeCalledWith(expect.anything(), 'warn');
    });
  });
  describe('when multi-root workspace', () => {
    beforeEach(() => {
      (vscode.workspace as any).workspaceFile = 'whatever.code-workspaces';
    });
    describe('when only 1 folder in config', () => {
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
        (vscode.workspace.updateWorkspaceFolders as jest.Mocked<any>).mockImplementation(
          (_a, _b, ...folders) => {
            (vscode.workspace as any).workspaceFolders = folders.map((folder) =>
              workspaceFolder(folder)
            );
          }
        );
      });
      describe('can find folders from file-systems and add to the workspaces', () => {
        it.each`
          case | paths                   | isError
          ${1} | ${['root', 'folder-1']} | ${false}
          ${2} | ${['root']}             | ${false}
          ${3} | ${[]}                   | ${false}
          ${4} | ${undefined}            | ${true}
        `('case $case', async ({ paths, isError }) => {
          expect.hasAssertions();
          const folderUris = paths?.map((p) => ({ fsPath: p }));
          mockWorkspaceManager.getFoldersFromFilesystem.mockImplementation(() => {
            if (folderUris) {
              return Promise.resolve(folderUris);
            }
            return Promise.reject(new Error('failed'));
          });
          mockWorkspaceManager.getValidWorkspaces.mockReturnValue(Promise.resolve([]));
          await expect(setupMonorepo(context)).resolves.toEqual(isError ? 'abort' : 'success');
          if (folderUris) {
            expect(vscode.workspace.updateWorkspaceFolders).toBeCalledWith(
              1,
              0,
              ...folderUris.map((uri) => ({ uri }))
            );
          } else {
            expect(vscode.workspace.updateWorkspaceFolders).not.toBeCalled();
          }
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
          mockWorkspaceManager.getValidWorkspaces.mockReturnValue(
            Promise.resolve(validWorkspaceInfo)
          );

          await expect(setupMonorepo(context)).resolves.toEqual('success');
          if (updateSetting) {
            expect(mockSaveConfig).toBeCalledWith({
              name: `jest.disabledWorkspaceFolders`,
              value: invalid,
            });
          } else {
            expect(mockSaveConfig).not.toBeCalled();
          }
        });
      });
      describe('can adjust rootPath', () => {
        beforeEach(() => {
          const validWorkspaceInfo = [wsInfo('folder-2', 'src'), wsInfo('folder-3')];
          mockWorkspaceManager.getValidWorkspaces.mockReturnValue(validWorkspaceInfo);
        });
        it('if no rootPath is defined, will confirm and update', async () => {
          expect.hasAssertions();

          (vscode.workspace.getConfiguration as jest.Mocked<any>).mockImplementation(() => ({
            get: () => undefined,
          }));
          mockHelper.getConfirmation.mockReturnValue(Promise.resolve(true));

          await expect(setupMonorepo(context)).resolves.toEqual('success');
          expect(mockSaveConfig).toBeCalledWith({
            name: `jest.rootPath`,
            value: 'src',
          });
          expect(mockSaveConfig).toBeCalledTimes(2);
        });
        it('if user already defined rootPath, will not override', async () => {
          (vscode.workspace.getConfiguration as jest.Mocked<any>).mockImplementation(() => ({
            get: () => 'src2',
          }));

          await expect(setupMonorepo(context)).resolves.toEqual('success');
          expect(mockHelper.getConfirmation).not.toBeCalled();
          expect(mockSaveConfig).not.toBeCalledWith(
            expect.objectContaining({ name: 'jest.rootPath' })
          );
          expect(mockSaveConfig).toBeCalledTimes(1);
        });
        it('user can abort rootPath update', async () => {
          expect.hasAssertions();

          (vscode.workspace.getConfiguration as jest.Mocked<any>).mockImplementation(() => ({
            get: () => undefined,
          }));
          mockHelper.getConfirmation.mockReturnValue(Promise.resolve(false));

          await expect(setupMonorepo(context)).resolves.toEqual('success');
          expect(mockSaveConfig).not.toBeCalledWith(
            expect.objectContaining({ name: 'jest.rootPath' })
          );
          expect(mockSaveConfig).toBeCalledTimes(1);
        });
      });
    });
  });
});
