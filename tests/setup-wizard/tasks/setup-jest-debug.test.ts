jest.unmock('../../../src/setup-wizard/tasks/setup-jest-debug');
jest.unmock('../test-helper');
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
    withCommandLine: jest.fn(),
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
          expect(mockHelper.selectWorkspace).not.toHaveBeenCalled();
        } else {
          expect(mockHelper.selectWorkspace).toHaveBeenCalled();
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
    describe('generate config with jestCommandLine and rootPath', () => {
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
        context.debugConfigProvider.withCommandLine.mockReturnValue(newDebugConfig);

        mockShowActionMenu(DebugSetupActionId.generate, undefined);
      });
      it('invoke debugConfigProvider to generate', async () => {
        expect.hasAssertions();
        context.debugConfigProvider.withCommandLine.mockReturnValue(newDebugConfig);

        mockShowActionMenu(DebugSetupActionId.generate, undefined);
        await expect(setupJestDebug(context)).resolves.toEqual(undefined);

        expect(context.debugConfigProvider.withCommandLine).toHaveBeenCalledWith(
          expect.anything(),
          'jest',
          undefined
        );

        // config should be saved
        expect(mockSaveConfig).toHaveBeenCalledWith({
          name: 'launch.configurations',
          value: expect.arrayContaining([newDebugConfig]),
        });

        // config should be displayed
        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
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
          ${2} | ${`"${DEBUG_CONFIG_NAME}.v2";`}                        | ${(idx) => idx === 0}
          ${3} | ${`"${DEBUG_CONFIG_NAME}";`}                           | ${(idx) => idx === 0}
        `('case $case: can position correct config entry', async ({ text, validateIndex }) => {
          expect.hasAssertions();

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
