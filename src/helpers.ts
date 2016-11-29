import {workspace} from 'vscode';
import {platform} from 'os';

export function pathToJest(): string {
  const jestSettings: any = workspace.getConfiguration("jest");
  const path: string = jestSettings.pathToJest;

  // For windows support, see https://github.com/orta/vscode-jest/issues/10
  if (!path.includes(".bat") && platform() === "win32") {
    return path + ".bat"; 
  }
  return path;
}
