jest.unmock('../../../src/setup-wizard/tasks/setup-jest-cmdline');
jest.unmock('../test-helper');
jest.unmock('./task-test-helper');

import * as vscode from 'vscode';

import * as helper from '../../../src/setup-wizard/wizard-helper';
import {
  CLSetupActionId,
  setupJestCmdLine,
} from '../../../src/setup-wizard/tasks/setup-jest-cmdline';

import { mockWizardHelper } from '../test-helper';
import { createWizardContext } from './task-test-helper';

const mockHelper = helper as jest.Mocked<any>;
const { mockHelperSetup, mockSelectWorkspace, mockShowActionMenu } = mockWizardHelper(mockHelper);

describe('wizard-tasks', () => {
  const mockSaveConfig = jest.fn();
  const debugConfigProvider = {};
  let wizardSettings: { [key: string]: any };

  beforeEach(() => {
    jest.resetAllMocks();

    vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
      update: mockSaveConfig,
    });

    wizardSettings = {};
    mockHelperSetup();

    // default helper function
    mockHelper.showActionMenu.mockReturnValue('success');
    mockHelper.showActionInputBox.mockImplementation(({ value }) => value);
    mockHelper.toActionButton.mockImplementation(
      jest.requireActual('../../../src/setup-wizard/wizard-helper').toActionButton
    );
    mockSaveConfig.mockImplementation(() => Promise.resolve());

    mockHelper.showActionMessage.mockImplementation((_, options) => {
      return options?.action?.();
    });
    mockHelper.getWizardSettings.mockImplementation(() => wizardSettings);
    mockHelper.createSaveConfig.mockReturnValue(mockSaveConfig);
    mockHelper.validateRootPath.mockReturnValue(true);
  });

  describe('setupJestCmdLine', () => {
    let context;
    beforeEach(() => {
      context = createWizardContext(debugConfigProvider);
      mockSelectWorkspace('whatever');
      mockHelper.validateCommandLine.mockReturnValue(undefined);
      mockHelper.validateRootPath.mockReturnValue(true);
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
        mockHelper.showActionMenu.mockReturnValue(Promise.resolve('exit'));

        await setupJestCmdLine(c);

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
    describe('showMenu', () => {
      it('show existing jestCommandLine and rootPath', async () => {
        expect.hasAssertions();

        mockSelectWorkspace('ws-1');

        wizardSettings = { rootPath: 'app', jestCommandLine: 'a test script ' };

        mockHelper.showActionMenu.mockReturnValue(Promise.resolve('exit'));

        await setupJestCmdLine(context);

        expect(mockHelper.showActionMenu).toHaveBeenCalled();
        const menuItems = mockHelper.showActionMenu.mock.calls[0][0];
        expect(menuItems).toHaveLength(4);
        const labels = menuItems.map((mi) => mi.label);
        expect(labels).toContain(wizardSettings.rootPath);
        expect(labels).toContain(wizardSettings.jestCommandLine);
      });
      it('will validate jestCommandLine and rootPath', async () => {
        expect.hasAssertions();

        mockSelectWorkspace('ws-1');
        mockHelper.validateCommandLine.mockReturnValue('forced error');
        mockHelper.validateRootPath.mockReturnValue(false);

        wizardSettings = { rootPath: 'app', jestCommandLine: 'a test script ' };

        mockHelper.showActionMenu.mockReturnValue(Promise.resolve('exit'));

        await setupJestCmdLine(context);

        expect(mockHelper.showActionMenu).toHaveBeenCalled();
        const menuItems = mockHelper.showActionMenu.mock.calls[0][0];
        expect(menuItems).toHaveLength(4);
        const labels = menuItems.map((mi) => mi.label);
        expect(labels).not.toContain(wizardSettings.rootPath);
        expect(labels).not.toContain(wizardSettings.jestCommandLine);
      });
      describe('can edit, validate and save settings', () => {
        it.each`
          case | setting              | taskId
          ${1} | ${'jestCommandLine'} | ${CLSetupActionId.editJestCommandLine}
          ${2} | ${'rootPath'}        | ${CLSetupActionId.editRootPath}
        `('case $case', async ({ setting, taskId }) => {
          expect.hasAssertions();

          mockSelectWorkspace('ws-1');

          // simulate user editing setting
          mockShowActionMenu(taskId, CLSetupActionId.saveSettings);

          // simulate user typing new value
          const newValue = 'new setting';
          mockHelper.showActionInputBox = jest.fn().mockReturnValue(Promise.resolve(newValue));

          // simulate exit the menu to end
          await expect(setupJestCmdLine(context)).resolves.toEqual('exit');
          expect(mockHelper.showActionMenu).toHaveBeenCalledTimes(2);
          expect(mockHelper.showActionInputBox).toHaveBeenCalledTimes(1);

          expect(wizardSettings[setting]).toEqual(newValue);

          expect(mockSaveConfig).toHaveBeenCalledTimes(2);
          expect(mockSaveConfig).toHaveBeenCalledWith({
            name: `jest.${setting}`,
            value: newValue,
          });
        });
      });
    });
  });
});
