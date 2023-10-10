jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/JestExt/run-mode');
jest.unmock('../../src/virtual-workspace-folder');
jest.unmock('../test-helper');

const mockPlatform = jest.fn();
const mockUserInfo = jest.fn();
jest.mock('os', () => ({ platform: mockPlatform, userInfo: mockUserInfo }));

import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import {
  createJestExtContext,
  getExtensionResourceSettings,
  isWatchRequest,
  outputFileSuffix,
  prefixWorkspace,
} from '../../src/JestExt/helper';
import { RunMode } from '../../src/JestExt/run-mode';
import { ProjectWorkspace } from 'jest-editor-support';
import { workspaceLogging } from '../../src/logging';
import { makeWorkspaceFolder, mockProjectWorkspace } from '../test-helper';

import { toFilePath, toAbsoluteRootPath } from '../../src/helpers';
import { RunnerWorkspaceOptions } from '../../src/JestExt/types';
import { RunShell } from '../../src/JestExt/run-shell';
import { createJestSettingGetter } from '../../src/Settings';

jest.mock('jest-editor-support', () => ({ isLoginShell: jest.fn(), ProjectWorkspace: jest.fn() }));

describe('createJestExtContext', () => {
  beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });
  const baseSettings = {
    runMode: new RunMode('watch'),
    shell: { toSetting: jest.fn() },
    jestCommandLine: 'jest',
  };
  const workspaceFolder: any = { name: 'workspace' };
  const output: any = jest.fn();

  describe('runnerWorkspace', () => {
    it('will return runnerWorkspace factory method', () => {
      const rootPath = 'abc';
      const settings: any = { ...baseSettings, rootPath };

      jest.clearAllMocks();
      const mockRunnerWorkspace = { rootPath };
      (ProjectWorkspace as jest.Mocked<any>).mockReturnValue(mockRunnerWorkspace);

      const context = createJestExtContext(workspaceFolder, settings, output);
      expect(typeof context.createRunnerWorkspace).toEqual('function');
      expect(ProjectWorkspace).not.toHaveBeenCalled();

      const runnerWorkspace = context.createRunnerWorkspace();
      expect(ProjectWorkspace).toHaveBeenCalled();
      expect(toFilePath).toHaveBeenCalledWith(rootPath);
      expect(runnerWorkspace).toEqual(mockRunnerWorkspace);
    });
    it('will pass through useDashedArgs', () => {
      const settings: any = { ...baseSettings, useDashedArgs: true };

      jest.clearAllMocks();

      const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings, output);
      createRunnerWorkspace();
      const args = (ProjectWorkspace as jest.Mocked<any>).mock.calls[0];
      const [useDashedArgs] = [args[9]];
      expect(useDashedArgs).toBeTruthy();
    });
    describe('allow creating runnerWorkspace with custom options', () => {
      it('outputFileSuffix and collectCoverage', () => {
        const settings: any = { ...baseSettings, showCoverageOnLoad: false };

        jest.clearAllMocks();

        const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings, output);

        let options: RunnerWorkspaceOptions = { outputFileSuffix: 'extra' };
        createRunnerWorkspace(options);
        let args = (ProjectWorkspace as jest.Mocked<any>).mock.calls[0];
        let [outputFileSuffix, collectCoverage] = [args[4], args[5]];

        expect(outputFileSuffix.endsWith('extra')).toBeTruthy();
        expect(collectCoverage).toBeFalsy();

        options = { collectCoverage: true };
        createRunnerWorkspace(options);
        args = (ProjectWorkspace as jest.Mocked<any>).mock.calls[1];
        [outputFileSuffix, collectCoverage] = [args[4], args[5]];
        expect(collectCoverage).toEqual(true);
      });
    });
    describe('construct outputFileSuffix', () => {
      it.each`
        case | uInfo                                  | extra           | expected
        ${1} | ${{ uid: 123, username: 'user1' }}     | ${undefined}    | ${'123'}
        ${2} | ${{ uid: 0, username: 'user1' }}       | ${undefined}    | ${'0'}
        ${3} | ${{ uid: 123, username: 'user1' }}     | ${'extra'}      | ${'123_extra'}
        ${4} | ${{ uid: -1, username: 'john smith' }} | ${'extra'}      | ${'john_smith_extra'}
        ${5} | ${{ uid: -1, username: 'a**name' }}    | ${'with space'} | ${'a__name_with_space'}
      `('case $case', ({ uInfo, extra, expected }) => {
        mockUserInfo.mockReturnValue(uInfo);
        const ws = 'a';
        expect(outputFileSuffix(ws, extra)).toEqual(`${ws}_${expected}`);
      });
    });
    it('if no jestCommandLine defined, throw exception', () => {
      jest.clearAllMocks();
      (ProjectWorkspace as jest.Mocked<any>).mockImplementation(mockProjectWorkspace);

      const settings: any = { ...baseSettings, jestCommandLine: '' };
      const context = createJestExtContext(workspaceFolder, settings, output);
      expect(() => context.createRunnerWorkspace()).toThrow();
    });
  });
  it('will create logging factory', () => {
    const settings: any = { ...baseSettings };
    (workspaceLogging as jest.Mocked<any>).mockReturnValue({});
    const context = createJestExtContext(workspaceFolder, settings, output);
    expect(workspaceLogging).toHaveBeenCalled();
    expect(context.loggingFactory).toEqual({});
  });
});

