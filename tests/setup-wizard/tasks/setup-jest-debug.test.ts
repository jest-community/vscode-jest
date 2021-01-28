jest.unmock('../../../src/setup-wizard/tasks/setup-jest-debug');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

const mockIsAbsolutePath = jest.fn();
jest.mock('path', () => ({
  normalize: (p: string) => p,
  join: (...args: string[]) => args.join('/'),
  isAbsolute: mockIsAbsolutePath,
}));

import * as helper from '../../../src/setup-wizard/wizard-helper';
import * as SetupJestDebug from '../../../src/setup-wizard/tasks/setup-jest-debug';
import { setupJestCmdLine } from '../../../src/setup-wizard/tasks/setup-jest-cmdline';

import { mockWizardHelper } from '../test-helper';
import { validateTaskConfigUpdate, createWizardContext } from './task-test-helper';

const { setupJestDebug, DebugSetupActionId, DEBUG_CONFIG_NAME } = SetupJestDebug;

const DefaultJestDebugConfig = {
  type: 'node',
  name: 'vscode-jest-tests',
  request: 'launch',
  args: ['--runInBand'],
  cwd: '${workspaceFolder}',
  console: 'integratedTerminal',
  internalConsoleOptions: 'neverOpen',
  disableOptimisticBPs: true,
  program: '${workspaceFolder}/node_modules/.bin/jest',
  windows: {
    program: '${workspaceFolder}/node_modules/jest/bin/jest',
  },
};

const mockHelper = helper as jest.Mocked<any>;
const { mockShowActionMenu, mockShowActionMessage, mockHelperSetup } = mockWizardHelper(mockHelper);

