import * as vscode from 'vscode';
import {
  WizardStatus,
  ActionableMenuItem,
  WizardContext,
  SetupTask,
  WIZARD_HELP_URL,
} from './types';
import { jsonOut, actionItem, showActionMenu } from './wizard-helper';
import { setupJestCmdLine, setupJestDebug } from './tasks';

export const createWizardContext = (
  workspace: vscode.WorkspaceFolder,
  debugConfigProvider: vscode.DebugConfigurationProvider,
  message: (msg: string, section?: string) => void
): WizardContext => {
  return {
    debugConfigProvider,
    workspace,
    message,
  };
};

export const StartWizardActionId = {
  cmdLine: 0,
  debugConfig: 1,
  exit: 2,
};
export type WizardTaskId = 'cmdLine' | 'debugConfig';
const TaskActionMap: { [key in WizardTaskId]: number } = {
  ['cmdLine']: StartWizardActionId.cmdLine,
  ['debugConfig']: StartWizardActionId.debugConfig,
};

export const WizardTasks: { [key in WizardTaskId]: SetupTask } = {
  ['cmdLine']: setupJestCmdLine,
  ['debugConfig']: setupJestDebug,
};

export const startWizard = (
  debugConfigProvider: vscode.DebugConfigurationProvider,
  ws?: vscode.WorkspaceFolder,
  taskId?: WizardTaskId
): Promise<WizardStatus> => {
  const _output = vscode.window.createOutputChannel('vscode-jest Setup');

  const dispose = (): void => {
    // TODO dispose the outputChannel once wizard is out of beta
  };

  const message = (msg: string, section?: string): void => {
    if (section) {
      _output.appendLine(`\n===== ${section} =====\n`);
    }
    _output.appendLine(msg);
    _output.show(true);
  };

  const runTask = async (context: WizardContext, taskId: WizardTaskId): Promise<WizardStatus> =>
    WizardTasks[taskId](context);

  const showMainMenu = async (context: WizardContext): Promise<WizardStatus> => {
    const menuItems: ActionableMenuItem<WizardStatus>[] = [
      actionItem(
        StartWizardActionId.cmdLine,
        '$(beaker) Setup Jest Command',
        'set up jest command to run your tests',
        () => runTask(context, 'cmdLine')
      ),
      actionItem(
        StartWizardActionId.debugConfig,
        '$(debug-alt) Setup Jest Debug Config',
        'setup launch.json to debug jest tests',
        () => runTask(context, 'debugConfig')
      ),
      actionItem(StartWizardActionId.exit, '$(close) Exit', 'Exit the setup wizard', () =>
        Promise.resolve('exit')
      ),
    ];

    let result: WizardStatus;
    let selectItemIdx = menuItems.findIndex((item) => item.id === TaskActionMap[taskId]);
    do {
      result = await showActionMenu(menuItems, {
        title: 'vscode-jest Setup Wizard',
        placeholder: 'select a set up action below',
        selectItemIdx,
      });
      selectItemIdx = undefined;
    } while (result !== 'exit' && result !== 'error');
    return result;
  };
  const workspaceSetup = (context: WizardContext): Promise<WizardStatus> => {
    return showMainMenu(context);
  };

  const selectWorkspace = async (): Promise<vscode.WorkspaceFolder> => {
    message('', 'Select a workspace folder to set up...');
    return vscode.workspace.workspaceFolders.length <= 1
      ? Promise.resolve(vscode.workspace.workspaceFolders[0])
      : await vscode.window.showWorkspaceFolderPick();
  };

  const launch = async (): Promise<WizardStatus> => {
    _output.show(true);
    _output.clear();

    message(`Welcome to vscode-jest setup wizard!`);
    message(`\t(More info about the setup wizard: ${WIZARD_HELP_URL})`);

    const workspace = ws || (await selectWorkspace());

    if (workspace) {
      message(`=> workspace "${workspace.name}" is selected`);

      const context: WizardContext = {
        debugConfigProvider,
        workspace,
        message,
      };

      try {
        const status = await workspaceSetup(context);
        message(`\nwizard is done: status = ${status}`);
        return status === 'exit' ? 'success' : status;
      } catch (e) {
        console.error(`wizard caught error:`, e);
        message(`\nwizard exit with error: ${jsonOut(e)}`);
        return 'error';
      } finally {
        dispose();
      }
    } else {
      message(`\nNo workspace is selected, abort wizard`);
      dispose();
      return 'abort';
    }
  };

  return launch();
};
