jest.unmock('../../src/Settings/helper');
jest.unmock('../../src/Settings/types');
jest.unmock('../test-helper');
jest.unmock('../../src/virtual-workspace-folder');

import * as vscode from 'vscode';
import { createJestSettingGetter, updateSetting } from '../../src/Settings/helper';
import { VirtualWorkspaceFolder } from '../../src/virtual-workspace-folder';
import { makeWorkspaceFolder } from '../test-helper';
import { VirtualFolderSettingKey } from '../../src/Settings/types';

const mockConfiguration = (userSettings: any) => {
  vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
    get: (key) => userSettings[key],
  }));
};
describe('createJestSettingGetter', () => {
  let folderSetting;
  beforeEach(() => {
    folderSetting = {
      jestCommandLine: 'yarn test',
    };
  });
  it.each`
    case | virtualFolders                                                                                    | jestCommandLine
    ${1} | ${undefined}                                                                                      | ${'throw'}
    ${2} | ${[{ name: 'v1', debugMode: true }]}                                                              | ${'yarn test'}
    ${3} | ${[{ name: 'v1', jestCommandLine: '' }]}                                                          | ${''}
    ${4} | ${[{ name: 'v1', jestCommandLine: undefined }]}                                                   | ${'yarn test'}
    ${5} | ${[{ name: 'v1', jestCommandLine: 'yarn integ-test', rootPath: 'whatever' }]}                     | ${'yarn integ-test'}
    ${6} | ${[{ name: 'v2', jestCommandLine: 'yarn integ-test' }]}                                           | ${'throw'}
    ${7} | ${[{ name: 'v1', jestCommandLine: 'yarn test1' }, { name: 'v2', jestCommandLine: 'yarn test2' }]} | ${'yarn test1'}
    ${8} | ${[{ name: 'v1', rootPath: 'packages/v1' }, { name: 'v2', rootPath: 'packages/v2' }]}             | ${'yarn test'}
  `(
    'case $case: virtualFolder settings override the actual folder settings',
    ({ virtualFolders, jestCommandLine }) => {
      const userSettings = { ...folderSetting, virtualFolders };
      mockConfiguration(userSettings);

      const folder = makeWorkspaceFolder('workspaceFolder1');
      const vFolder = new VirtualWorkspaceFolder(folder, 'v1');

      if (jestCommandLine === 'throw') {
        expect(() => createJestSettingGetter(vFolder)).toThrow();
      } else {
        const getSetting = createJestSettingGetter(vFolder);
        expect(getSetting('jestCommandLine')).toEqual(jestCommandLine);
      }
    }
  );
  it('will ignore virtualFolder setting for regular WorkspaceFolder', () => {
    const userSettings = {
      debugMode: false,
      virtualFolders: [{ name: 'workspaceFolder1', debugMode: true }],
    };
    mockConfiguration(userSettings);

    const folder = makeWorkspaceFolder('workspaceFolder1');
    const getSetting = createJestSettingGetter(folder);

    expect(getSetting('debugMode')).toEqual(false);
  });
  it.each`
    case | folderSetting | vFolderSetting | expected
    ${1} | ${undefined}  | ${undefined}   | ${true}
    ${2} | ${undefined}  | ${false}       | ${false}
    ${3} | ${false}      | ${undefined}   | ${false}
    ${4} | ${false}      | ${true}        | ${false}
    ${5} | ${undefined}  | ${false}       | ${false}
  `(
    'case $case: for "enable" setting, any false value means disabled',
    ({ folderSetting, vFolderSetting, expected }) => {
      const userSettings = {
        enable: folderSetting,
        virtualFolders: [{ name: 'v1', enable: vFolderSetting }],
      };
      mockConfiguration(userSettings);

      const folder = makeWorkspaceFolder('workspaceFolder1');
      const vFolder = new VirtualWorkspaceFolder(folder, 'v1');
      const getSetting = createJestSettingGetter(vFolder);

      expect(getSetting('enable')).toEqual(expected);
    }
  );
});

describe('updateSetting', () => {
  const workspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.parse('file:///path/to/workspace'),
    name: 'workspace',
    index: 0,
  };
  const mockConfig = {
    update: jest.fn(),
    get: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();

    vscode.workspace.getConfiguration = jest.fn().mockReturnValue(mockConfig);
  });

  it('updates the setting for a non-virtual workspace folder', async () => {
    const key: VirtualFolderSettingKey = 'enable';
    const value = false;

    await updateSetting(workspaceFolder, key, value);

    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('jest', workspaceFolder.uri);
    expect(mockConfig.update).toHaveBeenCalledWith(key, value);
  });

  it('updates the setting for a virtual workspace folder', async () => {
    const v1Folder = { name: 'v1', rootPath: '/path/to/v1', enable: true };
    mockConfig.get.mockReturnValueOnce([v1Folder]);
    const key: VirtualFolderSettingKey = 'enable';
    const value = false;

    const v1 = new VirtualWorkspaceFolder(workspaceFolder, 'v1');
    await updateSetting(v1, key, value);

    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('jest', workspaceFolder.uri);
    expect(mockConfig.get).toHaveBeenCalledWith('virtualFolders');

    expect(mockConfig.update).toHaveBeenCalledWith('virtualFolders', [
      { ...v1Folder, enable: false },
    ]);
  });

  it('throws an error if the virtual folder setting is missing', async () => {
    const v1Folder = { name: 'v1', rootPath: '/path/to/v1', enable: true };
    mockConfig.get.mockReturnValueOnce([v1Folder]);

    const key: VirtualFolderSettingKey = 'enable';
    const value = false;

    const v2 = new VirtualWorkspaceFolder(workspaceFolder, 'v2');
    await expect(updateSetting(v2, key, value)).rejects.toThrow();
  });
});
