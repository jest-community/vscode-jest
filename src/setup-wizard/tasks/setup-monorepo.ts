import * as vscode from 'vscode';

import { createSaveConfig, getConfirmation } from '../wizard-helper';
import { WizardStatus, WizardContext, SetupTask } from '../types';
import { WorkspaceInfo, WorkspaceManager } from './workspace-manager';
import { toErrorString } from '../../helpers';
import { ansiEsc } from '../../JestExt/output-terminal';

export const MonorepoSetupActionId = {
  saveConfig: 0,
};

/**
 * 1. if already a multi-root project: validate each folder and setup disabledWorkspaceFolder setting
 * 2. if not a multi-root, create the multi-root based on project.json, then proceed the validation step ahead.
 * @param context
 * @returns
 */
export const setupMonorepo: SetupTask = async (context: WizardContext): Promise<WizardStatus> => {
  const wsManager = new WorkspaceManager();
  const { message } = context;

  const updateRootPath = async (wsInfo: WorkspaceInfo) => {
    const config = vscode.workspace.getConfiguration('jest', wsInfo.workspace.uri);
    const rootPath = config.get<string>('rootPath');

    if (rootPath) {
      message(`\t"jest.rootPath" alredy defined "${rootPath}", skip rootPath update`);
      return;
    }

    const shouldUpdate = await getConfirmation(
      'info',
      `[${wsInfo.workspace.name}] Adding "jest.rootPath": "${wsInfo.rootPath}" setting?`,
      'Yes',
      'No',
      'yes'
    );
    if (!shouldUpdate) {
      message(
        `\t[${wsInfo.workspace.name}] "jest.rootPath" setting did NOT update ${wsInfo.rootPath}. Jest run might fail.`,
        'warn'
      );
      return;
    }
    await createSaveConfig({ ...context, workspace: wsInfo.workspace })({
      name: `jest.rootPath`,
      value: wsInfo.rootPath,
    });
    message(`\t"jest.rootPath" setting has been updated with ${wsInfo.rootPath}`);
  };
  const validateWorkspaces = async (): Promise<WizardStatus> => {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
      message('no workspace folder to validate', 'warn');
      return Promise.resolve('abort');
    }
    message(`Validating ${vscode.workspace.workspaceFolders.length} workspaces:`, 'new-line');
    const validWorkspaces = await wsManager.getValidWorkspaces();
    const invalid: string[] = [];

    for (const ws of vscode.workspace.workspaceFolders) {
      const valid = validWorkspaces.find((wInfo) => wInfo.workspace.name === ws.name);
      if (valid) {
        const extra = valid.rootPath ? `with rootPath="${valid.rootPath}"` : '';
        message(`"${ws.name}" is a valid jest workspace ${extra}`, ['success', 'lite']);
        if (valid.rootPath) {
          await updateRootPath(valid);
        }
      } else {
        message(`"${ws.name}" is NOT a valid jest workspace`, ['error', 'lite']);
        invalid.push(ws.name);
      }
    }

    if (invalid.length > 0) {
      message(
        `Excluding ${
          invalid.length
        } workspaces via "jest.disabledWorkspaceFolders": [${invalid.join(', ')}]`,
        'new-line'
      );
      const save = createSaveConfig(context);
      await save({
        name: `jest.disabledWorkspaceFolders`,
        value: invalid,
      });
    } else {
      message('All workspace folders are valid jest workspaces', 'new-line');
    }
    await showWorkspaceConfig();

    return 'success';
  };

  const createWorkspaces = async (): Promise<WizardStatus> => {
    message(`Converting monorepo to multi-root workspace...`);

    if (!vscode.workspace.workspaceFile) {
      message(
        'monorepo is supported in vscode via multi-root workspace. Please follow the instruction below to complete the setup:',
        'warn'
      );
      message(
        `1. Convert the current workspace to the multi-root workspace: select code menu: ${ansiEsc(
          'success',
          '"File > Save Workspace As..."'
        )}\r\n\r\n` +
          `2. Resume setup: launch the setup tool from command pallette ${ansiEsc(
            'success',
            '"Jest: Setup Extension"'
          )}, then ${ansiEsc('success', '"Setup monorepo project"')}.\r\n\r\n`,
        'new-line'
      );

      vscode.window.showWarningMessage(
        `Manual update is required. Please check the Setup Tool terminal for instructions`,
        { modal: true }
      );
      return 'exit';
    }
    try {
      const uris = await wsManager.getFoldersFromFilesystem();
      // workbench.action.saveWorkspaceAs
      message(`adding ${uris.length} folders:`);
      uris.forEach((uri) => message(uri.fsPath));
      vscode.workspace.updateWorkspaceFolders(1, 0, ...uris.map((uri) => ({ uri })));
      await validateWorkspaces();

      return 'success';
    } catch (e) {
      message(`Failed to create multii-root workspace config:\r\n${toErrorString(e)}`, 'error');
    }
    return 'abort';
  };

  const showWorkspaceConfig = async (): Promise<void> => {
    if (vscode.workspace.workspaceFile) {
      message(
        `Please review and adjust config if needed: "${vscode.workspace.workspaceFile?.fsPath}"`,
        'info'
      );
      const doc = await vscode.workspace.openTextDocument(vscode.workspace.workspaceFile);
      await vscode.window.showTextDocument(doc);
    } else {
      message(
        'no multi-root workspace config is found, please check the setup tool guide for troubleshooting'
      );
    }
  };
  const exec = async (): Promise<WizardStatus> => {
    const isMultiRoot =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1;
    if (isMultiRoot) {
      return await validateWorkspaces();
    }
    return await createWorkspaces();
  };

  return await exec();
};
