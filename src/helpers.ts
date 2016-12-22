import { platform } from 'os';
import { existsSync } from 'fs';
import { normalize } from 'path';

import { IPluginSettings } from './IPluginSettings';

/**
 *  Handles getting the jest runner, handling the OS and project specific work too
 * 
 * @returns {string}
 */
export function pathToJest(pluginSettings: IPluginSettings) {
  const path = normalize(pluginSettings.pathToJest);

  const defaultPath = normalize('node_modules/.bin/jest');
  if (path === defaultPath) {
    const defaultCreateReactPath = 'node_modules/react-scripts/node_modules/.bin/jest';
    const defaultCreateReactPathWindows = 'node_modules/react-scripts/node_modules/.bin/jest.cmd';
    const createReactPath = (platform() === 'win32') ? defaultCreateReactPathWindows : defaultCreateReactPath;
    const absolutePath = pluginSettings.rootPath + '/' + createReactPath;
    if (!existsSync(path) && existsSync(absolutePath)) {
      // If it's the default, run the script instead
      return (platform() === 'win32') ? 'npm.cmd test --' : 'npm test --';
    }
  }

  // For windows support, see https://github.com/orta/vscode-jest/issues/10
  if (!path.includes('.cmd') && platform() === 'win32') { return path + '.cmd'; }
  return path;
}

/**
 * Handles getting the path to config file
 *
 * @returns {string}
 */
export function pathToConfig(pluginSettings: IPluginSettings) {

  if (pluginSettings.pathToConfig !== '') {
    return normalize(pluginSettings.pathToConfig);
  }

  return '';
} 
