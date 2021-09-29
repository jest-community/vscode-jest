jest.unmock('../../src/JestExt/helper');
jest.unmock('../test-helper');
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

describe('createJestExtContext', () => {
  const workspaceFolder: any = { name: 'workspace' };
  describe('autoRun', () => {
    it.each`
      pluginSettings                                     | expectedConfig
      ${{ autoEnable: false }}                           | ${'off'}
      ${{ autoEnable: true, runAllTestsFirst: true }}    | ${{ watch: true, onStartup: ['all-tests'] }}
      ${{ autoEnable: true, runAllTestsFirst: false }}   | ${{ watch: true }}
      ${{ autoEnable: true, autoRun: { watch: false } }} | ${{ watch: false }}
    `('can create autoRun from current settings', ({ pluginSettings, expectedConfig }) => {
      const { autoRun } = createJestExtContext(workspaceFolder, pluginSettings);
      expect(autoRun.config).toEqual(expectedConfig);
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
      ${'off'}                                                           | ${{ isOff: true }}
      ${{ watch: true }}                                                 | ${{ isOff: false, isWatch: true }}
      ${{ watch: true, onStartup: ['all-tests'] }}                       | ${{ isOff: false, isWatch: true, onStartup: ['all-tests'] }}
      ${{ watch: false, onStartup: ['all-tests'] }}                      | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'] }}
      ${{ watch: false, onStartup: ['all-tests'], onSave: 'test-file' }} | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'], onSave: 'test-file' }}
      ${{ watch: false, onSave: 'test-src-file' }}                       | ${{ isOff: false, isWatch: false, onSave: 'test-src-file' }}
    `('isOff', ({ autoRunConfig, accessor }) => {
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
          pathToJest: 'abc',
          pathToConfig: 'whatever',
          rootPath: '',
        };
        const { runnerWorkspace } = createJestExtContext(workspaceFolder, settings);
        expect(runnerWorkspace.jestCommandLine).toEqual('path-to-jest');
        expect(runnerWorkspace.pathToConfig).toEqual('path-to-config');
      });
      it('with jestCommandLine, ignore both pathToJest and pathToConfig', () => {
        const settings: any = {
          jestCommandLine: 'jest --coverage',
          pathToJest: 'abc',
          pathToConfig: 'whatever',
        };
        const { runnerWorkspace } = createJestExtContext(workspaceFolder, settings);
        expect(runnerWorkspace.jestCommandLine).toEqual(settings.jestCommandLine);
        expect(runnerWorkspace.pathToConfig).toEqual('');
      });
    });
  });
  it('will create runnerWorkspace', () => {
    const rootPath = 'abc';
    const settings: any = { rootPath };
    const mockRunnerWorkspace = { rootPath };
    (ProjectWorkspace as jest.Mocked<any>).mockReturnValue(mockRunnerWorkspace);
    const context = createJestExtContext(workspaceFolder, settings);
    expect(ProjectWorkspace).toBeCalled();
    expect(toFilePath).toBeCalledWith(rootPath);
    expect(context.runnerWorkspace).toEqual(mockRunnerWorkspace);
  });
  it('will create logging factory', () => {
    const settings: any = {};
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
      runAllTestsFirst: true,
      showCoverageOnLoad: false,
      debugMode: false,
      coverageColors: null,
      autoRun: null,
      testExplorer: { enabled: true },
    });
  });
  it('can read user settings', () => {
    userSettings = {
      testExplorer: { enable: false },
      nodeEnv: { whatever: '1' },
      shell: '/bin/bash',
    };
    const uri: any = { fsPath: 'workspaceFolder1' };
    expect(getExtensionResourceSettings(uri)).toEqual(
      expect.objectContaining({
        ...userSettings,
      })
    );
  });
});
