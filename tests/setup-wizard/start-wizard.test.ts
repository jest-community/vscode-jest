jest.unmock('../../src/setup-wizard/start-wizard');
jest.unmock('./test-helper');
import * as vscode from 'vscode';

import {
  PendingSetupTaskKey,
  startWizard,
  StartWizardActionId,
  WizardTasks,
} from '../../src/setup-wizard/start-wizard';
import { showActionMenu } from '../../src/setup-wizard/wizard-helper';
import * as tasks from '../../src/setup-wizard/tasks';
import { mockWizardHelper, throwError, workspaceFolder } from './test-helper';
import * as helper from '../../src/setup-wizard/wizard-helper';

const mockTasks = tasks as jest.Mocked<any>;
const mockHelper = helper as jest.Mocked<any>;
const { mockShowActionMenu, mockHelperSetup } = mockWizardHelper(mockHelper);

describe('startWizard', () => {
  const mockDebugConfigProvider: any = {};
  const vscodeContext: any = {
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
  };
  beforeEach(() => {
    jest.resetAllMocks();

    console.log = jest.fn();
    mockHelperSetup();
    vscode.window.createOutputChannel = jest.fn().mockReturnValue({
      show: jest.fn(),
      clear: jest.fn(),
      appendLine: jest.fn(),
    });

    mockTasks.setupJestCmdLine = jest.fn(() => Promise.resolve('success'));
    mockTasks.setupJestDebug = jest.fn(() => Promise.resolve('success'));
  });
  it('upon start up, will clear any pending task', async () => {
    expect.hasAssertions();
    mockHelper.showActionMenu.mockImplementation(() => {
      return 'exit';
    });
    await startWizard(mockDebugConfigProvider, vscodeContext);
    expect(vscodeContext.globalState.update).toBeCalledWith(PendingSetupTaskKey, undefined);
  });
  describe.each`
    taskId           | menuId
    ${'cmdLine'}     | ${StartWizardActionId.cmdLine}
    ${'debugConfig'} | ${StartWizardActionId.debugConfig}
    ${'monorepo'}    | ${StartWizardActionId.monorepo}
  `('setup task: $taskId', ({ taskId, menuId }) => {
    it.each`
      case | taskResult                          | menuCallCount | wizardResult
      ${1} | ${'success'}                        | ${2}          | ${'success'}
      ${2} | ${'abort'}                          | ${2}          | ${'success'}
      ${3} | ${'error'}                          | ${1}          | ${'error'}
      ${4} | ${() => throwError('forced error')} | ${1}          | ${'error'}
    `(
      `case $case: from menu ${menuId}: $taskResult => $wizardResult`,
      async ({ taskResult, menuCallCount, wizardResult }) => {
        expect.hasAssertions();
        console.error = jest.fn();
        (vscode.workspace as any).workspaceFolders = [workspaceFolder('single-root')];
        mockShowActionMenu(menuId, StartWizardActionId.exit);
        const task = WizardTasks[taskId].task;
        task.mockImplementation(() => {
          if (typeof taskResult === 'function') {
            return taskResult();
          }
          return Promise.resolve(taskResult);
        });

        await expect(startWizard(mockDebugConfigProvider, vscodeContext)).resolves.toEqual(
          wizardResult
        );
        expect(task).toBeCalledTimes(1);
        expect(showActionMenu).toBeCalledTimes(menuCallCount);
      }
    );
    it.each`
      taskResult                          | wizardResult
      ${'success'}                        | ${'success'}
      ${'abort'}                          | ${'success'}
      ${'error'}                          | ${'error'}
      ${() => throwError('forced error')} | ${'error'}
    `('invoke directly: $taskResult => $wizardResult', async ({ taskResult, wizardResult }) => {
      expect.hasAssertions();
      console.error = jest.fn();
      const workspace = workspaceFolder('w-1');
      const task = WizardTasks[taskId].task;
      task.mockImplementation(() => {
        if (typeof taskResult === 'function') {
          return taskResult();
        }
        return Promise.resolve(taskResult);
      });

      // exit the wizard via menu
      mockShowActionMenu(menuId, StartWizardActionId.exit);
      await expect(
        startWizard(mockDebugConfigProvider, vscodeContext, { workspace, taskId })
      ).resolves.toEqual(wizardResult);

      expect(task).toBeCalledTimes(1);
    });
  });
  it('can handle unexpected exception', async () => {
    expect.hasAssertions();
    mockHelper.showActionMenu.mockImplementation(() => {
      throw 'whatever';
    });
    await expect(startWizard(mockDebugConfigProvider, vscodeContext)).resolves.toEqual('error');
  });
  it('has a verbose mode', async () => {
    expect.hasAssertions();
    (vscode.workspace as any).workspaceFolders = [workspaceFolder('single-root')];
    const mockLog = jest.fn();
    console.log = mockLog;

    // exit the wizard via menu
    mockShowActionMenu(StartWizardActionId.exit);
    await expect(
      startWizard(mockDebugConfigProvider, vscodeContext, { verbose: true })
    ).resolves.toEqual('success');
    expect(console.log).toHaveBeenCalled();

    mockLog.mockClear();
    mockShowActionMenu(StartWizardActionId.exit);
    await expect(
      startWizard(mockDebugConfigProvider, vscodeContext, { verbose: false })
    ).resolves.toEqual('success');
    expect(console.log).not.toHaveBeenCalled();
  });
});
