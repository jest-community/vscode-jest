/**
 * helper functions that are used across components/files
 */
import * as vscode from 'vscode';
import * as path from 'path';
import {
  WizardStatus,
  WizardAction,
  ActionableMenuItem,
  ActionMenuOptions,
  ActionableButton,
  WizardSettings,
  JestSettings,
  ConfigEntry,
  ActionableMessageItem,
  ActionMessageType,
  ActionInputBoxOptions,
  ActionInputResult,
  ActionableMenuResult,
  ActionMenuInput,
  ActionInput,
  isActionableButton,
  WizardContext,
} from './types';
import { JestExtAutoRunSetting } from '../Settings';
import { existsSync } from 'fs';
import { parseCmdLine, removeSurroundingQuote } from '../helpers';

export const jsonOut = (json: unknown): string => JSON.stringify(json, undefined, 4);

/* istanbul ignore next */
export const actionItem = <T = WizardStatus>(
  id: number,
  label: string,
  detail: string,
  action: WizardAction<T>
): ActionableMenuItem<T> => ({
  id,
  label,
  detail,
  action,
});

/* istanbul ignore next */
export const toActionButton = <T = WizardStatus>(
  id: number,
  iconId: string,
  tooltip?: string,
  action?: WizardAction<T>
): ActionableButton<T> => {
  return {
    id,
    iconPath: new vscode.ThemeIcon(iconId),
    tooltip,
    action,
  };
};

/**
 * methods to handle button click in vscode UI
 * @param button  should be either ActionableButton or the system BackButton.
 * @returns
 */
const handleButtonClick = <T>(button: vscode.QuickInputButton): ActionableButton<T> | undefined => {
  if (button === vscode.QuickInputButtons.Back) {
    return undefined;
  }
  if (isActionableButton(button)) {
    return button as ActionableButton<T>;
  }
  throw new Error(`expect actionableButton but got ${JSON.stringify(button)}`);
};

/**
 *
 * @param items
 * @param options
 * @returns the selected item or undefined if no selection (esc or backButton click)
 */
export const showActionMenu = async <T = WizardStatus>(
  items: ActionableMenuItem<T>[],
  options: ActionMenuOptions<T> = {}
): Promise<ActionableMenuResult<T>> => {
  const quickPick = vscode.window.createQuickPick<ActionableMenuItem<T>>();
  quickPick.items = items;
  quickPick.title = options.title;
  quickPick.value = options.value || '';
  quickPick.placeholder = options.placeholder;
  quickPick.canSelectMany = false;
  quickPick.ignoreFocusOut = true;

  if (options.rightButtons) {
    quickPick.buttons = options.rightButtons;
  }
  if (options.enableBackButton) {
    quickPick.buttons = [vscode.QuickInputButtons.Back, ...(quickPick.buttons || [])];
  }

  const logging = options?.verbose
    ? (msg: string): void => console.log(`<showActionMenu> ${msg}`)
    : undefined;
  try {
    const input = await new Promise<ActionMenuInput<T>>((resolve) => {
      quickPick.onDidChangeSelection((selectedItems) => {
        if (selectedItems.length !== 1) {
          throw new Error(`expect 1 selected item but got: ${selectedItems.length}`);
        }
        if (selectedItems[0].action) {
          return resolve(selectedItems[0]);
        }
        if (!options.allowNoAction) {
          console.error('item has no action:', selectedItems[0]);
          return resolve(undefined);
        }
      });
      quickPick.onDidTriggerButton((button) => resolve(handleButtonClick(button)));
      quickPick.onDidTriggerItemButton((event) => {
        if (isActionableButton(event.button)) {
          return resolve(event.button as ActionableButton<T>);
        }
        // no action, do nothing
        if (!options.allowNoAction) {
          console.error('button has no action:', event.button);
          return resolve(undefined);
        }
      });

      quickPick.show();
      if (
        options.selectItemIdx != null &&
        options.selectItemIdx >= 0 &&
        options.selectItemIdx < items.length
      ) {
        quickPick.selectedItems = [items[options.selectItemIdx]];
      }
    });
    if (!input) {
      logging?.('no selection is made');
      return undefined;
    }
    logging?.(`"${isActionableButton(input) ? `button ${input.id}` : input.label}" is selected`);
    return input.action?.();
  } catch (e) {
    return Promise.reject(e);
  } finally {
    quickPick.dispose();
  }
};

/**
 *
 * @param title
 * @param value
 * @param options
 * @returns string if "enter", undefined if "ESC" or backButton click
 */
export const showActionInputBox = async <T = WizardStatus>(
  options?: ActionInputBoxOptions<T>
): Promise<ActionInputResult<T>> => {
  const inputBox = vscode.window.createInputBox();
  inputBox.title = options?.title;
  inputBox.value = options?.value || '';
  inputBox.prompt = options?.prompt;
  inputBox.ignoreFocusOut = true;
  inputBox.buttons = options?.rightButtons || [];
  if (options?.enableBackButton) {
    inputBox.buttons = [vscode.QuickInputButtons.Back, ...inputBox.buttons];
  }

  const logging = options?.verbose
    ? (msg: string): void => console.log(`<ShowActionInputBox> ${msg}`)
    : undefined;
  try {
    const input = await new Promise<ActionInput<T>>((resolve) => {
      inputBox.onDidAccept(() => resolve(inputBox.value));
      inputBox.onDidHide(() => resolve(undefined));
      inputBox.onDidTriggerButton((button) => resolve(handleButtonClick(button)));
      inputBox.show();
    });
    if (!input) {
      logging?.(`no input received`);
      return undefined;
    }
    if (isActionableButton(input)) {
      logging?.(`button ${input.id} is clicked: `);
      return input.action?.();
    }
    logging?.(`input box received "${input}"`);
    return input;
  } catch (e) {
    return Promise.reject(e);
  } finally {
    inputBox.dispose();
  }
};

