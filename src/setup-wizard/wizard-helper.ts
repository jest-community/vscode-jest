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
  ActionableResult,
  ActionableButton,
  AllowBackButton,
  WizardSettings,
  JestSettings,
  ConfigEntry,
  ActionableMessageItem,
  WizardContext,
  ActionMessageType,
} from './types';

export const jsonOut = (json: unknown): string => JSON.stringify(json, undefined, 4);

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

/**
 *
 * @param items
 * @param options
 * @returns the selected item or undefined if no selection (esc or backButton click)
 */
export const showActionMenu = <T = WizardStatus>(
  items: ActionableMenuItem<T>[],
  options: ActionMenuOptions<T> = {}
): Promise<ActionableResult<T>> => {
  const quickPick = vscode.window.createQuickPick<ActionableMenuItem<T>>();
  quickPick.items = items;
  quickPick.title = options.title;
  quickPick.value = options.value;
  quickPick.placeholder = options.placeholder;
  quickPick.canSelectMany = false;
  quickPick.ignoreFocusOut = true;

  if (options.rightButtons) {
    quickPick.buttons = options.rightButtons;
  }
  if (options.enableBackButton) {
    quickPick.buttons = [vscode.QuickInputButtons.Back, ...(quickPick.buttons || [])];
  }

  const show = (): Promise<ActionableResult<T>> =>
    new Promise<ActionableResult<T>>((resolve, reject) => {
      const exec = async (f: () => Promise<unknown>): Promise<void> => {
        try {
          await f();
        } catch (e) {
          reject(e);
        } finally {
          quickPick.dispose();
        }
      };
      quickPick.onDidChangeSelection(async (selectedItems) => {
        exec(async () => {
          if (selectedItems.length !== 1) {
            return resolve(undefined);
          }
          const result = selectedItems[0].action();
          resolve(result);
        });
      });
      quickPick.onDidTriggerButton(async (button: ActionableButton<T>) => {
        exec(async () => {
          if (button === vscode.QuickInputButtons.Back) {
            resolve(undefined);
          }
          resolve(await button.action());
        });
      });

      quickPick.show();
      if (options.selectItemIdx >= 0 && options.selectItemIdx < items.length) {
        quickPick.selectedItems = [items[options.selectItemIdx]];
      }
    });

  return show();
};

export interface InputBoxOptions<T> extends AllowBackButton {
  title?: string;
  prompt?: string;
  value?: string;
  rightButtons?: ActionableButton<T>[];
}
type InputReturnType<T> = T | string | undefined;
/**
 *
 * @param title
 * @param value
 * @param options
 * @returns string if "enter", undefined if "ESC" or backButton click
 */
export const showInputBox = <T = WizardStatus>(
  options?: InputBoxOptions<T>
): Promise<InputReturnType<T>> => {
  const inputBox = vscode.window.createInputBox();
  inputBox.title = options.title;
  inputBox.value = options.value;
  inputBox.prompt = options.prompt;
  inputBox.ignoreFocusOut = true;
  inputBox.buttons = options.rightButtons || [];
  if (options.enableBackButton) {
    inputBox.buttons = [vscode.QuickInputButtons.Back, ...inputBox.buttons];
  }

  let done = false;
  const show = (): Promise<InputReturnType<T>> =>
    new Promise<InputReturnType<T>>((resolve, reject) => {
      const exec = async (f: () => unknown): Promise<void> => {
        try {
          await f();
        } catch (e) {
          reject(e);
        } finally {
          inputBox.dispose();
        }
      };
      inputBox.onDidAccept(() => {
        exec(() => {
          if (done) {
            return;
          }
          const value = inputBox.value;
          done = true;
          resolve(value);
        });
      });
      inputBox.onDidHide(() => {
        exec(() => {
          if (done) {
            return;
          }
          done = true;
          resolve(undefined);
        });
      });
      inputBox.onDidTriggerButton(async (button: ActionableButton<T>) => {
        exec(async () => {
          done = true;

          if (button === vscode.QuickInputButtons.Back) {
            resolve(undefined);
          }
          resolve(await button.action());
        });
      });

      inputBox.show();
    });

  return show();
};

export const showActionMessage = async <T = WizardStatus>(
  type: ActionMessageType,
  message: string,
  ...buttons: ActionableMessageItem<T>[]
): Promise<ActionableResult<T>> => {
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
  return await button?.action();
};

