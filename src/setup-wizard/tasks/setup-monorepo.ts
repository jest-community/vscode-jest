import * as vscode from 'vscode';

import { actionItem, createSaveConfig, getConfirmation, showActionMenu } from '../wizard-helper';
import { WizardStatus, WizardContext, SetupTask, WIZARD_HELP_URL } from '../types';
import { isSameWorkspace, WorkspaceInfo, WorkspaceManager } from '../../workspace-manager';
import { toErrorString } from '../../helpers';
import { PendingSetupTaskKey } from '../start-wizard';
import { setupJestCmdLine } from './setup-jest-cmdline';

export const MonorepoSetupActionId = {
  setupJestCmdLine: 0,
  autoConvert: 1,
  notSetup: 2,
  abort: 3,
};

/**
 * 1. if already a multi-root project: validate each folder and setup disabledWorkspaceFolder setting
 * 2. if not a multi-root, create the multi-root based on project.json, then proceed the validation step ahead.
 * @param context
 * @returns
 */
export const setupMonorepo: SetupTask = async (context: WizardContext): Promise<WizardStatus> => {
  const { message } = context;
  const wsManager = new WorkspaceManager();

  const updateRootPath = async (wsInfo: WorkspaceInfo) => {
    const config = vscode.workspace.getConfiguration('jest', wsInfo.workspace.uri);
    const rootPath = config.get<string>('rootPath');

    let shouldUpdate = true;
    if (rootPath && rootPath !== wsInfo.rootPath) {
      shouldUpdate = await getConfirmation(
        'warning',
        `[${wsInfo.workspace.name}] The existing jest.rootPath is "${rootPath}", which is different from the detected "${wsInfo.rootPath}". Do you want to override it?`,
        'Yes',
        'No',
        'yes'
      );
    }

    if (!shouldUpdate) {
      message(`\t[${wsInfo.workspace.name}] Skipped "jest.rootPath" setting updated.`, 'warn');
      return;
    }
    await createSaveConfig({ ...context, workspace: wsInfo.workspace })({
      name: `jest.rootPath`,
      value: wsInfo.rootPath,
    });
    message(`\t"jest.rootPath" setting has been updated to "${wsInfo.rootPath}"`);
  };
  const disableWorkspaceFolders = async (folders: string[]): Promise<void> => {
    const save = createSaveConfig(context);
    await save({
      name: `jest.disabledWorkspaceFolders`,
      value: folders,
    });
  };
  const validateWorkspaces = async (): Promise<WizardStatus> => {
    const workspaceFolders = getWorkspaceFolders();
    message(`Validating ${workspaceFolders.length} workspaces:`, 'new-line');
    const validWorkspaces = await wsManager.getValidWorkspaces();
    const invalid: string[] = [];

    for (const ws of workspaceFolders) {
      const valid = validWorkspaces.find((wInfo) => isSameWorkspace(wInfo.workspace, ws));
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

    message(
      `Validation Result: valid: ${workspaceFolders.length - invalid.length}, invalid: ${
        invalid.length
      }`,
      ['new-line', 'bold']
    );

    if (invalid.length > 0) {
      message(
        `Excluding ${
          invalid.length
        } workspaces via "jest.disabledWorkspaceFolders": [${invalid.join(', ')}]\r\n`,
        'new-line'
      );
      await disableWorkspaceFolders(invalid);
    } else {
      message('All workspace folders are valid jest workspaces', 'new-line');
    }
    await showWorkspaceConfig();

    return 'success';
  };

  /**
   * convert the single root workspace to multi-root workspace. Since this will cause vscode to restart extension
   * we need to inform ExtensionManager to resume setup after restart.
   *
   * @param rootFolder
   * @returns
   */
  const convertToMultiRoot = async (rootFolder: vscode.WorkspaceFolder): Promise<WizardStatus> => {
    message(`Converting single-root workspace to multi-root workspace...`);

    // convert to multi-root caused vscode to restart the extension, therefore use this state
    // to notify ExtensionManager to resume setup after extension restart
    context.vscodeContext.globalState.update(PendingSetupTaskKey, {
      workspace: rootFolder.name,
      taskId: 'monorepo',
    });

    // save to multi-root workspace: this will caused extension to quit
    await vscode.commands.executeCommand('workbench.action.saveWorkspaceAs');
    return 'exit';
  };

  const addWorkspaces = async (rootFolder: vscode.WorkspaceFolder): Promise<WizardStatus> => {
    message(`Adding monorepo packages to multi-root workspace...`);

    const workspaceName = (uri: vscode.Uri): string => {
      const parts = uri.path.split('/');
      return parts[parts.length - 1];
    };

    try {
      const uris = await wsManager.getFoldersFromFilesystem();
      // disable all the folders first so extension manager won't trying to register everything during the process
      await disableWorkspaceFolders(
        [rootFolder.name].concat(uris.map((uri) => workspaceName(uri)))
      );

      return new Promise<WizardStatus>((resolve, reject) => {
        const subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
          validateWorkspaces()
            .then((status) => resolve(status))
            .catch((e) => reject(e))
            .finally(() => subscription.dispose());
        });

        message(`adding ${uris.length} folders:`);
        const folders = uris.map((uri) => {
          message(uri.fsPath);
          return { uri };
        });

        const success = vscode.workspace.updateWorkspaceFolders(1, null, ...folders);
        if (!success) {
          reject(new Error(`failed to add workspace folders`));
        }
      });
    } catch (e) {
      message(`Failed to add/validate workspace folders:\r\n${toErrorString(e)}`, 'error');
    }
    return 'abort';
  };

  const showWorkspaceConfig = async (): Promise<void> => {
    if (vscode.workspace.workspaceFile) {
      message(
        `Please review and adjust config if needed: "${vscode.workspace.workspaceFile?.fsPath}"\r\n` +
          `Need more help? Please checkout FAQ: ${WIZARD_HELP_URL}#faq`,
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

  const handleSingleRoot = (): Promise<WizardStatus> => {
    const rootFolder = getWorkspaceFolders()[0];
    return showActionMenu(
      [
        actionItem(
          MonorepoSetupActionId.setupJestCmdLine,
          '$(root-folder) There is a centralized jest config for all tests',
          'Click to set up "jest.jestCommandLine"',
          () => {
            context.workspace = rootFolder;
            return setupJestCmdLine(context);
          }
        ),
        actionItem(
          MonorepoSetupActionId.autoConvert,
          '$(file-submodule) There is an individual jest config for each package',
          'Click to convert to a multi-root workspace',
          () => convertToMultiRoot(rootFolder)
        ),
        actionItem(
          MonorepoSetupActionId.notSetup,
          '$(warning) Not configured or not working in terminal yet',
          'Please setup a working test env first. Click to abort',
          () => Promise.resolve('abort' as WizardStatus)
        ),
        actionItem(MonorepoSetupActionId.abort, '$(close) Abort', 'monorepo setup will abort', () =>
          Promise.resolve('abort' as WizardStatus)
        ),
      ],
      {
        title: 'Monorepo with Single-Root Workspace',
        placeholder: 'How is your jest environment configured?',
        enableBackButton: true,
      }
    );
  };

  const getWorkspaceFolders = (): readonly vscode.WorkspaceFolder[] => {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
      throw new Error('require at least 1 open workspace');
    }
    return vscode.workspace.workspaceFolders;
  };
  const exec = (): Promise<WizardStatus> => {
    const workspaces = getWorkspaceFolders();
    if (workspaces.length > 1) {
      return validateWorkspaces();
    }
    if (vscode.workspace.workspaceFile) {
      return addWorkspaces(workspaces[0]);
    }
    return handleSingleRoot();
  };

  return await exec();
};
