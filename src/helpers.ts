import {workspace} from 'vscode';
import {platform} from 'os';
import {normalize} from 'path';

/**
 *  Handles getting the jest runner, handling the OS specific work too
 * 
 * @returns {string}
 */
export function pathToJest(): string {
  const jestSettings: any = workspace.getConfiguration("jest");
  const path: string = normalize(jestSettings.pathToJest);

  // For windows support, see https://github.com/orta/vscode-jest/issues/10
  if (!path.includes(".cmd") && platform() === "win32") { return path + ".cmd";  }
  return path;
}