describe('isWatchRequest', () => {
  it.each`
    requestType          | result
    ${'watch-tests'}     | ${true}
    ${'watch-all-tests'} | ${true}
    ${'all-tests'}       | ${false}
    ${'by-file'}         | ${false}
    ${'non-test'}        | ${false}
  `('$requestType => $result', ({ requestType, result }) => {
    const request: any = { type: requestType };
    expect(isWatchRequest(request)).toEqual(result);
  });
});

describe('getExtensionResourceSettings()', () => {
  let userSettings: any;
  let mockShell: any;
  beforeEach(() => {
    userSettings = {};
    (toAbsoluteRootPath as jest.Mocked<any>).mockImplementation(
      jest.requireActual('../../src/helpers').toAbsoluteRootPath
    );
    (createJestSettingGetter as jest.Mocked<any>).mockImplementation(() => {
      const data = readFileSync('./package.json');
      const config = JSON.parse(data.toString()).contributes.configuration.properties;

      const defaults = {};
      for (const key of Object.keys(config)) {
        if (key.startsWith('jest')) {
          defaults[key] = config[key].default;
        }
      }
      return jest.fn().mockImplementation((key) => userSettings[key] ?? defaults[`jest.${key}`]);
    });
    mockShell = jest.fn();
    (RunShell as jest.Mocked<any>).mockImplementation(() => mockShell);
  });
  it('should return the extension resource configuration', async () => {
    const folder = makeWorkspaceFolder('workspaceFolder1');
    expect(getExtensionResourceSettings(folder)).toEqual({
      coverageFormatter: 'DefaultFormatter',
      jestCommandLine: undefined,
      rootPath: 'workspaceFolder1',
      debugMode: false,
      coverageColors: null,
      runMode: expect.objectContaining({ config: { type: 'watch', revealOutput: 'on-run' } }),
      monitorLongRun: 60000,
      shell: mockShell,
      parserPluginOptions: null,
      enable: true,
      nodeEnv: undefined,
      useDashedArgs: false,
    });
    expect(createJestSettingGetter).toHaveBeenCalledWith(folder);
  });

  it('with nodeEnv and shell path', () => {
    userSettings = {
      nodeEnv: { whatever: '1' },
      shell: mockShell,
    };
    const folder = makeWorkspaceFolder('workspaceFolder1');
    const settings = getExtensionResourceSettings(folder);
    expect(settings).toEqual(
      expect.objectContaining({
        ...userSettings,
      })
    );
  });

  describe('runMode', () => {
    it('pass along legacy settings', () => {
      userSettings = {
        showCoverageOnLoad: true,
        autoRevealOutput: 'off',
        autoRun: 'off',
        testExplorer: { showInlineError: true },
      };
      const folder = makeWorkspaceFolder('workspaceFolder1');
      const settings = getExtensionResourceSettings(folder);
      expect(settings.runMode.config).toEqual({
        type: 'on-demand',
        revealOutput: 'on-demand',
        coverage: true,
        showInlineError: true,
      });
    });
    it('if there is runMode, it will ignore the legacy settings', () => {
      userSettings = {
        showCoverageOnLoad: true,
        autoRevealOutput: 'off',
        autoRun: 'off',
        runMode: 'on-save',
      };
      const folder = makeWorkspaceFolder('workspaceFolder1');
      const settings = getExtensionResourceSettings(folder);
      expect(settings.runMode.config).toEqual({
        type: 'on-save',
        revealOutput: 'on-run',
      });
    });
  });
});
describe('prefixWorkspace', () => {
  const context: any = { workspace: { name: 'ws' } };
  it('will not prefix if not multi-root', () => {
    (vscode.workspace as any).workspaceFolders = [{}];
    expect(prefixWorkspace(context, 'a message')).toEqual('a message');
  });
  it('prefix workspace name for multi-root workspace message', () => {
    (vscode.workspace as any).workspaceFolders = [{}, {}];
    expect(prefixWorkspace(context, 'a message')).toEqual('(ws) a message');
  });
});
