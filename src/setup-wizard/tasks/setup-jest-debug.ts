/**
 * generate a debug config and update the launch.json for users to edit
 */
import * as vscode from 'vscode';

import {
  showActionMenu,
  getWizardSettings,
  createSaveConfig,
  selectWorkspaceFolder,
} from '../wizard-helper';
import { WizardStatus, SetupTask, WizardContext } from '../types';
import { setupJestCmdLine } from './setup-jest-cmdline';
import { getValidJestCommand } from '../../helpers';
import { enabledWorkspaceFolders } from '../../workspace-manager';

export const DEBUG_CONFIG_NAME = 'vscode-jest-tests';

export const DebugSetupActionId = {
  generate: 0,
  setupJestCommand: 1,
  setupJestCommandButton: 2,
};

type SetupMode = 'generate' | 'done';
export const setupJestDebug: SetupTask = async (context: WizardContext): Promise<WizardStatus> => {
  const { workspace: _ws, message, debugConfigProvider } = context;
  const workspace = _ws ?? (await selectWorkspaceFolder(enabledWorkspaceFolders()));
  if (!workspace) {
    return 'abort';
  }
  context.workspace = workspace;

  let mode: SetupMode;

  const saveConfig = createSaveConfig(context);
  const settings = getWizardSettings(workspace);
  const launchConfigs = settings.configurations;

  const save = async (config: vscode.DebugConfiguration): Promise<string | undefined> => {
    let renamed;
    const configs =
      launchConfigs?.map((c) => {
        if (c.name !== config.name) {
          return c;
        }
        renamed = `${config.name}-${Date.now()}`;
        return { ...c, name: renamed };
      }) || [];
    configs.push(config);
    await saveConfig({
      name: 'launch.configurations',
      value: configs,
    });

    if (renamed) {
      message(`existing "${config.name}" config has been renamed to "${renamed}"`);
    }
    message(`a new debug config "${config.name}" has been added in launch.json`);
    return renamed;
  };

  // open launch.json and position to the jest debug config
  const showConfig = async (): Promise<WizardStatus> => {
    const launchFile = vscode.Uri.joinPath(workspace.uri, '.vscode', 'launch.json');
    const doc = await vscode.workspace.openTextDocument(launchFile);
    const text = doc.getText();
    const { sorted } = debugConfigProvider.getDebugConfigNames(workspace);
    let offset = -1;
    for (const name of sorted) {
      offset = text.indexOf(name);
      if (offset > 0) {
        break;
      }
    }

    const startPos = doc.positionAt(offset);
    const endPos = new vscode.Position(
      startPos.line,
      startPos.character + DEBUG_CONFIG_NAME.length + 2
    );

    const range = new vscode.Range(startPos, endPos);
    await vscode.window.showTextDocument(doc, { selection: range });
    return 'success';
  };

  const setupJestCommand = async (): Promise<WizardStatus> => {
    const result = await setupJestCmdLine(context);
    if (result === 'success') {
      return setupJestDebug(context);
    }
    return 'abort';
  };

  const generate = async (): Promise<WizardStatus> => {
    // check prerequisite
    let jestCommandLine = settings.jestCommandLine;
    let rootPath = settings.rootPath;

    if (!jestCommandLine) {
      const validSettings = (await getValidJestCommand(workspace, context.wsManager, rootPath))
        .validSettings;

      if (validSettings.length === 1) {
        ({ jestCommandLine, rootPath } = validSettings[0]);
      } else {
        message('No valid jest command found. Redirecting to jest command setup...', 'warn');
        return setupJestCommand();
      }
    }

    const debugConfig = debugConfigProvider.createDebugConfig(workspace, {
      jestCommandLine,
      rootPath,
      nodeEnv: settings.nodeEnv,
    });
    message('generated a debug config with jestCommandLine and rootPath:', 'info');
    message(`${JSON.stringify(debugConfig, undefined, '  ')}`, 'new-line');

    await save(debugConfig);
    await showConfig();

    message('please review and edit the launch.json accordingly', 'new-line');
    mode = 'done';
    return 'success';
  };

  const showMenu = async (): Promise<WizardStatus> => {
    const menuItems = [];
    switch (mode) {
      case 'generate': {
        menuItems.push({
          id: DebugSetupActionId.generate,
          label: 'generate a debug config',
          detail: 'update launch.json with the new debug config',
          action: generate,
        });
        break;
      }
      case 'done': {
        menuItems.push({
          id: DebugSetupActionId.generate,
          label: 'debug config generated.',
          detail: 'please review and adjust if needed.',
          description: '$(pass-filled)',
        });
        break;
      }
    }
    const menuStatus = await showActionMenu<WizardStatus>(menuItems, {
      title: `[${workspace.name}] Set up Debug Config`,
      placeholder: 'generating debug config with jestCommandLine and rootPath',
      enableBackButton: true,
      verbose: context.verbose,
      allowNoAction: true,
    });
    if (menuStatus !== 'success') {
      return menuStatus;
    }
    return showMenu();
  };

  mode = 'generate';
  return showMenu();
};
