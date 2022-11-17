jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/JestExt/auto-run');
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
import { ProjectWorkspace } from 'jest-editor-support';
import { workspaceLogging } from '../../src/logging';
import { pathToJest, pathToConfig } from '../../src/helpers';
import { mockProjectWorkspace } from '../test-helper';

import { toFilePath } from '../../src/helpers';
import { RunnerWorkspaceOptions } from '../../src/JestExt/types';
import { RunShell } from '../../src/JestExt/run-shell';

jest.mock('jest-editor-support', () => ({ isLoginShell: jest.fn(), ProjectWorkspace: jest.fn() }));

describe('createJestExtContext', () => {
  beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });
  const baseSettings = { autoRun: { watch: true }, shell: { toSetting: jest.fn() } };
  const workspaceFolder: any = { name: 'workspace' };

  describe('runnerWorkspace', () => {
    it('will return runnerWorkspace factory method', () => {
      const rootPath = 'abc';
      const settings: any = { ...baseSettings, rootPath };

      jest.clearAllMocks();
      const mockRunnerWorkspace = { rootPath };
      (ProjectWorkspace as jest.Mocked<any>).mockReturnValue(mockRunnerWorkspace);

      const context = createJestExtContext(workspaceFolder, settings);
      expect(typeof context.createRunnerWorkspace).toEqual('function');
      expect(ProjectWorkspace).not.toHaveBeenCalled();

      const runnerWorkspace = context.createRunnerWorkspace();
      expect(ProjectWorkspace).toHaveBeenCalled();
      expect(toFilePath).toHaveBeenCalledWith(rootPath);
      expect(runnerWorkspace).toEqual(mockRunnerWorkspace);
    });
    describe('allow creating runnerWorkspace with custom options', () => {
      it('outputFileSuffix and collectCoverage', () => {
        const settings: any = { ...baseSettings, showCoverageOnLoad: false };

        jest.clearAllMocks();

        const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings);

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
  });
  it('will create logging factory', () => {
    const settings: any = { ...baseSettings };
    (workspaceLogging as jest.Mocked<any>).mockReturnValue({});
    const context = createJestExtContext(workspaceFolder, settings);
    expect(workspaceLogging).toHaveBeenCalled();
    expect(context.loggingFactory).toEqual({});
  });
  describe('jestCommandSettings', () => {
    beforeEach(() => {
      (ProjectWorkspace as jest.Mocked<any>).mockImplementation(mockProjectWorkspace);
      (pathToJest as jest.Mocked<any>).mockReturnValue('path-to-jest');
      (pathToConfig as jest.Mocked<any>).mockReturnValue('path-to-config');
    });
    it('without jestCommandLine, returns pathToJest and pathToConfig', () => {
      const settings: any = {
        ...baseSettings,
        pathToJest: 'abc',
        pathToConfig: 'whatever',
        rootPath: '',
      };
      const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings);
      const runnerWorkspace = createRunnerWorkspace();
      expect(runnerWorkspace.jestCommandLine).toEqual('path-to-jest');
      expect(runnerWorkspace.pathToConfig).toEqual('path-to-config');
    });
    it('with jestCommandLine, ignore both pathToJest and pathToConfig', () => {
      const settings: any = {
        ...baseSettings,
        jestCommandLine: 'jest --coverage',
        pathToJest: 'abc',
        pathToConfig: 'whatever',
      };
      const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings);
      const runnerWorkspace = createRunnerWorkspace();
      expect(runnerWorkspace.jestCommandLine).toEqual(settings.jestCommandLine);
      expect(runnerWorkspace.pathToConfig).toEqual('');
    });
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
  beforeEach(() => {
    userSettings = {};
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
        get: jest
          .fn()
          .mockImplementation((key) => userSettings[key] ?? defaults[`${section}.${key}`]),
      };
    });
  });
  it('should return the extension resource configuration', async () => {
    const mockShell = jest.fn();
    (RunShell as jest.Mocked<any>).mockImplementation(() => mockShell);
    const uri: any = { fsPath: 'workspaceFolder1' };
    expect(getExtensionResourceSettings(uri)).toEqual({
      autoEnable: true,
      coverageFormatter: 'DefaultFormatter',
      pathToConfig: '',
      pathToJest: null,
      jestCommandLine: undefined,
      restartJestOnSnapshotUpdate: false,
      rootPath: 'workspaceFolder1',
      runAllTestsFirst: undefined,
      showCoverageOnLoad: false,
      debugMode: false,
      coverageColors: null,
      autoRun: expect.objectContaining({ config: { watch: true } }),
      testExplorer: {},
      monitorLongRun: 60000,
      shell: mockShell,
    });
  });

  describe('can read user settings', () => {
    let mockShell;
    beforeEach(() => {
      mockShell = jest.fn();
      (RunShell as jest.Mocked<any>).mockImplementation(() => mockShell);
    });
    it('with nodeEnv and shell path', () => {
      userSettings = {
        nodeEnv: { whatever: '1' },
        shell: mockShell,
      };
      const uri: any = { fsPath: 'workspaceFolder1' };
      const settings = getExtensionResourceSettings(uri);
      expect(settings).toEqual(
        expect.objectContaining({
          ...userSettings,
        })
      );
    });
    describe('testExplorer', () => {
      it.each`
        testExplorer                                                         | showWarning | converted
        ${{ enabled: true }}                                                 | ${false}    | ${{}}
        ${{ enabled: false }}                                                | ${true}     | ${{}}
        ${{ enabled: true, showClassicStatus: true }}                        | ${true}     | ${{}}
        ${{ enabled: true, showClassicStatus: true, showInlineError: true }} | ${true}     | ${{}}
        ${{ showInlineError: true }}                                         | ${false}    | ${{ showInlineError: true }}
        ${{}}                                                                | ${false}    | ${{}}
        ${null}                                                              | ${false}    | ${{}}
      `(
        'testExplorer: $testExplorer => show legacy warning? $showWarning',
        ({ testExplorer, showWarning, converted }) => {
          userSettings = { testExplorer };
          const uri: any = { fsPath: 'workspaceFolder1' };
          const settings = getExtensionResourceSettings(uri);
          expect(settings).toEqual(
            expect.objectContaining({
              testExplorer: converted,
            })
          );
          if (showWarning) {
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
          }
        }
      );
    });
  });
});
describe('prefixWorkspace', () => {
  const context: any = { workspace: { name: 'ws' } };
  it('whill not prefix if not multi-root', () => {
    (vscode.workspace as any).workspaceFolders = [{}];
    expect(prefixWorkspace(context, 'a message')).toEqual('a message');
  });
  it('prefix workspace name for multi-root workspace message', () => {
    (vscode.workspace as any).workspaceFolders = [{}, {}];
    expect(prefixWorkspace(context, 'a message')).toEqual('(ws) a message');
  });
});
