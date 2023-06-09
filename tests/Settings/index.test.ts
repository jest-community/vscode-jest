jest.unmock('../../src/Settings/index');
jest.unmock('../test-helper');
jest.unmock('../../src/virtual-workspace-folder');

import * as vscode from 'vscode';
import { createJestSettingGetter } from '../../src/Settings/index';
import { VirtualWorkspaceFolder } from '../../src/virtual-workspace-folder';
import { makeWorkspaceFolder } from '../test-helper';

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
