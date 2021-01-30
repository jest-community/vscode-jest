import * as vscode from 'vscode';

import {
  showActionMessage,
  showActionMenu,
  mergeDebugConfigWithCmdLine,
  jsonOut,
  actionItem,
  getWizardSettings,
  createSaveConfig,
} from '../wizard-helper';
import {
  WizardStatus,
  ActionableMenuItem,
  WizardContext,
  SetupTask,
  WIZARD_HELP_URL,
} from '../types';
import { setupJestCmdLine } from './setup-jest-cmdline';

export const DEBUG_CONFIG_NAME = 'vscode-jest-tests';

export const DebugSetupActionId = {
  acceptExisting: 0,
  edit: 1,
  info: 2,
  create: 3,
  replace: 4,
  setupJestCmdLine: 5,
};

export const setupJestDebug: SetupTask = async (context: WizardContext): Promise<WizardStatus> => {
  const { workspace, message, debugConfigProvider } = context;
  const saveConfig = createSaveConfig(context);
  const settings = getWizardSettings(workspace);

  // check prerequsite
  if (!settings.jestCommandLine) {
    const msg = 'Missing required "jest.jestCommandLine" setting...';
    message(msg);
    const result = await showActionMessage('error', msg, {
      id: DebugSetupActionId.setupJestCmdLine,
      title: 'Setup jestCommandLine',
      action: () => setupJestCmdLine(context),
    });
    if (result === 'success') {
      return setupJestDebug(context);
    }
    return 'abort';
  }
  const launchConfigs = settings.configurations;

  // save config to workspaceFolder launch.json file
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
      message(`existing "${DEBUG_CONFIG_NAME}" config has been renamed to "${renamed}"`);
    }
    message(`a new debug config "${DEBUG_CONFIG_NAME}" has been added in launch.json`);
    return renamed;
  };

  // open launch.json and position to the jest debug config
  const edit = async (): Promise<WizardStatus> => {
    const launchFile = vscode.Uri.joinPath(workspace.uri, '.vscode', 'launch.json');
    const doc = await vscode.workspace.openTextDocument(launchFile);
    const text = doc.getText();
    const offset = text.indexOf(`"${DEBUG_CONFIG_NAME}"`);
    const startPos = doc.positionAt(offset);
    const endPos = new vscode.Position(
      startPos.line,
      startPos.character + DEBUG_CONFIG_NAME.length + 2
    );

    const range = new vscode.Range(startPos, endPos);
    await vscode.window.showTextDocument(doc, { selection: range });
    return 'success';
  };

  const updateConfigWithCmdline = async (
    config: vscode.DebugConfiguration
  ): Promise<WizardStatus> => {
    const finalConfig = mergeDebugConfigWithCmdLine(
      config,
      settings.jestCommandLine,
      settings.absoluteRootPath
    );

    message(
      `debug config has been updated with jestCommandLine=${settings.jestCommandLine}:\n${jsonOut(
        finalConfig
      )}`
    );

    const renamed = await save(finalConfig);

    return showActionMessage(
      'info',
      `${renamed ? `The existing config has been renamed to "${renamed}".\n` : ''}` +
        `A new debug config "${DEBUG_CONFIG_NAME}" has been added in launch.json.\n\n` +
        'Please review and update as needed.',
      {
        id: DebugSetupActionId.info,
        title: 'Ok',
        isCloseAffordance: true,
        action: () => edit(),
      }
    );
  };

  const generateConfig = (): Promise<WizardStatus> => {
    const configs = debugConfigProvider.provideDebugConfigurations(workspace);
    const config = Array.isArray(configs) && configs.find((c) => c.name === DEBUG_CONFIG_NAME);
    if (!config) {
      console.error(`no ${DEBUG_CONFIG_NAME} is generated: configs=`, configs);
      throw new Error(`no ${DEBUG_CONFIG_NAME} is generated`);
    }
    return updateConfigWithCmdline(config);
  };

  const withoutExistingConfig = async (): Promise<WizardStatus> => {
    message(`no debug config with name "${DEBUG_CONFIG_NAME}" was found`);
    const menuItems: ActionableMenuItem[] = [
      actionItem(
        DebugSetupActionId.create,
        '$(add) Generate',
        'generate a jest debug config from jestCommandLine',
        () => {
          message(
            `Generate a jest debug config from the current settings such as jestCommandLine, rootPath.\n\tPlease note, this is a best effort, i.e. manual post-adjustment might be needed\n\tIf encountered any issue, please check out ${WIZARD_HELP_URL}#note-4\n`
          );
          return generateConfig();
        }
      ),
    ];
    return await showActionMenu(menuItems, {
      title: 'Set up Debug Config',
      enableBackButton: true,
      placeholder: 'No existing jest debug config found',
      verbose: context.verbose,
    });
  };
  const withExistingConfig = async (): Promise<WizardStatus> => {
    message(`found existing setting:\n${jsonOut(settings)}\n`);

    const menuItems: ActionableMenuItem[] = [
      actionItem(
        DebugSetupActionId.acceptExisting,
        '$(check) Use current',
        'aceept then current debug config without change',
        () => {
          message('jest debug config did not change');
          return Promise.resolve('success');
        }
      ),
      actionItem(
        DebugSetupActionId.replace,
        '$(refresh) Replace',
        `rename the existing config and generate a new one...`,
        () => generateConfig()
      ),
      actionItem(
        DebugSetupActionId.edit,
        '$(edit) Manual update',
        `Manually edit the debug config...`,
        () => edit()
      ),
    ];
    return await showActionMenu(menuItems, {
      title: 'Set up Debug Config',
      enableBackButton: true,
      placeholder: `Found existing debug config: "${DEBUG_CONFIG_NAME}"`,
      verbose: context.verbose,
    });
  };

  message(`Set up jest debug config for workspace "${workspace.name}"`, 'setupJestDebug');

  const jestDebug = launchConfigs?.find((c) => c.name === DEBUG_CONFIG_NAME);

  return jestDebug ? await withExistingConfig() : await withoutExistingConfig();
};