export const showActionMessage = async <T = WizardStatus>(
  type: ActionMessageType,
  message: string,
  ...buttons: ActionableMessageItem<T>[]
): Promise<ActionableMenuResult<T>> => {
  let button;
  switch (type) {
    case 'info':
      button = await vscode.window.showInformationMessage(message, { modal: true }, ...buttons);
      break;
    case 'warning':
      button = await vscode.window.showWarningMessage(message, { modal: true }, ...buttons);
      break;
    case 'error':
      button = await vscode.window.showErrorMessage(message, { modal: true }, ...buttons);
      break;
  }
  return await button?.action?.();
};

export const getConfirmation = async (
  type: ActionMessageType,
  msg: string,
  yesTitle = 'Yes',
  noTitle = 'No',
  onCancel: 'yes' | 'no' = 'no'
): Promise<boolean> => {
  const choice = await showActionMessage(
    type,
    msg,
    {
      id: 1,
      title: yesTitle,
      isCloseAffordance: onCancel === 'yes',
      action: () => Promise.resolve(true),
    },
    {
      id: 0,
      title: noTitle,
      isCloseAffordance: onCancel === 'no',
      action: () => Promise.resolve(false),
    }
  );

  return choice ?? onCancel === 'yes' ? true : false;
};

/**
 * perform cmdLine validation check:
 * 1. for npm script, make sure there is a '--' argument
 *
 * @param cmdLine
 * @ return invalid reason or undefined if it's valid
 */
export const validateCommandLine = (cmdLine: string): string | undefined => {
  const [cmd, ...cmdArgs] = parseCmdLine(cmdLine);
  if (!cmd || cmd.trim() === '') {
    return 'command line can not be empty';
  }
  if (cmd.trim().toLowerCase() === 'npm') {
    if (!cmdArgs.includes('--')) {
      return 'npm run-script should include flag "--" so the extension can append extra arguments at run time';
    }
  }
};

/**
 * get releveant settings from vscode config (settings.json and launch.json) of the given workspace
 * @param workspace
 */
export const getWizardSettings = (workspace: vscode.WorkspaceFolder): WizardSettings => {
  const wsSettings: WizardSettings = {};

  // populate jest settings
  const jestSettings = vscode.workspace.getConfiguration('jest', workspace.uri);
  JestSettings.forEach((name) => {
    const value = jestSettings.get<string>(name)?.trim();
    if (!value) {
      return;
    }
    wsSettings[name] = value;
    if (name === 'rootPath' && value) {
      const rootPath = removeSurroundingQuote(value);
      wsSettings['absoluteRootPath'] = path.normalize(
        path.isAbsolute(rootPath) ? rootPath : path.join(workspace.uri.fsPath, rootPath)
      );
    }
  });

  wsSettings.autoRun = jestSettings.get<JestExtAutoRunSetting>('autoRun');

  // populate debug config settings
  const value = vscode.workspace
    .getConfiguration('launch', workspace.uri)
    .get<vscode.DebugConfiguration[]>('configurations');
  if (value) {
    wsSettings['configurations'] = value;
  }
  return wsSettings;
};

export const validateRootPath = (workspace: vscode.WorkspaceFolder, rootPath: string): boolean => {
  const _rootPath = removeSurroundingQuote(rootPath);
  return existsSync(
    path.isAbsolute(_rootPath) ? _rootPath : path.resolve(workspace.uri.fsPath, _rootPath)
  );
};

export const createSaveConfig =
  (context: WizardContext) =>
  (...entries: ConfigEntry[]): Promise<void> => {
    const { workspace, message } = context;
    const config = vscode.workspace.getConfiguration(undefined, workspace?.uri);

    const promises = entries.map((e) => {
      message(
        `Updating setting "${e.name}" in vscode workspace ${
          workspace ? `folder ${workspace.name}` : ''
        }`
      );
      return config.update(
        e.name,
        e.value,
        workspace
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : vscode.ConfigurationTarget.Workspace
      );
    });
    return Promise.all(promises)
      .then(() => {
        message(`All updates saved successfully`);
      })
      .catch((e) => {
        message(`Some config.update failed: ${jsonOut(e)}`);
        throw e;
      });
  };

export const selectWorkspace = async (): Promise<vscode.WorkspaceFolder | undefined> => {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
    return Promise.resolve(undefined);
  }
  return vscode.workspace.workspaceFolders.length == 1
    ? Promise.resolve(vscode.workspace.workspaceFolders[0])
    : await vscode.window.showWorkspaceFolderPick();
};
