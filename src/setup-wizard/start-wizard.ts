import * as vscode from 'vscode';
import {
  WizardStatus,
  ActionableMenuItem,
  WizardContext,
  SetupTask,
  WIZARD_HELP_URL,
} from './types';
import { jsonOut, actionItem, showActionMenu } from './wizard-helper';
import { setupJestCmdLine, setupJestDebug, setupMonorepo } from './tasks';
import { ExtOutputTerminal, OutputOptions } from '../JestExt/output-terminal';
import { toErrorString } from '../helpers';

// wizard tasks - right now only 2, could easily add more
export type WizardTaskId = 'cmdLine' | 'debugConfig' | 'monorepo';
export const StartWizardActionId: Record<WizardTaskId | 'exit', number> = {
  cmdLine: 0,
  debugConfig: 1,
  monorepo: 2,
  exit: 3,
};

export const WizardTasks: { [key in WizardTaskId]: { task: SetupTask; actionId: number } } = {
  ['cmdLine']: { task: setupJestCmdLine, actionId: StartWizardActionId.cmdLine },
  ['debugConfig']: { task: setupJestDebug, actionId: StartWizardActionId.debugConfig },
  ['monorepo']: { task: setupMonorepo, actionId: StartWizardActionId.monorepo },
};

export interface StartWizardOptions {
  workspace?: vscode.WorkspaceFolder;
  taskId?: WizardTaskId;
  verbose?: boolean;
}
export const startWizard = (
  debugConfigProvider: vscode.DebugConfigurationProvider,
  options: StartWizardOptions = {}
): Promise<WizardStatus> => {
  const { workspace, taskId, verbose } = options;

  const terminal = new ExtOutputTerminal('vscode-jest Setup Tool');

  const message = (msg: string, opt?: OutputOptions): string => {
    const str = terminal.write(`${msg}${opt ? '' : '\r\n'}`, opt);
    if (verbose) {
      console.log(`<SetupTool> ${msg}`);
    }
    return str;
  };

  const runTask = async (context: WizardContext, taskId: WizardTaskId): Promise<WizardStatus> => {
    try {
      const wsMsg = context.workspace ? `in workspace "${context.workspace.name}"` : '';
      message(`=== starting ${taskId} task ${wsMsg} ===\r\n`, 'new-line');

      const result = await WizardTasks[taskId].task(context);
      message(`=== ${taskId} task completed with status "${result}" ===\r\n`, 'new-line');
      return result;
    } catch (e) {
      message(`setup ${taskId} task encountered unexpected error:\r\n${toErrorString(e)}`, 'error');
    }
    return 'error';
  };

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
      actionItem(
        StartWizardActionId.monorepo,
        '$(folder-library) Setup monorepo project',
        'setup and validate workspaces for monorepo project',
        () => runTask(context, 'monorepo')
      ),
      actionItem(StartWizardActionId.exit, '$(close) Exit', 'Exit the setup tool', () =>
        Promise.resolve('exit')
      ),
    ];

    let result: WizardStatus;
    let selectItemIdx: number | undefined = menuItems.findIndex(
      (item) => taskId && item.id === WizardTasks[taskId]?.actionId
    );
    do {
      result = await showActionMenu(menuItems, {
        title: 'vscode-jest Setup Tool',
        placeholder: 'select a set up action below',
        selectItemIdx,
        verbose,
      });
      selectItemIdx = undefined;
    } while (result !== 'exit' && result !== 'error');
    return result;
  };

  const launch = async (): Promise<WizardStatus> => {
    message(`Setup Tool Guide: ${WIZARD_HELP_URL}`, 'info');
    terminal.show();

    const context: WizardContext = {
      debugConfigProvider,
      workspace,
      message,
      verbose,
    };

    try {
      const s = await showMainMenu(context);
      const status = s === 'exit' ? 'success' : s;
      message(`\nsetup-tool exit with status "${status}"`);
      return status;
    } catch (e) {
      console.error(`setup-tool caught error:`, e);
      message(`\nsetup-tool exit with error: ${jsonOut(e)}`);
      return 'error';
    }
  };

  return launch();
};