export const getConfirmation = async (
  type: ActionMessageType,
  msg: string,
  yesTitle = 'Yes',
  noTitle = 'No',
  onCancel: 'yes' | 'no' = 'no'
): Promise<boolean> =>
  await showActionMessage(
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

export const DEBUG_CONFIG_PLATFORMS = ['windows', 'linux', 'osx'];

const getRuntimeExecutable = (
  cmd: string,
  args: string[]
): Partial<vscode.DebugConfiguration | undefined> => {
  const commonConfig = {
    program: undefined,
  };
  if (cmd === 'npm') {
    const extraArgs = args.includes('--') ? [] : ['--'];
    return { runtimeExecutable: 'npm', args: extraArgs, ...commonConfig };
  }
  if (cmd === 'yarn') {
    return { runtimeExecutable: 'yarn', args: [], ...commonConfig };
  }
};

// regex to match surrounding quotes and escape characters
const cmdQuotesRegex = /^["'\\]+|["'\\]+$/g;
export const cleanupCommand = (command: string): string => command.replace(cmdQuotesRegex, '');

// regex that match single, double quotes and "\" escape char"
const cmdSplitRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s'"]+)/g;
export const parseCmdLine = (cmdLine: string): string[] => {
  const parts = cmdLine.match(cmdSplitRegex) || [];
  // clean up command
  if (parts.length > 0) {
    parts[0] = cleanupCommand(parts[0]);
  }
  return parts;
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
 * create new debug config by merging the given command line and root-path accordingly.
 * @param config
 * @param cmdLine t
 * @param absoluteRootPath if given, will be used as "cwd" of the debug config. If the commandLine uses relative path, it will be converted to
 * absolute path based on this root path; otherwise it will be converted relative to the "${workspaceFolder}"
 * @param preservePlatformSections
 */
export const mergeDebugConfigWithCmdLine = (
  config: vscode.DebugConfiguration,
  cmdLine: string,
  absoluteRootPath?: string,
  preservePlatformSections = false
): vscode.DebugConfiguration => {
  const [cmd, ...cmdArgs] = parseCmdLine(cmdLine);
  if (!cmd) {
    throw new Error(`invalid cmdLine: ${cmdLine}`);
  }

  let finalConfig;

  const { cwd, args: configArgs, ...restConfig } = config;
  const _cwd = absoluteRootPath ? absoluteRootPath : cwd;

  const rteConfig = getRuntimeExecutable(cmd, cmdArgs);
  if (rteConfig) {
    const { args: rteConfigArgs = [], ...restRteConfig } = rteConfig;
    finalConfig = {
      ...restConfig,
      cwd: _cwd,
      ...restRteConfig,
      args: [...cmdArgs, ...rteConfigArgs, ...configArgs],
    };
  } else {
    // convert the cmd to absolute path
    const p = path.isAbsolute(cmd)
      ? cmd
      : path.join(...[absoluteRootPath ? absoluteRootPath : '${workspaceFolder}', cmd]);
    finalConfig = { ...restConfig, cwd: _cwd, program: p, args: [...cmdArgs, ...configArgs] };
  }

  if (!preservePlatformSections) {
    DEBUG_CONFIG_PLATFORMS.forEach((p) => delete finalConfig[p]);
  }
  return finalConfig;
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
      const rootPath = cleanupCommand(value);
      wsSettings['absoluteRootPath'] = path.normalize(
        path.isAbsolute(rootPath) ? rootPath : path.join(workspace.uri.fsPath, rootPath)
      );
    }
  });

  // populate debug config settings
  const value = vscode.workspace
    .getConfiguration('launch', workspace.uri)
    .get<vscode.DebugConfiguration[]>('configurations');
  if (value) {
    wsSettings['configurations'] = value;
  }
  return wsSettings;
};

export const createSaveConfig = (context: WizardContext) => (
  ...entries: ConfigEntry[]
): Promise<void> => {
  const { workspace, message } = context;
  const config = vscode.workspace.getConfiguration(undefined, workspace.uri);

  const promises = entries.map((e) => {
    message(`Updating "${e.name}" in vscode`);
    return config.update(e.name, e.value, vscode.ConfigurationTarget.WorkspaceFolder);
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
