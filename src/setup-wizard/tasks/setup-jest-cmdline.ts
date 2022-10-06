import * as path from 'path';

import {
  showActionInputBox,
  showActionMessage,
  getConfirmation,
  showActionMenu,
  jsonOut,
  actionItem,
  getWizardSettings,
  createSaveConfig,
  validateCommandLine,
  selectWorkspace,
} from '../wizard-helper';
import { WizardStatus, ActionableMenuItem, SetupTask, WizardContext } from '../types';
import { ansiEsc } from '../../JestExt/output-terminal';

export const CLSetupActionId = {
  acceptExisting: 0,
  edit: 1,
  upgrade: 2,
  info: 3,
  editInvalidCmdLine: 4,
  acceptInvalidCmdLine: 5,
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

  const handleInvalidCmdLine = async (
    cmdLine: string,
    msg: string,
    editAction: (value: string) => Promise<WizardStatus>,
    acceptAction: (value: string) => Promise<WizardStatus>
  ): Promise<WizardStatus> => {
    message(`found invalid command line: "${cmdLine}"`);
    return showActionMessage(
      'warning',
      msg,
      {
        id: CLSetupActionId.editInvalidCmdLine,
        title: 'Yes',
        isCloseAffordance: true,
        action: () => editAction(cmdLine),
      },
      {
        id: CLSetupActionId.acceptInvalidCmdLine,
        title: 'No',
        isCloseAffordance: false,
        action: () => acceptAction(cmdLine),
      }
    );
  };
  const save = async (cmdLine: string): Promise<WizardStatus> => {
    await saveConfig({
      name: `jest.jestCommandLine`,
      value: path.normalize(cmdLine),
    });

    message(`settings updated: jestCommandLine=${cmdLine}`);

    return 'success';
  };

  const edit = async (cmdLine?: string): Promise<WizardStatus> => {
    let editedValue = await showActionInputBox({
      title: 'Enter Jest Command Line',
      value: cmdLine,
      prompt: 'Note: the command line should match how you run jest tests in terminal ',
      enableBackButton: true,
      verbose: context.verbose,
    });
    editedValue = editedValue?.trim();
    if (!editedValue) {
      message(
        `jest command line did not change: jest.jestCommandLine = ${
          settings.jestCommandLine ? `"${settings.jestCommandLine}"` : settings.jestCommandLine
        }`
      );
      return 'abort';
    }
    const error = validateCommandLine(editedValue);
    if (error) {
      return handleInvalidCmdLine(
        editedValue,
        `Invalid command line:\n"${error}"\n\nDo you want to change it?`,
        edit,
        save
      );
    }
    message(`=> jest command line updated: "${editedValue}"`);
    return save(editedValue);
  };

  const withExistingSettings = async (): Promise<WizardStatus> => {
    message(`found existing setting:\n${jsonOut(settings)}\n`);

    const menuItems: ActionableMenuItem<WizardStatus>[] = [];
    let placeholder: string;

    if (settings.jestCommandLine) {
      const error = validateCommandLine(settings.jestCommandLine);
      if (error) {
        return handleInvalidCmdLine(
          settings.jestCommandLine,
          `Existing jestCommandLine might be invalid: "${error}".\n\nDo you want to change it?`,
          edit,
          () => Promise.resolve('success')
        );
      }
      const value = settings.jestCommandLine;
      placeholder = 'found existing "jestCommandLine"';
      menuItems.push(
        actionItem(
          CLSetupActionId.acceptExisting,
          '$(check) Use current jestCommandLine',
          `jest.jestCommandLine=${value}`,
          () => Promise.resolve('success')
        ),
        actionItem(
          CLSetupActionId.edit,
          '$(edit) Edit command line',
          `manually change the command line "${value}"`,
          () => edit(value)
        )
      );
    } else if (settings.pathToJest) {
      const configPath = settings['pathToConfig'];
      const configArg = configPath ? ` --config ${configPath}` : '';
      const settingName = configPath ? 'jest.pathToJest, jest.pathToConfig' : 'jest.pathToJest';
      const value = `${settings['pathToJest']}${configArg}`;
      placeholder = `upgrade deprecated ${settingName} to jestCommandLine`;
      message(
        ansiEsc(
          'warn',
          '!!! "jestToPath" and "pathToConfig" are deprecated, it is replaced by "jest.jestCommandLine"'
        ),
        'new-line'
      );
      menuItems.push(
        actionItem(
          CLSetupActionId.upgrade,
          `Upgrade existing ${settingName}`,
          `set jest.jestCommandLine="${value}"`,
          () => edit(value)
        )
      );
    } else {
      console.error('no expected settings found in ', settings);
      throw new Error('no expected settings found, should not be here');
    }

    return showActionMenu<WizardStatus>(menuItems, {
      title: 'Set up Jest Command Line',
      placeholder,
      enableBackButton: true,
      verbose: context.verbose,
    });
  };
  const withoutExistingSettings = async (): Promise<WizardStatus> => {
    const canRun = await getConfirmation(
      'info',
      'Are you able to run jest tests from the terminal ?',
      'Yes',
      'No',
      'no'
    );
    if (!canRun) {
      // abort the wizard
      const msg =
        'Looks like you are not able to run jest tests from terminal...\r\n\r\n' +
        'Please note a working jest test env is a prerequisite for vscode-jest. Feel free to relaunch the setup-tool when you are ready';
      message(msg, 'error');
      return 'abort';
    }
    return edit();
  };

  return settings.jestCommandLine || settings.pathToJest
    ? withExistingSettings()
    : withoutExistingSettings();
};
