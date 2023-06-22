jest.unmock('../src/workspace-manager');
jest.unmock('../src/virtual-workspace-folder');
jest.unmock('./setup-wizard/test-helper');
jest.unmock('./test-helper');
jest.unmock('./setup-wizard/tasks/task-test-helper');

import * as path from 'path';
import * as vscode from 'vscode';

import { enabledWorkspaceFolders, isInFolder, WorkspaceManager } from '../src/workspace-manager';

import { getPackageJson, toAbsoluteRootPath } from '../src/helpers';
import { createJestSettingGetter } from '../src/Settings/index';
import { VirtualWorkspaceFolder } from '../src/virtual-workspace-folder';
import { toUri } from './setup-wizard/tasks/task-test-helper';
import { makeUri, makeWorkspaceFolder } from './test-helper';

const mockGetConfiguration = (
  disabledWorkspaceFolders?: string[],
  enabled?: 'all' | string[],
  vFolders?: any
) => {
  const getConfiguration = (scope, key) => {
    const target = scope?.name ?? scope?.fsPath;
    if (key === 'disabledWorkspaceFolders') {
      return disabledWorkspaceFolders;
    }
    if (key === 'enable') {
      if (!enabled) {
        return enabled;
      }
      return enabled === 'all' ? true : enabled.includes(target);
    }
    if (key === 'virtualFolders') {
      return vFolders?.[target];
    }
  };
  vscode.workspace.getConfiguration = jest.fn().mockImplementation((_section, scope) => ({
    get: (key) => getConfiguration(scope, key),
  }));

  (createJestSettingGetter as jest.Mocked<any>).mockImplementation(
    (folder) => (key) => getConfiguration(folder, key)
  );
};
describe('workspace-manager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (toAbsoluteRootPath as jest.Mocked<any>).mockImplementation(
      jest.requireActual('../src/helpers').toAbsoluteRootPath
    );
    mockGetConfiguration([], 'all');
  });
  describe('enabledWorkspaceFolders', () => {
    it('returns empty array if no workspace', () => {
      (vscode.workspace as any).workspaceFolders = undefined;
      expect(enabledWorkspaceFolders()).toEqual([]);
    });
    it.each`
      case | disabledWorkspaceFolders | enableSettings    | result
      ${1} | ${undefined}             | ${undefined}      | ${['ws1', 'ws2']}
      ${2} | ${[]}                    | ${['ws1']}        | ${['ws1']}
      ${3} | ${['ws1']}               | ${['ws1', 'ws2']} | ${['ws2']}
      ${4} | ${['ws2']}               | ${['ws1', 'ws2']} | ${['ws1']}
      ${5} | ${[]}                    | ${['ws1', 'ws2']} | ${['ws1', 'ws2']}
    `('case $case', ({ disabledWorkspaceFolders, enableSettings, result }) => {
      const folders = ['ws1', 'ws2'].map((name) => makeWorkspaceFolder(name));
      (vscode.workspace as any).workspaceFolders = folders;
      const disabled = disabledWorkspaceFolders?.map(
        (name) => folders.find((f) => f.name === name)?.name
      );
      const enabled = enableSettings?.map((name) => folders.find((f) => f.name === name)?.name);
      mockGetConfiguration(disabled, enabled);

      expect(enabledWorkspaceFolders().map((f) => f.name)).toEqual(result);
    });
    describe('with virtual folders', () => {
      let ws1, ws2, v1, v2;
      beforeEach(() => {
        ws1 = makeWorkspaceFolder('ws1');
        ws2 = makeWorkspaceFolder('ws2');
        v1 = new VirtualWorkspaceFolder(ws1, 'v1');
        v2 = new VirtualWorkspaceFolder(ws1, 'v2');
        (vscode.workspace as any).workspaceFolders = [ws1, ws2];
      });
      it('will include enabled virtual folders if indicated', () => {
        mockGetConfiguration([], 'all', {
          ws1: [{ name: v1.name }, { name: v2.name }],
        });
        expect(enabledWorkspaceFolders().map((f) => f.name)).toEqual(
          expect.arrayContaining(['ws2', 'v1', 'v2'])
        );
        expect(enabledWorkspaceFolders(false).map((f) => f.name)).toEqual(
          expect.arrayContaining(['ws1', 'ws2'])
        );
      });
      it('can filter disabled virtual folders', () => {
        mockGetConfiguration([], 'all', {
          ws1: [{ name: v1.name, enable: false }, { name: v2.name }],
        });
        expect(enabledWorkspaceFolders().map((f) => f.name)).toEqual(
          expect.arrayContaining(['ws2', 'v2'])
        );
        mockGetConfiguration(['v2'], 'all', {
          ws1: [{ name: v1.name, enable: false }, { name: v2.name }],
        });
        expect(enabledWorkspaceFolders().map((f) => f.name)).toEqual(
          expect.arrayContaining(['ws2'])
        );
      });
    });
  });

  describe('isInFolder', () => {
    let isInWorkspaceFolderSpy;
    beforeEach(() => {
      isInWorkspaceFolderSpy = jest.spyOn(VirtualWorkspaceFolder.prototype, 'isInWorkspaceFolder');
    });
    it.each`
      case | inActualFolder | inVirtualFolder | expected
      ${1} | ${true}        | ${true}         | ${true}
      ${2} | ${true}        | ${false}        | ${false}
      ${3} | ${false}       | ${false}        | ${false}
      ${3} | ${false}       | ${true}         | ${true}
    `(
      'case $case: checks if file is in virtual or actual workspace folder',
      ({ inActualFolder, inVirtualFolder, expected }) => {
        const folder = makeWorkspaceFolder('ws1');
        const v1 = new VirtualWorkspaceFolder(folder, 'v1');

        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValue(inActualFolder ? folder : undefined);
        isInWorkspaceFolderSpy.mockReturnValue(inVirtualFolder);
        const uri = makeUri('file');
        expect(isInFolder(uri, v1)).toEqual(expected);
        expect(isInFolder(uri, folder)).toEqual(inActualFolder);
      }
    );
  });

  describe('WorkspaceManager', () => {
    let mockFindFiles;
    beforeEach(() => {
      (vscode as any).RelativePattern = jest.fn((_ws, p) => p);
      (vscode.Uri as any).file = jest.fn((f) => ({ fsPath: f, path: f }));
      mockFindFiles = jest.fn();
      (vscode.workspace as any).findFiles = mockFindFiles;
    });

    describe('getFoldersFromFilesystem: find workspace folders', () => {
      const root = makeWorkspaceFolder('root');
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [root];
      });
      it('error if no workspace folder', async () => {
        expect.hasAssertions();

        (vscode.workspace as any).workspaceFolders = [];
        const wsManager = new WorkspaceManager();
        await expect(wsManager.getFoldersFromFilesystem).rejects.toThrow();
      });
      describe('can check for any workspace', () => {
        const w1 = makeWorkspaceFolder('w1');
        describe.each`
          desc                    | workspace    | rootWorkspace
          ${'from project root'}  | ${undefined} | ${root}
          ${'from sub workspace'} | ${w1}        | ${w1}
        `('$desc', ({ workspace, rootWorkspace }) => {
          it('from workspaces property in package.json', async () => {
            expect.hasAssertions();

            (getPackageJson as jest.Mocked<any>).mockReturnValue({ workspaces: ['folder-1'] });

            mockFindFiles.mockReturnValue(Promise.resolve([{ fsPath: 'folder-1/package.json' }]));
            const wsManager = new WorkspaceManager();
            const uris = await wsManager.getFoldersFromFilesystem(workspace);

            expect(vscode.workspace.findFiles).toHaveBeenCalledTimes(1);
            expect(vscode.RelativePattern).toHaveBeenCalledWith(
              rootWorkspace,
              'folder-1/**/package.json'
            );
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
            const uris = await wsManager.getFoldersFromFilesystem(workspace);

            expect(vscode.workspace.findFiles).toHaveBeenCalledTimes(1);
            expect(vscode.RelativePattern).toHaveBeenCalledWith(rootWorkspace, '**/package.json');

            expect(uris).toHaveLength(2);
            expect(uris.map((uri) => uri.fsPath)).toEqual(['folder-1', 'folder-2']);
          });
        });
      });
      it('if no folder is found, returns empty list', async () => {
        (vscode.workspace as any).workspaceFolders = [];
        mockFindFiles.mockReturnValue(Promise.resolve([]));
        const wsManager = new WorkspaceManager();
        await expect(wsManager.getFoldersFromFilesystem()).resolves.toEqual([]);
      });
    });
    describe('can validate jest eligible workspaces', () => {
      beforeEach(() => {
        (vscode.workspace as any).workspaceFolders = [
          makeWorkspaceFolder('root'),
          makeWorkspaceFolder('folder-1'),
          makeWorkspaceFolder('folder-2'),
        ];
        (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((u) => {
          const ws = u.fsPath.split(path.sep)[0];
          if (['root', 'folder-1', 'folder-2'].includes(ws)) {
            return { uri: toUri(ws), name: ws };
          }
        });
        (vscode as any).RelativePattern = jest.fn((ws, p) => [ws, p]);
      });
      describe('getValidWorkspaceFolders: returns all valid workspaces', () => {
        it('throw error if no workspace folders', async () => {
          expect.hasAssertions();
          (vscode.workspace as any).workspaceFolders = [];
          const wsManager = new WorkspaceManager();
          await expect(wsManager.getValidWorkspaceFolders()).rejects.toThrow();
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
            const wsList = await wsManager.getValidWorkspaceFolders();
            expect(wsList.map((ws) => ws.folder.name)).toEqual(['folder-1', 'folder-2']);
          });
          it('will ignore disabled folders', async () => {
            expect.hasAssertions();
            byBinary();
            mockGetConfiguration([], ['folder-1']);

            const wsManager = new WorkspaceManager();
            const wsList = await wsManager.getValidWorkspaceFolders();
            expect(wsList.map((ws) => ws.folder.name)).toEqual(['folder-1']);
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
            let wsList = await wsManager.validateWorkspaceFolder(
              makeWorkspaceFolder('root'),
              types
            );
            expect(wsList.map((ws) => ws.folder.name).sort()).toEqual(rootResult.sort());

            wsList = await wsManager.validateWorkspaceFolder(
              makeWorkspaceFolder('folder-1'),
              types
            );
            expect(wsList.map((ws) => ws.folder.name).sort()).toEqual(folder1Result.sort());

            wsList = await wsManager.validateWorkspaceFolder(
              makeWorkspaceFolder('folder-2'),
              types
            );
            expect(wsList.map((ws) => ws.folder.name).sort()).toEqual(folder2Result.sort());
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

          const workspace = makeWorkspaceFolder('folder-1');
          const wsManager = new WorkspaceManager();
          const wsList = await wsManager.validateWorkspaceFolder(workspace, ['deep-config']);
          expect(wsList).toHaveLength(1);
          expect(wsList[0]).toEqual({
            folder: workspace,
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

          const workspace = makeWorkspaceFolder('folder-1');
          const wsManager = new WorkspaceManager();
          const wsList = await wsManager.validateWorkspaceFolder(workspace, ['deep-config']);
          expect(wsList).toHaveLength(0);
        });
      });
    });
  });
});
