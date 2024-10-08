jest.unmock('../../../src/setup-wizard/tasks/setup-jest-debug');
jest.unmock('../test-helper');
jest.unmock('../../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

import * as helper from '../../../src/setup-wizard/wizard-helper';
import * as SetupJestDebug from '../../../src/setup-wizard/tasks/setup-jest-debug';
import { setupJestCmdLine } from '../../../src/setup-wizard/tasks/setup-jest-cmdline';

import { mockWizardHelper } from '../test-helper';
import { createWizardContext } from './task-test-helper';
import { getValidJestCommand } from '../../../src/helpers';

const { setupJestDebug, DebugSetupActionId, DEBUG_CONFIG_NAME } = SetupJestDebug;

const mockHelper = helper as jest.Mocked<any>;
const { mockShowActionMenu, mockHelperSetup, mockSelectWorkspace } = mockWizardHelper(mockHelper);

describe('wizard-tasks', () => {
  const mockSaveConfig = jest.fn();
  const mockShowTextDocument = jest.fn();
  const mockOpenTextDocument = jest.fn();
  const debugConfigProvider = {
    createDebugConfig: jest.fn(),
    getDebugConfigNames: jest.fn(),
  };
  let mockTextDocument;
  let wizardSettings: { [key: string]: any };

  beforeEach(() => {
    jest.resetAllMocks();

    mockTextDocument = {
      getText: jest.fn().mockReturnValue(''),
      positionAt: jest.fn().mockReturnValue({ line: 0, character: 0 }),
    };

    mockShowTextDocument.mockResolvedValue(undefined);
    mockOpenTextDocument.mockResolvedValue(mockTextDocument);
    vscode.window.showTextDocument = mockShowTextDocument;
    vscode.workspace.openTextDocument = mockOpenTextDocument;

    vscode.Uri.joinPath = jest.fn();

    wizardSettings = {};
    mockHelperSetup();

    // default helper function
    mockHelper.showActionMenu.mockResolvedValue(undefined);
    mockSaveConfig.mockResolvedValue('whatever');

    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);
  });

  describe('setupJestDebug', () => {
    let context;
    let mockGetValidJestCommand;
    let mockSetupJestDebug;
    beforeEach(() => {
      context = createWizardContext(debugConfigProvider, 'single-root');
      mockGetValidJestCommand = getValidJestCommand as jest.Mocked<any>;
      mockSetupJestDebug = jest.spyOn(SetupJestDebug, 'setupJestDebug');

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

        mockSelectWorkspace(selectWs);
        const c = createWizardContext(debugConfigProvider, wsInContext);
        mockShowActionMenu(undefined);

        await setupJestDebug(c);

        if (wsInContext) {
          expect(mockHelper.selectWorkspaceFolder).not.toHaveBeenCalled();
        } else {
          expect(mockHelper.selectWorkspaceFolder).toHaveBeenCalled();
        }
        if (willAbort) {
          expect(mockHelper.showActionMenu).not.toHaveBeenCalled();
        } else {
          expect(mockHelper.showActionMenu).toHaveBeenCalled();
        }
      });
    });
    describe('requires valid jestCommandLine and rootPath', () => {
      let mockCmdLineTask;
      beforeEach(() => {
        mockCmdLineTask = setupJestCmdLine;
        mockGetValidJestCommand.mockResolvedValue({ validSettings: [] });
      });

      it('after setup the jestCommandLine, will resume debug setup', async () => {
        expect.hasAssertions();
        mockCmdLineTask.mockImplementation(() => {
          wizardSettings.jestCommandLine = 'yarn test';
          return Promise.resolve('success');
        });
        mockShowActionMenu(DebugSetupActionId.generate, undefined);
        await expect(setupJestDebug(context)).resolves.toEqual(undefined);
        expect(mockSetupJestDebug).toHaveBeenCalledTimes(1);
      });

      it('will prompt user to setup the jestCommandLine if missing', async () => {
        expect.hasAssertions();
        mockCmdLineTask.mockResolvedValue('abort');
        mockShowActionMenu(DebugSetupActionId.generate);
        await expect(setupJestDebug(context)).resolves.toEqual('abort');
        expect(mockSetupJestDebug).toHaveBeenCalledTimes(0);
      });
    });
    describe('generate config with setting overrides', () => {
      const configName = `${DEBUG_CONFIG_NAME}.v2`;
      const existingConfig: any = { name: configName };
      const otherConfig: any = { name: 'other-config' };
      const newDebugConfig = { ...existingConfig };
      beforeEach(() => {
        wizardSettings = {
          configurations: [existingConfig, otherConfig],
        };

        mockGetValidJestCommand.mockResolvedValue({
          validSettings: [{ jestCommandLine: 'jest' }],
        });
        context.debugConfigProvider.createDebugConfig.mockReturnValue(newDebugConfig);
        debugConfigProvider.getDebugConfigNames.mockReturnValue({ sorted: ['whatever'] });

        mockShowActionMenu(DebugSetupActionId.generate, undefined);
      });
      describe('with settings', () => {
        it.each`
          case | settings                                                                                                    | exception
          ${1} | ${{}}                                                                                                       | ${{ jestCommandLine: 'jest' }}
          ${2} | ${{ jestCommandLine: 'yarn test' }}                                                                         | ${undefined}
          ${3} | ${{ rootPath: '/a/b/c' }}                                                                                   | ${{ jestCommandLine: 'jest', rootPath: '/a/b/c' }}
          ${4} | ${{ nodeEnv: { NODE_ENV: '--experimental-vm-modules' } }}                                                   | ${{ jestCommandLine: 'jest', nodeEnv: { NODE_ENV: '--experimental-vm-modules' } }}
          ${5} | ${{ jestCommandLine: 'yarn test', rootPath: '/a/b/c', nodeEnv: { NODE_ENV: '--experimental-vm-modules' } }} | ${undefined}
        `('case $case', async ({ settings, exception }) => {
          expect.hasAssertions();
          context.debugConfigProvider.createDebugConfig.mockReturnValue(newDebugConfig);

          wizardSettings = { ...wizardSettings, ...settings };

          if (settings.rootPath) {
            mockGetValidJestCommand.mockResolvedValue({
              validSettings: [{ jestCommandLine: 'jest', rootPath: settings.rootPath }],
            });
          }

          mockShowActionMenu(DebugSetupActionId.generate, undefined);
          await expect(setupJestDebug(context)).resolves.toEqual(undefined);

          expect(context.debugConfigProvider.createDebugConfig).toHaveBeenCalledWith(
            expect.anything(),
            exception ?? settings
          );

          // config should be saved
          expect(mockSaveConfig).toHaveBeenCalledWith({
            name: 'launch.configurations',
            value: expect.arrayContaining([newDebugConfig]),
          });

          // config should be displayed
          expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
        });
      });
      describe('can save debugConfig in launch.json', () => {
        it('will rename existing debugConfig in launch.json', async () => {
          expect.hasAssertions();

          await expect(setupJestDebug(context)).resolves.toEqual(undefined);

          // config should be saved
          expect(mockSaveConfig).toHaveBeenCalledTimes(1);
          const config = mockSaveConfig.mock.calls[0][0];

          expect(config.name).toEqual('launch.configurations');
          expect(config.value).toHaveLength(3);
          expect(config.value).toContain(newDebugConfig);

          // renamed previous config
          expect(
            config.value.find((config) => config.name.startsWith(`${configName}-`))
          ).not.toBeUndefined();
        });
      });
      describe('will show new debugConfig in launch.json', () => {
        it.each`
          case | text                                                   | validateIndex
          ${1} | ${`"${DEBUG_CONFIG_NAME}"; "${DEBUG_CONFIG_NAME}.v2"`} | ${(idx) => idx > 5}
          ${2} | ${`"${DEBUG_CONFIG_NAME}.v2";`}                        | ${(idx) => idx > -1}
          ${3} | ${`"${DEBUG_CONFIG_NAME}";`}                           | ${(idx) => idx > -1}
          ${4} | ${`"${DEBUG_CONFIG_NAME}.v2.single-root";`}            | ${(idx) => idx > -1}
        `('case $case: can position correct config entry', async ({ text, validateIndex }) => {
          expect.hasAssertions();

          debugConfigProvider.getDebugConfigNames.mockReturnValue({
            sorted: [
              `${DEBUG_CONFIG_NAME}.v2.single-root`,
              `${DEBUG_CONFIG_NAME}.v2`,
              `${DEBUG_CONFIG_NAME}.single-root`,
              `${DEBUG_CONFIG_NAME}`,
            ],
          });
          // if both config exist, the v2 will be focus
          mockTextDocument.getText.mockReturnValueOnce(text);
          await setupJestDebug(context);

          const filePath = '/_uri_/.vscode/launch.json';
          expect(mockOpenTextDocument).toHaveBeenCalledTimes(1);
          const [aPath] = mockOpenTextDocument.mock.calls[0];
          expect(aPath).toEqual(filePath);

          expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
          const [doc, { selection }] = mockShowTextDocument.mock.calls[0];
          expect(doc).toBe(mockTextDocument);
          expect(selection).not.toBeUndefined();

          expect(mockTextDocument.positionAt).toHaveBeenCalledTimes(1);
          const index = mockTextDocument.positionAt.mock.calls[0][0];
          expect(validateIndex(index)).toBeTruthy();
        });
      });
    });
  });
});
