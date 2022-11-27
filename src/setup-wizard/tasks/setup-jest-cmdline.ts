/**
 * setup rootPath and jestCommandLine
 */
import * as vscode from 'vscode';

import {
  showActionInputBox,
  showActionMenu,
  getWizardSettings,
  createSaveConfig,
  validateCommandLine,
  selectWorkspace,
  toActionButton,
  validateRootPath,
} from '../wizard-helper';
import { WizardStatus, ActionableMenuItem, SetupTask, WizardContext } from '../types';

export const CLSetupActionId = {
  jestCommandLine: 0,
  rootPath: 1,
  editJestCommandLine: 2,
  editRootPath: 3,
  saveSettings: 4,
  separator: 10,
};

export const setupJestCmdLine: SetupTask = async (
  context: WizardContext
): Promise<WizardStatus> => {
  const { workspace: _ws, message } = context;
  const workspace = _ws ?? (await selectWorkspace());
  if (!workspace) {
    return 'abort';
  }
  context.workspace = workspace;

  const saveConfig = createSaveConfig(context);
  const settings = getWizardSettings(workspace);

  const save = async (): Promise<WizardStatus> => {
    await saveConfig({
      name: `jest.jestCommandLine`,
      value: settings.jestCommandLine,
    });
    message(`jestCommandLine saved: ${settings.jestCommand}`);
    await saveConfig({
      name: `jest.rootPath`,
      value: settings.rootPath,
    });
    message(`rootPath saved: ${settings.rootPath}`);

    return 'exit';
  };

  const editJestCmdLine = async (): Promise<WizardStatus> => {
    const editedValue = await showActionInputBox<string>({
      title: 'Enter Jest Command Line',
      value: settings.jestCommandLine,
      prompt: 'Note: the command line should match how you run jest tests in terminal ',
      enableBackButton: true,
      verbose: context.verbose,
    });
    settings.jestCommandLine = editedValue;
    return 'success';
  };
  const editRootPath = async (): Promise<WizardStatus> => {
    const editedValue = await showActionInputBox<string>({
      title: 'Enter Root Path (if different from workspace root)',
      value: settings.rootPath,
      prompt: 'the directory to start jest command',
      enableBackButton: true,
      verbose: context.verbose,
    });
    settings.rootPath = editedValue;
    return 'success';
  };

  const editJestCmdLineButton = toActionButton(
    CLSetupActionId.editJestCommandLine,
    'edit',
    'edit jestCommandLine',
    () => editJestCmdLine()
  );
  const editRootPathButton = toActionButton(
    CLSetupActionId.editRootPath,
    'edit',
    'edit rootPath',
    () => editRootPath()
  );
  const showMenu = async (): Promise<WizardStatus> => {
    const menuItems: ActionableMenuItem<WizardStatus>[] = [];

    if (settings.jestCommandLine) {
      const error = validateCommandLine(settings.jestCommandLine);
      if (error) {
        message(
          `jestCommandLine "${settings.jestCommandLine}" is not valid:\r\n  ${error}`,
          'error'
        );
        settings.jestCommandLine = undefined;
      }
    }
    if (settings.rootPath) {
      if (!validateRootPath(workspace, settings.rootPath)) {
        message(`rootPath "${settings.rootPath}" is not valid:\r\n`, 'error');
        settings.rootPath = undefined;
      }
    }

    menuItems.push(
      {
        id: CLSetupActionId.jestCommandLine,
        label: `${settings.rootPath}`,
        detail: 'rootPath: the directory to start jest test from, if differ from workspace root',
        buttons: [editRootPathButton],
      },
      {
        id: CLSetupActionId.jestCommandLine,
        label: `${settings.jestCommandLine}`,
        detail: 'jestCommandLine: the command to start jest test',
        buttons: [editJestCmdLineButton],
      },
      {
        id: CLSetupActionId.separator,
        kind: vscode.QuickPickItemKind.Separator,
        label: '',
      },
      {
        id: CLSetupActionId.saveSettings,
        label: `$(settings-gear) Save Settings`,
        detail: 'save the settings above and exit',
        action: save,
      }
    );

    const menuStatus = await showActionMenu<WizardStatus>(menuItems, {
      title: 'Set up Jest Command Line and Root Path',
      placeholder: 'update rootPath and jestCommandLine settings below',
      enableBackButton: true,
      verbose: context.verbose,
      allowNoAction: true,
    });
    if (menuStatus !== 'success') {
      return menuStatus;
    }
    return showMenu();
  };

  return showMenu();
};
