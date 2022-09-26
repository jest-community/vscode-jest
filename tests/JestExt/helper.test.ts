jest.unmock('../../src/JestExt/helper');
jest.unmock('../test-helper');

const mockPlatform = jest.fn();
jest.mock('os', () => ({ platform: mockPlatform }));

import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import {
  createJestExtContext,
  getExtensionResourceSettings,
  isWatchRequest,
} from '../../src/JestExt/helper';
import { ProjectWorkspace } from 'jest-editor-support';
import { workspaceLogging } from '../../src/logging';
import { pathToJest, pathToConfig } from '../../src/helpers';
import { mockProjectWorkspace } from '../test-helper';
import { toFilePath } from '../../src/helpers';
import { RunnerWorkspaceOptions } from '../../src/JestExt/types';

jest.mock('jest-editor-support', () => ({ isLoginShell: jest.fn(), ProjectWorkspace: jest.fn() }));

describe('createJestExtContext', () => {
  beforeAll(() => {
    console.error = jest.fn();
  });
  const baseSettings = { autoRun: { watch: true } };
  const workspaceFolder: any = { name: 'workspace' };
  describe('autoRun', () => {
    it('will use autoRun from pluginSettings', () => {
      const settings: any = { autoRun: { watch: false } };
      const { autoRun } = createJestExtContext(workspaceFolder, settings);
      expect(autoRun.config).toEqual(settings.autoRun);
    });
    it.each`
      autoRunConfig                                | mode
      ${'off'}                                     | ${'auto-run-off'}
      ${{ watch: true }}                           | ${'auto-run-watch'}
      ${{ watch: false }}                          | ${'auto-run-off'}
      ${{ watch: false, onSave: undefined }}       | ${'auto-run-off'}
      ${{ watch: false, onSave: 'test-file' }}     | ${'auto-run-on-save-test'}
      ${{ watch: false, onSave: 'test-src-file' }} | ${'auto-run-on-save'}
    `('$autoRunConfig => $mode', ({ autoRunConfig, mode }) => {
      const settings: any = { autoRun: autoRunConfig };
      const { autoRun } = createJestExtContext(workspaceFolder, settings);
      expect(autoRun.mode).toEqual(mode);
    });
    it.each`
      autoRunConfig                                                      | accessor
      ${{ watch: false }}                                                | ${{ isOff: true }}
      ${{ watch: true }}                                                 | ${{ isOff: false, isWatch: true }}
      ${{ watch: true, onStartup: ['all-tests'] }}                       | ${{ isOff: false, isWatch: true, onStartup: ['all-tests'] }}
      ${{ watch: false, onStartup: ['all-tests'] }}                      | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'] }}
      ${{ watch: false, onStartup: ['all-tests'], onSave: 'test-file' }} | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'], onSave: 'test-file' }}
      ${{ watch: false, onSave: 'test-src-file' }}                       | ${{ isOff: false, isWatch: false, onSave: 'test-src-file' }}
    `('check accessor for config: $autoRunConfig', ({ autoRunConfig, accessor }) => {
      const settings: any = { autoRun: autoRunConfig };
      const { autoRun } = createJestExtContext(workspaceFolder, settings);
      expect(autoRun.isOff).toEqual(accessor.isOff);
      expect(autoRun.isWatch).toEqual(accessor.isWatch ?? false);
      expect(autoRun.onStartup).toEqual(accessor.onStartup);
      expect(autoRun.onSave).toEqual(accessor.onSave);
      expect(autoRun.config).toEqual(autoRunConfig);
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
  describe('runnerWorkspace', () => {
    it('will return runnerWorkspace factory method', () => {
      const rootPath = 'abc';
      const settings: any = { ...baseSettings, rootPath };

      jest.clearAllMocks();
      const mockRunnerWorkspace = { rootPath };
      (ProjectWorkspace as jest.Mocked<any>).mockReturnValue(mockRunnerWorkspace);

      const context = createJestExtContext(workspaceFolder, settings);
      expect(typeof context.createRunnerWorkspace).toEqual('function');
      expect(ProjectWorkspace).not.toBeCalled();

      const runnerWorkspace = context.createRunnerWorkspace();
      expect(ProjectWorkspace).toBeCalled();
      expect(toFilePath).toBeCalledWith(rootPath);
      expect(runnerWorkspace).toEqual(mockRunnerWorkspace);
    });
    it('allow creating runnerWorkspace with custom options', () => {
      const settings: any = { ...baseSettings, showCoverageOnLoad: false };

      jest.clearAllMocks();

      const { createRunnerWorkspace } = createJestExtContext(workspaceFolder, settings);

      let options: RunnerWorkspaceOptions = { outputFileSuffix: 'extra' };
      createRunnerWorkspace(options);
      let args = (ProjectWorkspace as jest.Mocked<any>).mock.calls[0];
      const [outputFileSuffix, collectCoverage] = [args[4], args[5]];
      expect(outputFileSuffix.endsWith('extra')).toBeTruthy();
      expect(collectCoverage).toEqual(false);

      options = { collectCoverage: true };
      createRunnerWorkspace(options);
      args = (ProjectWorkspace as jest.Mocked<any>).mock.calls[1];
      const collectCoverage2 = args[5];
      expect(collectCoverage2).toEqual(true);
    });
  });
  it('will create logging factory', () => {
    const settings: any = { ...baseSettings };
    (workspaceLogging as jest.Mocked<any>).mockReturnValue({});
    const context = createJestExtContext(workspaceFolder, settings);
    expect(workspaceLogging).toBeCalled();
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
    const uri: any = { fsPath: 'workspaceFolder1' };
    expect(getExtensionResourceSettings(uri)).toEqual({
      autoEnable: true,
      coverageFormatter: 'DefaultFormatter',
      enableSnapshotUpdateMessages: true,
      pathToConfig: '',
      pathToJest: null,
      jestCommandLine: undefined,
      restartJestOnSnapshotUpdate: false,
      rootPath: 'workspaceFolder1',
      runAllTestsFirst: undefined,
      showCoverageOnLoad: false,
      debugMode: false,
      coverageColors: null,
      autoRun: { watch: true },
      testExplorer: {},
      monitorLongRun: 60000,
    });
  });

  describe('can read user settings', () => {
    it('with nodeEnv and shell path', () => {
      userSettings = {
        nodeEnv: { whatever: '1' },
        shell: '/bin/bash',
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
            expect(vscode.window.showWarningMessage).toBeCalled();
          }
        }
      );
    });
    it.each`
      pluginSettings                                             | expectedConfig
      ${{ autoEnable: false }}                                   | ${{ watch: false }}
      ${{ autoEnable: true, runAllTestsFirst: true }}            | ${{ watch: true, onStartup: ['all-tests'] }}
      ${{ autoEnable: true, runAllTestsFirst: false }}           | ${{ watch: true }}
      ${{ autoEnable: true, autoRun: { watch: false } }}         | ${{ watch: false }}
      ${{ autoRun: 'default' }}                                  | ${{ watch: true }}
      ${{ autoRun: 'off' }}                                      | ${{ watch: false }}
      ${{ autoRun: 'watch' }}                                    | ${{ watch: true }}
      ${{ autoRun: 'legacy' }}                                   | ${{ watch: true, onStartup: ['all-tests'] }}
      ${{ autoRun: 'on-save' }}                                  | ${{ watch: false, onSave: 'test-src-file' }}
      ${{ autoRun: 'bad-string' }}                               | ${{ watch: true }}
      ${{ autoRun: { watch: false, onStartup: ['all-tests'] } }} | ${{ watch: false, onStartup: ['all-tests'] }}
    `(
      'autoRun from user settings: $pluginSettings => $expectedConfig',
      ({ pluginSettings, expectedConfig }) => {
        const uri: any = { fsPath: 'workspaceFolder1' };
        userSettings = { ...pluginSettings };
        expect(getExtensionResourceSettings(uri)).toEqual(
          expect.objectContaining({ autoRun: expectedConfig })
        );
      }
    );
    it.each`
      platform    | args      | supported
      ${'win32'}  | ${[]}     | ${false}
      ${'linux'}  | ${['-l']} | ${true}
      ${'darwin'} | ${['-l']} | ${true}
      ${'darwin'} | ${[]}     | ${false}
    `(
      'supports loginShell with $args in $platform => $supported',
      ({ platform, supported, args }) => {
        mockPlatform.mockReturnValue(platform);

        userSettings = {
          shell: { path: '/bin/zsh', args },
        };
        const uri: any = { fsPath: 'workspaceFolder1' };

        if (supported) {
          expect(getExtensionResourceSettings(uri)).toEqual(
            expect.objectContaining({
              ...userSettings,
            })
          );
        } else {
          expect(getExtensionResourceSettings(uri)).not.toEqual(
            expect.objectContaining({
              ...userSettings,
            })
          );
        }
      }
    );
  });
});