describe('wizard-tasks', () => {
  const mockProvideDebugConfigurations = jest.fn();
  const mockSaveConfig = jest.fn();
  const mockShowTextDocument = jest.fn();
  const mockOpenTextDocument = jest.fn();
  const debugConfigProvider = {
    provideDebugConfigurations: mockProvideDebugConfigurations,
  };
  let mockTextDocument;
  let wizardSettings: { [key: string]: any };

  beforeEach(() => {
    jest.resetAllMocks();

    mockTextDocument = {
      getText: jest.fn().mockReturnValue(''),
      positionAt: jest.fn().mockReturnValue({ line: 0, character: 0 }),
    };

    vscode.window.showTextDocument = mockShowTextDocument;
    vscode.workspace.openTextDocument = mockOpenTextDocument;
    vscode.Uri.joinPath = jest.fn();

    vscode.window.createOutputChannel = jest.fn().mockReturnValue({
      show: jest.fn(),
      clear: jest.fn(),
      appendLine: jest.fn(),
    });
    vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
      // get: mockConfigGet,
      update: mockSaveConfig,
    });

    wizardSettings = {};
    mockHelperSetup();

    // default helper function
    mockHelper.showActionMenu.mockReturnValue('success');
    mockHelper.showInputBox.mockImplementation(({ value }) => value);
    mockSaveConfig.mockImplementation(() => Promise.resolve());

    mockHelper.mergeDebugConfigWithCmdLine.mockImplementation((config) => config);
    mockHelper.showActionMessage.mockImplementation((_, options) => {
      return options?.action?.();
    });
    // mockHelper.getWizardSettings = jest.fn().mockReturnValue(wizardSettings);
    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);

    mockProvideDebugConfigurations.mockReturnValue([DefaultJestDebugConfig]);
    mockOpenTextDocument.mockReturnValue(mockTextDocument);
  });

  describe('setupJestDebug', () => {
    const validateConfigUpdate = (callBack?: (value?: vscode.DebugConfiguration) => void) => {
      const _callBack = callBack
        ? (value?: vscode.DebugConfiguration) => {
            if (Array.isArray(value)) {
              const jestDebugConfig = value.find((c) => c.name === DEBUG_CONFIG_NAME);
              callBack(jestDebugConfig);
            } else {
              callBack();
            }
          }
        : undefined;
      validateTaskConfigUpdate(mockSaveConfig, 'launch.configurations', _callBack);
    };

    let context;
    const isMergedWithCommandLine = (commandLine?: string, absoluteRootPath?: string): boolean => {
      expect(mockHelper.mergeDebugConfigWithCmdLine).toHaveBeenCalledTimes(1);
      const [config, cmdLine, rootPath] = mockHelper.mergeDebugConfigWithCmdLine.mock.calls[0];
      expect(cmdLine).toEqual(commandLine);
      expect(rootPath).toEqual(absoluteRootPath);
      expect(config.name).toEqual(DEBUG_CONFIG_NAME);
      return true;
    };
    const hasShownLaunchFile = (filePath: string): boolean => {
      expect(mockOpenTextDocument).toBeCalledTimes(1);
      const [aPath] = mockOpenTextDocument.mock.calls[0];
      expect(aPath).toEqual(filePath);

      expect(mockShowTextDocument).toBeCalledTimes(1);
      const [doc, { selection }] = mockShowTextDocument.mock.calls[0];
      expect(doc).toBe(mockTextDocument);
      expect(selection).not.toBeUndefined();
      return true;
    };

    beforeEach(() => {
      context = createWizardContext('single-root', debugConfigProvider);

      mockShowActionMessage('info', DebugSetupActionId.info);

      mockTextDocument.getText.mockReturnValue(`
        line 1...
        line 2...
        ${DEBUG_CONFIG_NAME}
        "${DEBUG_CONFIG_NAME}"
        line 5...
      `);
      vscode.Uri.joinPath = jest
        .fn()
        .mockImplementation((_uri: any, ...paths: string[]) => `/_uri_/${paths.join('/')}`);
    });
    describe(`will prompt user to setup jestCommandLine if missing`, () => {
      let mockCmdLineTask;
      let mockDeubgConfigTask;
      beforeEach(() => {
        mockCmdLineTask = setupJestCmdLine;
        mockDeubgConfigTask = jest.spyOn(SetupJestDebug, 'setupJestDebug');
      });

      it('if user choose cancel, task will abort', async () => {
        expect.hasAssertions();
        mockHelper.showActionMessage.mockReturnValueOnce(undefined);
        await expect(setupJestDebug(context)).resolves.toEqual('abort');
        expect(mockHelper.showActionMessage).toBeCalledTimes(1);
      });
      it.each`
        cmdLineResult | debugConfigResult | finalResult
        ${undefined}  | ${null}           | ${'abort'}
        ${'abort'}    | ${null}           | ${'abort'}
        ${'error'}    | ${null}           | ${'abort'}
        ${'success'}  | ${'success'}      | ${'success'}
        ${'success'}  | ${'abort'}        | ${'abort'}
        ${'success'}  | ${'error'}        | ${'error'}
        ${'success'}  | ${undefined}      | ${undefined}
      `(
        'if user choose setup: setupCmdLine=$cmdLineResult, setupDebugTask=$debugConfigResult => $finalResult',
        async ({ cmdLineResult, debugConfigResult, finalResult }) => {
          expect.hasAssertions();

          mockCmdLineTask.mockImplementation(() => Promise.resolve(cmdLineResult));
          mockDeubgConfigTask.mockImplementation(() => Promise.resolve(debugConfigResult));

          // user select setup
          mockShowActionMessage('error', DebugSetupActionId.setupJestCmdLine);

          await expect(setupJestDebug(context)).resolves.toEqual(finalResult);
          expect(mockHelper.showActionMessage).toBeCalledTimes(1);
          expect(mockCmdLineTask).toBeCalledTimes(1);
          expect(mockDeubgConfigTask).toBeCalledTimes(debugConfigResult === null ? 0 : 1);
        }
      );
    });
    describe('when no existing jest debug config', () => {
      it.each`
        desc                              | settings
        ${'jestCommandLine'}              | ${{ jestCommandLine: 'jest' }}
        ${'jestCommandLine and rootPath'} | ${{ jestCommandLine: 'jest', absoluteRootPath: '/a/b' }}
      `('can merge $desc', async ({ settings }) => {
        expect.hasAssertions();

        wizardSettings = settings;
        mockShowActionMenu(DebugSetupActionId.create);

        await expect(setupJestDebug(context)).resolves.toEqual('success');

        // debug config has been merged with commandLine
        expect(
          isMergedWithCommandLine(wizardSettings.jestCommandLine, wizardSettings.absoluteRootPath)
        ).toBeTruthy();
        // a default config will be generated and saved
        validateConfigUpdate((jestDebugConfig) =>
          expect(jestDebugConfig).toEqual(DefaultJestDebugConfig)
        );
        // launch.json has been shown in editor with target selected
        expect(hasShownLaunchFile('/_uri_/.vscode/launch.json')).toBeTruthy();
      });
    });
    describe('when there is existing jest debug config and jestCommandLine', () => {
      const existingConfig: any = { name: DEBUG_CONFIG_NAME };
      beforeEach(() => {
        wizardSettings = { jestCommandLine: 'whatever', configurations: [existingConfig] };
      });
      it.each`
        desc                      | menuId                               | isConfigUpdated | expected
        ${'menu: acceptExisting'} | ${DebugSetupActionId.acceptExisting} | ${false}        | ${existingConfig}
        ${'menu: replace'}        | ${DebugSetupActionId.replace}        | ${true}         | ${DefaultJestDebugConfig}
        ${'menu: edit'}           | ${DebugSetupActionId.edit}           | ${false}        | ${undefined}
      `('$desc', async ({ menuId, isConfigUpdated, expected }) => {
        expect.hasAssertions();
        mockShowActionMenu(menuId);

        await expect(setupJestDebug(context)).resolves.toEqual('success');

        if (isConfigUpdated) {
          expect(isMergedWithCommandLine(wizardSettings.jestCommandLine)).toBeTruthy();

          validateConfigUpdate((debugConfig) => expect(debugConfig).toEqual(expected));
          expect(hasShownLaunchFile('/_uri_/.vscode/launch.json')).toBeTruthy();
        } else {
          // the rest of methods are not invoked
          expect(mockHelper.mergeDebugConfigWithCmdLine).not.toBeCalled();
          validateConfigUpdate();
          if (menuId === DebugSetupActionId.edit) {
            expect(mockShowTextDocument).toBeCalled();
          } else {
            expect(mockShowTextDocument).not.toBeCalled();
          }
        }
      });
    });
    it(`can abort task`, async () => {
      expect.hasAssertions();
      mockHelper.showActionMenu.mockReturnValue(undefined);
      wizardSettings = { jestCommandLine: 'something' };
      await expect(setupJestDebug(context)).resolves.toBeUndefined();
    });
  });
});
