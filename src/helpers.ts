import { platform } from 'os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { normalize, join } from 'path';
import { ExtensionContext } from 'vscode';

import { PluginResourceSettings, hasUserSetPathToJest } from './Settings';
import { TestIdentifier } from './TestResults';
import { TestStats } from './types';
import { LoginShell } from 'jest-editor-support';

/**
 * Known binary names of `react-scripts` forks
 */
const createReactAppBinaryNames = [
  'react-scripts',
  'react-native-scripts',
  'react-scripts-ts',
  'react-app-rewired',
];

/**
 * File extension for npm binaries
 */
export const nodeBinExtension: string = platform() === 'win32' ? '.cmd' : '';

/**
 * Resolves the location of an npm binary
 *
 * Returns the path if it exists, or `undefined` otherwise
 */
function getLocalPathForExecutable(rootPath: string, executable: string): string | undefined {
  const absolutePath = normalize(
    join(rootPath, 'node_modules', '.bin', executable + nodeBinExtension)
  );
  return existsSync(absolutePath) ? absolutePath : undefined;
}

/**
 * Tries to read the test command from the scripts section within `package.json`
 *
 * Returns the test command in case of success,
 * `undefined` if there was an exception while reading and parsing `package.json`
 * `null` if there is no test script
 */
export function getTestCommand(rootPath: string): string | undefined | null {
  try {
    const packageJSON = getPackageJson(rootPath);
    if (packageJSON && packageJSON.scripts && packageJSON.scripts.test) {
      return packageJSON.scripts.test;
    }
    return null;
  } catch {
    return undefined;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPackageJson(rootPath: string): any | undefined {
  try {
    const packagePath = join(rootPath, 'package.json');
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Checks if the supplied test command could have been generated by create-react-app
 */
export function isCreateReactAppTestCommand(testCommand?: string | null): boolean {
  return (
    !!testCommand &&
    createReactAppBinaryNames.some((binary) => testCommand.includes(`${binary} test`))
  );
}

/**
 * Checks if the project in `rootPath` was bootstrapped by `create-react-app`.
 */
function isBootstrappedWithCreateReactApp(rootPath: string): boolean {
  const testCommand = getTestCommand(rootPath);
  if (testCommand === undefined) {
    // In case parsing `package.json` failed or was unconclusive,
    // fallback to checking for the presence of the binaries in `./node_modules/.bin`
    return createReactAppBinaryNames.some(
      (binary) => getLocalPathForExecutable(rootPath, binary) !== undefined
    );
  }
  return isCreateReactAppTestCommand(testCommand);
}

/**
 * Handles getting the jest runner, handling the OS and project specific work too
 *
 * @returns {string}
 */
// tslint:disable-next-line no-shadowed-variable
export function pathToJest({ pathToJest, rootPath }: PluginResourceSettings): string {
  if (pathToJest && hasUserSetPathToJest(pathToJest)) {
    return normalize(pathToJest);
  }

  if (isBootstrappedWithCreateReactApp(rootPath)) {
    return 'npm test --';
  }

  const p = getLocalPathForExecutable(rootPath, 'jest') || 'jest' + nodeBinExtension;
  return `"${p}"`;
}

/**
 * Handles getting the path to config file
 *
 * @returns {string}
 */
export function pathToConfig(pluginSettings: PluginResourceSettings): string {
  if (pluginSettings.pathToConfig) {
    return normalize(pluginSettings.pathToConfig);
  }

  return '';
}

/**
 *  Taken From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * ANSI colors/characters cleaning based on http://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
 */
export function cleanAnsi(str: string): string {
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
}

export type IdStringType = 'display' | 'display-reverse' | 'full-name';
export function testIdString(type: IdStringType, identifier: TestIdentifier): string {
  if (!identifier.ancestorTitles.length) {
    return identifier.title;
  }
  const parts = [...identifier.ancestorTitles, identifier.title];
  switch (type) {
    case 'display':
      return parts.join(' > ');
    case 'display-reverse':
      return parts.reverse().join(' < ');
    case 'full-name':
      return parts.join(' ');
  }
}

/** convert the upper-case drive letter filePath to lower-case. If path does not contain upper-case drive letter, returns undefined. */
// note: this should probably be replaced by vscode.URI.file(filePath).fsPath ...
export function toLowerCaseDriveLetter(filePath: string): string | undefined {
  const match = filePath.match(/^([A-Z]:\\)(.*)$/);
  if (match) {
    return `${match[1].toLowerCase()}${match[2]}`;
  }
}
/** convert the lower-case drive letter filePath (like vscode.URI.fsPath) to lower-case. If path does not contain lower-case drive letter, returns undefined. */
export function toUpperCaseDriveLetter(filePath: string): string | undefined {
  const match = filePath.match(/^([a-z]:\\)(.*)$/);
  if (match) {
    return `${match[1].toUpperCase()}${match[2]}`;
  }
}

/**
 * convert vscode.URI.fsPath to the actual file system file-path, i.e. convert drive letter to upper-case for windows
 * @param filePath
 */
export function toFilePath(filePath: string): string {
  return toUpperCaseDriveLetter(filePath) || filePath;
}

/**
 * Generate path to icon used in decorations
 * NOTE: Should not be called repeatedly for the performance reasons. Cache your results.
 */
export function prepareIconFile(
  context: ExtensionContext,
  iconName: string,
  source: string,
  color?: string
): string {
  const iconsPath = join('generated-icons');

  const resolvePath = (...args: string[]): string => {
    return context.asAbsolutePath(join(...args));
  };

  const resultIconPath = resolvePath(iconsPath, `${iconName}.svg`);
  let result = source.toString();

  if (color) {
    result = result.replace('fill="currentColor"', `fill="${color}"`);
  }

  if (!existsSync(resultIconPath) || readFileSync(resultIconPath).toString() !== result) {
    if (!existsSync(resolvePath(iconsPath))) {
      mkdirSync(resolvePath(iconsPath));
    }

    writeFileSync(resultIconPath, result);
  }

  return resultIconPath;
}

const SurroundingQuoteRegex = /^["']|["']$/g;
export const removeSurroundingQuote = (command: string): string =>
  command.replace(SurroundingQuoteRegex, '');

// TestStats
export const emptyTestStats = (): TestStats => {
  return { success: 0, fail: 0, unknown: 0 };
};

const getShellPath = (shell?: string | LoginShell): string | undefined => {
  if (!shell) {
    return;
  }
  if (typeof shell === 'string') {
    return shell;
  }
  return shell.path;
};
/**
 * quoting a given string for it to be used as shell command arguments.
 *
 * Note: the logic is based on vscode's debug argument handling:
 * https://github.com/microsoft/vscode/blob/c0001d7becf437944f5898a7c9485922d60dd8d3/src/vs/workbench/contrib/debug/node/terminals.ts#L82 .
 * However, had to modify a few places for windows platform.
 *
 **/

export const shellQuote = (str: string, shell?: string | LoginShell): string => {
  const targetShell = getShellPath(shell)?.trim().toLowerCase();

  // try to determine the shell type
  let shellType: 'powershell' | 'cmd' | 'sh';
  if (!targetShell) {
    shellType = platform() === 'win32' ? 'cmd' : 'sh';
  } else if (targetShell.indexOf('powershell') >= 0 || targetShell.indexOf('pwsh') >= 0) {
    shellType = 'powershell';
  } else if (targetShell.indexOf('cmd.exe') >= 0) {
    shellType = 'cmd';
  } else {
    shellType = 'sh';
  }

  switch (shellType) {
    case 'powershell': {
      const s = str.replace(/(['"])/g, '$1$1');
      if (s.length > 2 && s.slice(-2) === '\\\\') {
        return `'${s}\\\\'`;
      }
      return `'${s}'`;
    }

    case 'cmd': {
      let s = str.replace(/"/g, '""');
      if (s.length > 2 && s.slice(-2) === '\\\\') {
        s = `${s}\\\\`;
      }
      return s.indexOf(' ') >= 0 || s.indexOf('"') >= 0 || s.length === 0 ? `"${s}"` : s;
    }

    default: {
      //'sh'
      const s = str.replace(/(["'\\$])/g, '\\$1');
      return s.indexOf(' ') >= 0 || s.indexOf(';') >= 0 || s.length === 0 ? `"${s}"` : s;
    }
  }
};

export const toErrorString = (e: unknown): string => {
  if (e == null) {
    return '';
  }
  if (typeof e === 'string') {
    return e;
  }
  if (e instanceof Error) {
    // return `${e.toString()}\r\n${e.stack}`;
    return e.stack ?? e.toString();
  }
  return JSON.stringify(e);
};
