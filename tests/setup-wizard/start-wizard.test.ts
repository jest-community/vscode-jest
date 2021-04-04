jest.unmock('../../src/setup-wizard/start-wizard');
jest.unmock('./test-helper');
import * as vscode from 'vscode';

import { startWizard, StartWizardActionId, WizardTasks } from '../../src/setup-wizard/start-wizard';
import { showActionMenu } from '../../src/setup-wizard/wizard-helper';
import * as tasks from '../../src/setup-wizard/tasks';
import { mockWizardHelper, throwError, workspaceFolder } from './test-helper';
import * as helper from '../../src/setup-wizard/wizard-helper';

const mockTasks = tasks as jest.Mocked<any>;
const { mockShowActionMenu, mockHelperSetup } = mockWizardHelper(helper as jest.Mocked<any>);

describe('startWizard', () => {
  const mockDebugConfigProvider: any = {};
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
  it.each`
    desc                    | workspaceFolders                                      | callCount
    ${'single-workspace'}   | ${[workspaceFolder('single-root')]}                   | ${0}
    ${'multiple-workspace'} | ${[workspaceFolder('ws-1'), workspaceFolder('ws-2')]} | ${1}
  `('select workspace: $desc', async ({ workspaceFolders, callCount }) => {
    expect.hasAssertions();
    mockShowActionMenu(StartWizardActionId.exit);
    (vscode.workspace as any).workspaceFolders = workspaceFolders;
    await startWizard(mockDebugConfigProvider);
    expect(vscode.window.showWorkspaceFolderPick).toBeCalledTimes(callCount);
  });
  describe.each`
    taskId           | menuId
    ${'cmdLine'}     | ${StartWizardActionId.cmdLine}
    ${'debugConfig'} | ${StartWizardActionId.debugConfig}
  `('setup task: $taskId', ({ taskId, menuId }) => {
    it.each`
      taskResult                          | menuCallCount | wizardResult
      ${'success'}                        | ${2}          | ${'success'}
      ${'abort'}                          | ${2}          | ${'success'}
      ${'error'}                          | ${1}          | ${'error'}
      ${() => throwError('forced error')} | ${1}          | ${'error'}
    `(
      `from menu ${menuId}: $taskResult => $wizardResult`,
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

        await expect(startWizard(mockDebugConfigProvider)).resolves.toEqual(wizardResult);
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
      await expect(startWizard(mockDebugConfigProvider, { workspace, taskId })).resolves.toEqual(
        wizardResult
      );

      expect(task).toBeCalledTimes(1);
    });
  });
  it('has a verbose mode', async () => {
    expect.hasAssertions();
    (vscode.workspace as any).workspaceFolders = [workspaceFolder('single-root')];
    const mockLog = jest.fn();
    console.log = mockLog;

    // exit the wizard via menu
    mockShowActionMenu(StartWizardActionId.exit);
    await expect(startWizard(mockDebugConfigProvider, { verbose: true })).resolves.toEqual(
      'success'
    );
    expect(console.log).toHaveBeenCalled();

    mockLog.mockClear();
    mockShowActionMenu(StartWizardActionId.exit);
    await expect(startWizard(mockDebugConfigProvider, { verbose: false })).resolves.toEqual(
      'success'
    );
    expect(console.log).not.toHaveBeenCalled();
  });
});
