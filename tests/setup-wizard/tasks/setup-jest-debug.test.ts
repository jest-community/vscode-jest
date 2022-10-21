jest.unmock('../../../src/setup-wizard/tasks/setup-jest-debug');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

import * as helper from '../../../src/setup-wizard/wizard-helper';
import * as SetupJestDebug from '../../../src/setup-wizard/tasks/setup-jest-debug';
import { setupJestCmdLine } from '../../../src/setup-wizard/tasks/setup-jest-cmdline';

import { mockWizardHelper } from '../test-helper';
import { validateTaskConfigUpdate, createWizardContext } from './task-test-helper';

const { setupJestDebug, DebugSetupActionId, DEBUG_CONFIG_NAME } = SetupJestDebug;

const defaultJestDebugConfig = {
  type: 'node',
  name: 'vscode-jest-tests.v2',
  request: 'launch',
  args: [
    '--run-in-band',
    '--watch-all=false',
    '--test-name-pattern',
    '${jest.testNamePattern}',
    '--run-tests-by-path',
    '${jest.testFile}',
  ],
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
const { mockShowActionMenu, mockShowActionMessage, mockHelperSetup, mockSelectWorkspace } =
  mockWizardHelper(mockHelper);

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
    mockHelper.showActionInputBox.mockImplementation(({ value }) => value);
    mockSaveConfig.mockImplementation(() => Promise.resolve());

    mockHelper.mergeDebugConfigWithCmdLine.mockImplementation((config) => config);
    mockHelper.showActionMessage.mockImplementation((_, options) => {
      return options?.action?.();
    });
    // mockHelper.getWizardSettings = jest.fn().mockReturnValue(wizardSettings);
    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);

    mockProvideDebugConfigurations.mockReturnValue([defaultJestDebugConfig]);
    mockOpenTextDocument.mockReturnValue(mockTextDocument);
  });

  describe('setupJestDebug', () => {
    const validateConfigUpdate = (callBack?: (value?: vscode.DebugConfiguration) => void) => {
      const _callBack = callBack
        ? (value?: vscode.DebugConfiguration) => {
            if (Array.isArray(value)) {
              const jestDebugConfig =
                value.find((c) => c.name === `${DEBUG_CONFIG_NAME}.v2`) ??
                value.find((c) => c.name === DEBUG_CONFIG_NAME);
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
      expect(
        config.name === DEBUG_CONFIG_NAME || config.name === `${DEBUG_CONFIG_NAME}.v2`
      ).toBeTruthy();
      return true;
    };
    const hasShownLaunchFile = (filePath: string): boolean => {
      expect(mockOpenTextDocument).toHaveBeenCalledTimes(1);
      const [aPath] = mockOpenTextDocument.mock.calls[0];
      expect(aPath).toEqual(filePath);

      expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
      const [doc, { selection }] = mockShowTextDocument.mock.calls[0];
      expect(doc).toBe(mockTextDocument);
      expect(selection).not.toBeUndefined();
      return true;
    };

    beforeEach(() => {
      context = createWizardContext(debugConfigProvider, 'single-root');

      mockShowActionMessage('info', DebugSetupActionId.info);
      mockSelectWorkspace('whatever');

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
    describe('always works with explicit workspace', () => {
      it.each`
        case | wsInContext  | selectWs     | willAbort
        ${1} | ${undefined} | ${undefined} | ${true}
        ${2} | ${undefined} | ${'ws-2'}    | ${false}
        ${3} | ${'ws-1'}    | ${undefined} | ${false}
        ${4} | ${'ws-1'}    | ${undefined} | ${false}
      `('case $case', async ({ wsInContext, selectWs, willAbort }) => {
        expect.hasAssertions();

        mockHelper.showActionMessage.mockReturnValueOnce(undefined);
        mockSelectWorkspace(selectWs);
        const c = createWizardContext(debugConfigProvider, wsInContext);

        await setupJestDebug(c);

        if (wsInContext) {
          expect(mockHelper.selectWorkspace).not.toHaveBeenCalled();
        } else {
          expect(mockHelper.selectWorkspace).toHaveBeenCalled();
        }
        if (willAbort) {
          expect(mockHelper.showActionMessage).not.toHaveBeenCalled();
        } else {
          expect(mockHelper.showActionMessage).toHaveBeenCalled();
        }
      });
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
        expect(mockHelper.showActionMessage).toHaveBeenCalledTimes(1);
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
          expect(mockHelper.showActionMessage).toHaveBeenCalledTimes(1);
          expect(mockCmdLineTask).toHaveBeenCalledTimes(1);
          expect(mockDeubgConfigTask).toHaveBeenCalledTimes(debugConfigResult === null ? 0 : 1);
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
          expect(jestDebugConfig).toEqual(defaultJestDebugConfig)
        );
        // launch.json has been shown in editor with target selected
        expect(hasShownLaunchFile('/_uri_/.vscode/launch.json')).toBeTruthy();
      });
      it('if failed to genetate the default config, error will be thrown', async () => {
        mockProvideDebugConfigurations.mockReturnValue([]);
        expect.hasAssertions();

        wizardSettings = { jestCommandLine: 'jest' };
        mockShowActionMenu(DebugSetupActionId.create);

        await expect(setupJestDebug(context)).rejects.toThrow();
      });
    });
    describe('when there is existing jest debug config and jestCommandLine', () => {
      const existingConfig: any = { name: `${DEBUG_CONFIG_NAME}.v2` };
      const otherConfig: any = { name: 'other-config' };
      beforeEach(() => {
        wizardSettings = {
          jestCommandLine: 'whatever',
          configurations: [existingConfig, otherConfig],
        };
      });
      it.each`
        desc                      | menuId                               | isConfigUpdated | expected
        ${'menu: acceptExisting'} | ${DebugSetupActionId.acceptExisting} | ${false}        | ${existingConfig}
        ${'menu: replace'}        | ${DebugSetupActionId.replace}        | ${true}         | ${defaultJestDebugConfig}
        ${'menu: edit'}           | ${DebugSetupActionId.edit}           | ${false}        | ${undefined}
      `('$desc', async ({ menuId, isConfigUpdated, expected }) => {
        expect.hasAssertions();
        mockShowActionMenu(menuId);

        await expect(setupJestDebug(context)).resolves.toEqual('success');

        if (isConfigUpdated) {
          expect(isMergedWithCommandLine(wizardSettings.jestCommandLine)).toBeTruthy();

          // launch.json file will be shown
          expect(hasShownLaunchFile('/_uri_/.vscode/launch.json')).toBeTruthy();

          // validate config update
          validateConfigUpdate((debugConfig) => expect(debugConfig).toEqual(expected));

          // validate config update entries
          const entries = mockSaveConfig.mock.calls[0];
          expect(entries).toHaveLength(1);
          const { name, value: configs } = entries[0];
          expect(name).toEqual('launch.configurations');
          expect(configs).toHaveLength(wizardSettings.configurations.length + 1);
          expect(configs.find((c) => c.name === 'other-config')).not.toBeUndefined();
          expect(
            configs.find((c) => c.name.startsWith(`${existingConfig.name}-`))
          ).not.toBeUndefined();
          expect(configs.find((c) => c.name === existingConfig.name)).not.toBeUndefined();
        } else {
          // the rest of methods are not invoked
          expect(mockHelper.mergeDebugConfigWithCmdLine).not.toHaveBeenCalled();
          validateConfigUpdate();
          if (menuId === DebugSetupActionId.edit) {
            expect(mockShowTextDocument).toHaveBeenCalled();
          } else {
            expect(mockShowTextDocument).not.toHaveBeenCalled();
          }
        }
      });
      it.each`
        text                                                   | validateIndex
        ${`"${DEBUG_CONFIG_NAME}"; "${DEBUG_CONFIG_NAME}.v2"`} | ${(idx) => idx > 5}
        ${`"${DEBUG_CONFIG_NAME}.v2";`}                        | ${(idx) => idx === 0}
        ${`"${DEBUG_CONFIG_NAME}";`}                           | ${(idx) => idx === 0}
      `('edit can position correct config entry: $text', async ({ text, validateIndex }) => {
        expect.hasAssertions();
        mockShowActionMenu(DebugSetupActionId.edit);

        // if both config exist, the v2 will be focus
        mockTextDocument.getText.mockReturnValueOnce(text);
        await expect(setupJestDebug(context)).resolves.toEqual('success');

        expect(hasShownLaunchFile('/_uri_/.vscode/launch.json')).toBeTruthy();
        expect(mockTextDocument.positionAt).toHaveBeenCalledTimes(1);
        const index = mockTextDocument.positionAt.mock.calls[0][0];
        expect(validateIndex(index)).toBeTruthy();
      });
      it('an v1 config will be considered valid/existing config', async () => {
        const v1Config: any = { name: `${DEBUG_CONFIG_NAME}` };
        wizardSettings = {
          jestCommandLine: 'whatever',
          configurations: [v1Config, otherConfig],
        };
        expect.hasAssertions();
        mockShowActionMenu(DebugSetupActionId.acceptExisting);
        await expect(setupJestDebug(context)).resolves.toEqual('success');
      });
      it(`can abort task`, async () => {
        expect.hasAssertions();
        const v1Config: any = { name: `${DEBUG_CONFIG_NAME}` };
        wizardSettings = {
          jestCommandLine: 'whatever',
          configurations: [v1Config, otherConfig],
        };
        mockHelper.showActionMenu.mockReturnValue(undefined);
        await expect(setupJestDebug(context)).resolves.toBeUndefined();
      });
    });
  });
});
