jest.unmock('../../../src/setup-wizard/tasks/workspace-manager');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';
import * as path from 'path';

import { WorkspaceManager } from '../../../src/setup-wizard/tasks/workspace-manager';

import { workspaceFolder } from '../test-helper';
import { getPackageJson } from '../../../src/helpers';
import { toUri } from './task-test-helper';

describe('workspaceFolder', () => {
  let mockFindFiles;
  beforeEach(() => {
    jest.resetAllMocks();
    (vscode as any).RelativePattern = jest.fn((_ws, p) => p);
    (vscode.Uri as any).file = jest.fn((f) => ({ fsPath: f }));
    mockFindFiles = jest.fn();
    (vscode.workspace as any).findFiles = mockFindFiles;
  });

  describe('getFoldersFromFilesystem: find workspace folders', () => {
    beforeEach(() => {
      (vscode.workspace as any).workspaceFolders = [workspaceFolder('root')];
    });
    it('error if no workspace folder', async () => {
      expect.hasAssertions();

      (vscode.workspace as any).workspaceFolders = [];
      const wsManager = new WorkspaceManager();
      await expect(wsManager.getFoldersFromFilesystem).rejects.toThrowError();
    });
    it('from workspaces property in package.json', async () => {
      expect.hasAssertions();

      (getPackageJson as jest.Mocked<any>).mockReturnValue({ workspaces: ['folder-1'] });

      mockFindFiles.mockReturnValue(Promise.resolve([{ fsPath: 'folder-1' }]));
      const wsManager = new WorkspaceManager();
      const uris = await wsManager.getFoldersFromFilesystem();

      expect(vscode.workspace.findFiles).toBeCalledTimes(1);
      expect(vscode.RelativePattern).toBeCalledWith(expect.anything(), 'folder-1');
      expect(uris).toHaveLength(1);
      expect(uris.map((uri) => uri.fsPath)).toEqual(['folder-1']);
    });
    it('from directory contains package.json', async () => {
      expect.hasAssertions();

      // package.json did not contain workspaces
      (getPackageJson as jest.Mocked<any>).mockReturnValue({});

      mockFindFiles.mockReturnValue(
        Promise.resolve([
          { fsPath: path.join('folder-1', 'package.json') },
          { fsPath: path.join('folder-2', 'package.json') },
        ])
      );
      const wsManager = new WorkspaceManager();
      const uris = await wsManager.getFoldersFromFilesystem();

      expect(vscode.workspace.findFiles).toBeCalledTimes(1);
      expect(vscode.workspace.findFiles).toBeCalledWith(
        expect.stringContaining('package.json'),
        expect.anything()
      );
      expect(uris).toHaveLength(2);
      expect(uris.map((uri) => uri.fsPath)).toEqual(['folder-1', 'folder-2']);
    });
    it('if no folder is found, throw exception', async () => {
      (vscode.workspace as any).workspaceFolders = [];
      mockFindFiles.mockReturnValue(Promise.resolve([]));
      const wsManager = new WorkspaceManager();
      await expect(wsManager.getFoldersFromFilesystem()).rejects.toThrowError();
    });
  });
  describe('can validate jest eligible workspaces', () => {
    beforeEach(() => {
      (vscode.workspace as any).workspaceFolders = [
        workspaceFolder('root'),
        workspaceFolder('folder-1'),
        workspaceFolder('folder-2'),
      ];
      (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((u) => {
        const ws = u.fsPath.split(path.sep)[0];
        if (['root', 'folder-1', 'folder-2'].includes(ws)) {
          return { uri: { fsPath: ws }, name: ws };
        }
      });
      (vscode as any).RelativePattern = jest.fn((ws, p) => [ws, p]);
    });
    describe('getValidWorkspaces: returns all valid workspaces', () => {
      it('throw error if no workspace folders', async () => {
        expect.hasAssertions();
        (vscode.workspace as any).workspaceFolders = [];
        const wsManager = new WorkspaceManager();
        await expect(wsManager.getValidWorkspaces()).rejects.toThrowError();
      });
      describe('validate algorithms', () => {
        const byJestConfig = () => {
          mockFindFiles.mockImplementation(([ws, pattern]) => {
            // 'folder-1' and 'folder-2' have 'jest-config.xxx' file
            if (pattern.startsWith('**/jest.config.') && ws.name === 'root') {
              return Promise.resolve([
                toUri('folder-1', 'jest.config.js'),
                toUri('folder-2', 'jest.config.ts'),
              ]);
            }
            return Promise.resolve([]);
          });
        };
        const byVscodeJest = () => {
          mockFindFiles.mockImplementation(([ws, pattern]) => {
            // 'folder-1' and 'folder-2' have '.vscode-jest' file
            if (pattern.startsWith('**/.vscode-jest') && ws.name === 'root') {
              return Promise.resolve([
                toUri('folder-1', '.vscode-jest'),
                toUri('folder-2', '.vscode-jest'),
              ]);
            }
            return Promise.resolve([]);
          });
        };
        const byBinary = () => {
          mockFindFiles.mockImplementation(([ws, pattern]) => {
            // 'folder-1' and 'folder-2' has jest binary in node_modules
            if (pattern.startsWith('node_modules') && ws.name !== 'root') {
              return Promise.resolve([toUri(ws.name, 'jest')]);
            }
            return Promise.resolve([]);
          });
        };
        const byJestInPackageJson = () => {
          mockFindFiles.mockResolvedValue([]);
          // folder-1 and folder-2 have jest config embedded inside package.json
          (getPackageJson as jest.Mocked<any>).mockImplementation((aPath: string) => {
            return aPath !== 'root' ? { jest: {} } : {};
          });
        };
        it.each`
          desc                                | init
          ${'by jest.config'}                 | ${byJestConfig}
          ${'by binary'}                      | ${byBinary}
          ${'by .vscode-jest'}                | ${byVscodeJest}
          ${'by jest config in package.json'} | ${byJestInPackageJson}
        `('$desc', async ({ init }) => {
          expect.hasAssertions();
          init();

          const wsManager = new WorkspaceManager();
          const wsList = await wsManager.getValidWorkspaces();
          expect(wsList.map((ws) => ws.workspace.name)).toEqual(['folder-1', 'folder-2']);
        });
      });
    });
    describe('can validate individual workspace', () => {
      beforeEach(() => {
        //root has jest in package.json
        (getPackageJson as jest.Mocked<any>).mockImplementation((aPath: string) => {
          return aPath === 'root' ? { jest: {} } : {};
        });

        // folder-1 has a jest.config
        //folder-2 has binary
        mockFindFiles.mockImplementation(([ws, pattern]) => {
          if (
            (pattern.startsWith('**/jest.config.') && ['root', 'folder-1'].includes(ws.name)) ||
            (pattern.startsWith('jest.config.') && ws.name === 'folder-1')
          ) {
            return Promise.resolve([toUri('folder-1', 'jest.config.mjs')]);
          }
          if (pattern.startsWith('node_modules') && ws.name === 'folder-2') {
            return Promise.resolve([toUri(ws.name, 'jest')]);
          }
          return Promise.resolve([]);
        });
      });
      it.each`
        types                                           | rootResult              | folder1Result   | folder2Result
        ${['deep-config']}                              | ${['folder-1']}         | ${['folder-1']} | ${[]}
        ${['shallow-config']}                           | ${[]}                   | ${['folder-1']} | ${[]}
        ${['binary']}                                   | ${[]}                   | ${[]}           | ${['folder-2']}
        ${['jest-in-package']}                          | ${['root']}             | ${[]}           | ${[]}
        ${['deep-config', 'binary']}                    | ${['folder-1']}         | ${['folder-1']} | ${['folder-2']}
        ${['deep-config', 'binary', 'jest-in-package']} | ${['root', 'folder-1']} | ${['folder-1']} | ${['folder-2']}
      `(
        'can validate by types=$types',
        async ({ types, rootResult, folder1Result, folder2Result }) => {
          expect.hasAssertions();

          const wsManager = new WorkspaceManager();
          let wsList = await wsManager.validateWorkspace(workspaceFolder('root'), types);
          expect(wsList.map((ws) => ws.workspace.name).sort()).toEqual(rootResult.sort());

          wsList = await wsManager.validateWorkspace(workspaceFolder('folder-1'), types);
          expect(wsList.map((ws) => ws.workspace.name).sort()).toEqual(folder1Result.sort());

          wsList = await wsManager.validateWorkspace(workspaceFolder('folder-2'), types);
          expect(wsList.map((ws) => ws.workspace.name).sort()).toEqual(folder2Result.sort());
        }
      );
      it('can detect rootPath', async () => {
        expect.hasAssertions();

        const activation = toUri('folder-1', 'src', 'jest.config.mjs');
        mockFindFiles.mockImplementation(([ws, pattern]) => {
          if (pattern.startsWith('**/jest.config.') && ['folder-1'].includes(ws.name)) {
            return Promise.resolve([activation]);
          }
          return Promise.resolve([]);
        });

        const workspace = workspaceFolder('folder-1');
        const wsManager = new WorkspaceManager();
        const wsList = await wsManager.validateWorkspace(workspace, ['deep-config']);
        expect(wsList).toHaveLength(1);
        expect(wsList[0]).toEqual({
          workspace,
          rootPath: `.${path.sep}src`,
          activation,
        });
      });
      it('can ignore activation if not a workspace', async () => {
        expect.hasAssertions();

        const activation = toUri('folder-3', 'jest.config.mjs');
        mockFindFiles.mockImplementation(([ws, pattern]) => {
          if (pattern.startsWith('**/jest.config.') && ['folder-1'].includes(ws.name)) {
            return Promise.resolve([activation]);
          }
          return Promise.resolve([]);
        });

        const workspace = workspaceFolder('folder-1');
        const wsManager = new WorkspaceManager();
        const wsList = await wsManager.validateWorkspace(workspace, ['deep-config']);
        expect(wsList).toHaveLength(0);
      });
    });
  });
});
