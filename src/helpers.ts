import {workspace} from 'vscode';
import {platform} from 'os';
import {existsSync} from 'fs';

/**
 *  Handles getting the jest runner, handling the OS and project specific work too
 * 
 * @returns {string}
 */
export function pathToJest(): string {
  const jestSettings: any = workspace.getConfiguration("jest");
  var path: string = jestSettings.pathToJest;

  const defaultPath = "node_modules/.bin/jest"; 
  if (path === defaultPath) {
    const defaultCreateReactPath = "node_modules/react-scripts/node_modules/.bin/jest";
    const defaultCreateReactPathWindows = "node_modules/react-scripts/node_modules/.bin/jest.cmd";
    const createReactPath = (platform() === "win32") ? defaultCreateReactPathWindows : defaultCreateReactPath;
    const absolutePath = workspace.rootPath + "/" + createReactPath;
    if (!existsSync(path) && existsSync(absolutePath)) {
      // If it's the default, run the script instead
      return "npm test --";
    }
  }


  // For windows support, see https://github.com/orta/vscode-jest/issues/10
  if (!path.includes(".cmd") && platform() === "win32") { return path + ".cmd";  }
  return path;
}