jest.unmock('../src/helpers');
jest.unmock('../src/Settings');
jest.unmock('./test-helper');

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

const mockPlatform = jest.fn();
jest.mock('os', () => ({ platform: mockPlatform }));

import { resolve } from 'path';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

import {
  isCreateReactAppTestCommand,
  nodeBinExtension,
  cleanAnsi,
  prepareIconFile,
  testIdString,
  escapeRegExp,
  removeSurroundingQuote,
  toFilePath,
  toLowerCaseDriveLetter,
  toUpperCaseDriveLetter,
  shellQuote,
  toErrorString,
  getPackageJson,
  getTestCommand,
  getDefaultJestCommand,
  parseCmdLine,
  toAbsoluteRootPath,
} from '../src/helpers';
import * as helper from '../src/helpers';
import { makeUri, makeWorkspaceFolder } from './test-helper';

// Manually (forcefully) set the executable's file extension to test its addition independendly of the operating system.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
(nodeBinExtension as string) = '.TEST';

describe('ModuleHelpers', () => {
  describe('nodeBinExtension', () => {
    // Since `nodeBinExtension` is a variable, we have to reload the module in order to re-evaluate it.
    it('should return an empty string on Linux', () => {
      jest.resetModules();
      mockPlatform.mockReturnValueOnce('linux');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(require('../src/helpers').nodeBinExtension).toBe('');
    });

    it('should equal ".cmd" on Windows', () => {
      jest.resetModules();
      mockPlatform.mockReturnValueOnce('win32');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(require('../src/helpers').nodeBinExtension).toBe('.cmd');
    });
  });

  describe('isCreateReactAppTestCommand', () => {
    it('should return true for CRA', () => {
      expect(isCreateReactAppTestCommand('react-scripts test --env=jsdom')).toBe(true);
    });

    it('should return true for CRA with cross-env', () => {
      expect(isCreateReactAppTestCommand('cross-env CI=true react-scripts test --env=jsdom')).toBe(
        true
      );
    });

    it('should return false for other scripts', () => {
      expect(isCreateReactAppTestCommand(undefined)).toBe(false);
      expect(isCreateReactAppTestCommand('custom-script')).toBe(false);
    });

    it('should return false for other scripts with cross-env', () => {
      expect(isCreateReactAppTestCommand('cross-env CI=true custom-script')).toBe(false);
    });
  });

  describe('cleanAnsi', () => {
    it('removes ANSI characters from string', () => {
      const ansiString =
        '\u001b[36m<body>\u001b[39m \u001b[36m<div>\u001b[39m \u001b[36m<div\u001b[39m \u001b[33mclass\u001b[39m=\u001b[32m"root"\u001b[39m \u001b[36m>\u001b[39m \u001b[0mLearn React\u001b[0m \u001b[36m</div>\u001b[39m \u001b[36m</div>\u001b[39m\u001b[36m</body>\u001b[39m';

      expect(cleanAnsi(ansiString)).toBe(
        '<body> <div> <div class="root" > Learn React </div> </div></body>'
      );
    });
  });

  describe('prepareIconFile', () => {
    const context = {
      asAbsolutePath: (name: string) => name,
    } as vscode.ExtensionContext;

    beforeEach(() => {
      jest.resetAllMocks();
      (mockReadFileSync as jest.Mock).mockReturnValue(Buffer.from(''));
      (mockExistsSync as jest.Mock).mockReturnValue(true);
    });

    it('is creating icon file from source file if it does not exist', () => {
      (mockExistsSync as jest.Mock).mockReturnValue(false);

      prepareIconFile(context, 'state', '<svg />');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join('generated-icons', 'state.svg'),
        '<svg />'
      );
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('does not write file if it exists and is the same', () => {
      (mockReadFileSync as jest.Mock).mockReturnValue(Buffer.from('<svg />'));

      prepareIconFile(context, 'state', '<svg />');
      expect(mockWriteFileSync).toHaveBeenCalledTimes(0);
    });

    it('can replace fill color', () => {
      (mockReadFileSync as jest.Mock).mockReturnValue(
        Buffer.from('<svg fill="currentColor"></svg>')
      );
      (mockExistsSync as jest.Mock).mockReturnValue(false);

      prepareIconFile(context, 'default', '<svg fill="currentColor"></svg>');
      expect((mockWriteFileSync as jest.Mock).mock.calls[0][1]).toBe(
        '<svg fill="currentColor"></svg>'
      );

      prepareIconFile(context, 'gray', '<svg fill="currentColor"></svg>', '#8C8C8C');
      expect((mockWriteFileSync as jest.Mock).mock.calls[1][1]).toBe('<svg fill="#8C8C8C"></svg>');

      prepareIconFile(context, 'red', '<svg fill="currentColor"></svg>', 'red');
      expect((mockWriteFileSync as jest.Mock).mock.calls[2][1]).toBe('<svg fill="red"></svg>');
    });
  });
});

describe('escapeRegExp', () => {
  it.each`
    str                    | expected
    ${'no special char'}   | ${'no special char'}
    ${'with (a)'}          | ${'with \\(a\\)'}
    ${'with {} and $sign'} | ${'with \\{\\} and \\$sign'}
    ${'with []'}           | ${'with \\[\\]'}
  `('escapeRegExp: $str', ({ str, expected }) => {
    expect(escapeRegExp(str)).toEqual(expected);
  });
});
describe('testIdString', () => {
  it.each`
    type                 | id                                                            | expected
    ${'display'}         | ${{ title: 'test', ancestorTitles: [] }}                      | ${'test'}
    ${'display-reverse'} | ${{ title: 'test', ancestorTitles: [] }}                      | ${'test'}
    ${'full-name'}       | ${{ title: 'test', ancestorTitles: [] }}                      | ${'test'}
    ${'display'}         | ${{ title: 'regexp (a) $x/y', ancestorTitles: [] }}           | ${'regexp (a) $x/y'}
    ${'display-reverse'} | ${{ title: 'regexp (a) $x/y', ancestorTitles: [] }}           | ${'regexp (a) $x/y'}
    ${'full-name'}       | ${{ title: 'regexp (a) $x/y', ancestorTitles: [] }}           | ${'regexp (a) $x/y'}
    ${'display'}         | ${{ title: 'test', ancestorTitles: ['d-1', 'd-1-1'] }}        | ${'d-1 > d-1-1 > test'}
    ${'display-reverse'} | ${{ title: 'test', ancestorTitles: ['d-1', 'd-1-1'] }}        | ${'test < d-1-1 < d-1'}
    ${'full-name'}       | ${{ title: 'test', ancestorTitles: ['d-1', 'd-1-1'] }}        | ${'d-1 d-1-1 test'}
    ${'full-name'}       | ${{ title: 'regexp ($a)', ancestorTitles: ['d-1', 'd-1-1'] }} | ${'d-1 d-1-1 regexp ($a)'}
  `('$type: $expected', ({ type, id, expected }) => {
    expect(testIdString(type, id)).toEqual(expected);
  });
});

describe('removeSurroundingQuote', () => {
  it.each`
    str                          | expected
    ${'no quote'}                | ${'no quote'}
    ${'"double quote"'}          | ${'double quote'}
    ${"'single quote'"}          | ${'single quote'}
    ${"''single single quote''"} | ${"'single single quote'"}
  `('can remove surrounding quotes from $str', ({ str, expected }) => {
    expect(removeSurroundingQuote(str)).toEqual(expected);
  });
});

describe('toFilePath', () => {
  it.each`
    path                | expected
    ${'/a/b/c'}         | ${'/a/b/c'}
    ${'C:/a/b/c.js'}    | ${'C:/a/b/c.js'}
    ${'c:/a/b/c.js'}    | ${'c:/a/b/c.js'}
    ${'z:\\a\\b\\c.js'} | ${'Z:\\a\\b\\c.js'}
    ${'\\a\\b\\c.js'}   | ${'\\a\\b\\c.js'}
    ${''}               | ${''}
  `('escape $path => $expected', ({ path, expected }) => {
    expect(toFilePath(path)).toEqual(expected);
  });
});

describe('toLowerCaseDriveLetter', () => {
  it.each`
    filePath                | expected
    ${'C:\\path\\file.ext'} | ${'c:\\path\\file.ext'}
    ${'c:\\path\\file.ext'} | ${undefined}
    ${'c:/path/file.ext'}   | ${undefined}
    ${'/path/file.ext'}     | ${undefined}
  `('$filePath => $expected', ({ filePath, expected }) => {
    expect(toLowerCaseDriveLetter(filePath)).toBe(expected);
  });
});

describe('toUpperCaseDriveLetter', () => {
  it.each`
    filePath                | expected
    ${'C:\\path\\file.ext'} | ${undefined}
    ${'c:\\path\\file.ext'} | ${'C:\\path\\file.ext'}
    ${'c:/path/file.ext'}   | ${undefined}
    ${'/path/file.ext'}     | ${undefined}
  `('$filePath => $expected', ({ filePath, expected }) => {
    expect(toUpperCaseDriveLetter(filePath)).toBe(expected);
  });
});

describe('shellQuote', () => {
  it.each`
    platform    | shell                                     | str                      | expected
    ${'win32'}  | ${undefined}                              | ${'plain text'}          | ${'"plain text"'}
    ${'linux'}  | ${undefined}                              | ${'plain text'}          | ${'plain\\ text'}
    ${'win32'}  | ${'powershell'}                           | ${"with 'single quote'"} | ${"'with ''single quote'''"}
    ${'win32'}  | ${'cmd.exe'}                              | ${"with 'single quote'"} | ${'"with \'single quote\'"'}
    ${'linux'}  | ${'/bin/bash'}                            | ${"with 'single quote'"} | ${"with\\ \\'single\\ quote\\'"}
    ${'darwin'} | ${'/bin/zsh'}                             | ${"with 'single quote'"} | ${"with\\ \\'single\\ quote\\'"}
    ${'darwin'} | ${{ path: '/bin/zsh', args: ['-l'] }}     | ${"with 'single quote'"} | ${"with\\ \\'single\\ quote\\'"}
    ${'win32'}  | ${undefined}                              | ${"with 'single quote'"} | ${'"with \'single quote\'"'}
    ${'linux'}  | ${undefined}                              | ${"with 'single quote'"} | ${"with\\ \\'single\\ quote\\'"}
    ${'win32'}  | ${'powershell'}                           | ${'with "double quote"'} | ${'\'with ""double quote""\''}
    ${'win32'}  | ${'cmd.exe'}                              | ${'with "double quote"'} | ${'"with ""double quote"""'}
    ${'linux'}  | ${'bash'}                                 | ${'with "double quote"'} | ${'with\\ \\"double\\ quote\\"'}
    ${'win32'}  | ${'powershell'}                           | ${'with $name.txt'}      | ${"'with $name.txt'"}
    ${'win32'}  | ${'cmd.exe'}                              | ${'with $name.txt'}      | ${'"with $name.txt"'}
    ${'linux'}  | ${'bash'}                                 | ${'with $name.txt'}      | ${'with\\ \\$name.txt'}
    ${'win32'}  | ${'powershell'}                           | ${'with \\$name\\.txt'}  | ${"'with \\$name\\.txt'"}
    ${'win32'}  | ${'cmd.exe'}                              | ${'with \\$name\\.txt'}  | ${'"with \\$name\\.txt"'}
    ${'linux'}  | ${'bash'}                                 | ${'with \\$name\\.txt'}  | ${'with\\ \\\\\\$name\\\\.txt'}
    ${'linux'}  | ${{ path: '/bin/sh', args: ['--login'] }} | ${'with \\$name\\.txt'}  | ${'with\\ \\\\\\$name\\\\.txt'}
    ${'win32'}  | ${'powershell'}                           | ${''}                    | ${"''"}
    ${'win32'}  | ${undefined}                              | ${''}                    | ${'""'}
    ${'darwin'} | ${undefined}                              | ${''}                    | ${'""'}
    ${'win32'}  | ${'powershell'}                           | ${'with \\ and \\\\'}    | ${"'with \\ and \\\\\\\\'"}
    ${'win32'}  | ${undefined}                              | ${'with \\ and \\\\'}    | ${'"with \\ and \\\\\\\\"'}
    ${'linux'}  | ${undefined}                              | ${'with \\ and \\\\'}    | ${'with\\ \\\\\\ and\\ \\\\\\\\'}
    ${'win32'}  | ${'powershell'}                           | ${'something\\'}         | ${"'something\\'"}
    ${'win32'}  | ${undefined}                              | ${'something\\'}         | ${'something\\'}
    ${'darwin'} | ${undefined}                              | ${'something\\'}         | ${'something\\\\'}
    ${'win32'}  | ${'powershell'}                           | ${'with `backtick'}      | ${"'with `backtick'"}
    ${'win32'}  | ${undefined}                              | ${'with `backtick'}      | ${'"with `backtick"'}
    ${'darwin'} | ${undefined}                              | ${'with `backtick'}      | ${'with\\ \\`backtick'}
  `('can quote "$str" for $shell on $platform', ({ platform, shell, str, expected }) => {
    jest.resetAllMocks();
    mockPlatform.mockReturnValueOnce(platform);
    expect(shellQuote(str, shell)).toEqual(expected);
  });
});
it.each`
  name                  | e                                 | matchString
  ${'undefined'}        | ${undefined}                      | ${undefined}
  ${'string'}           | ${'regular error'}                | ${undefined}
  ${'an Error object'}  | ${new Error('test error')}        | ${'Error: test error'}
  ${'arbitrary object'} | ${{ text: 'anything', value: 1 }} | ${undefined}
`('toErrorString: $name', ({ e, matchString }) => {
  if (matchString) {
    expect(toErrorString(e)).toEqual(expect.stringContaining(matchString));
  } else {
    expect(toErrorString(e)).toMatchSnapshot();
  }
});
describe('get info from Package.json', () => {
  const packageWithTest = {
    scripts: {
      test: 'react-scripts test',
    },
  };

  describe('getPackageJson', () => {
    it('can read package.json from file system', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(packageWithTest));
      expect(getPackageJson('root')).toEqual(packageWithTest);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        resolve('root', 'package.json'),
        expect.anything()
      );
    });
    it('if package.json does not exist, return undefined', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('does not exist');
      });
      expect(getPackageJson('root')).toBeUndefined();
    });
  });
  describe('getTestCommand', () => {
    it('can get test script from package.json', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(packageWithTest));
      expect(getTestCommand('root')).toEqual(packageWithTest.scripts.test);
    });
    it.each`
      case                      | impl
      ${'no package.json'} | ${() => {
  throw new Error('does not exist');
}}
      ${'no scripts'}           | ${() => ({})}
      ${'invalid package.json'} | ${() => 'invalid package.json'}
    `('if error, returns undefined: $case', ({ impl }) => {
      mockReadFileSync.mockImplementation(impl);
      expect(getTestCommand('root')).toBeUndefined();
    });
  });
});

describe('getDefaultJestCommand', () => {
  it.each`
    case | packageTestScript                   | pmLockFile             | binary                    | expected
    ${1} | ${'react-scripts test'}             | ${'yarn.lock'}         | ${'react-scripts'}        | ${'yarn test'}
    ${2} | ${'react-scripts test'}             | ${'package-lock.json'} | ${'react-scripts'}        | ${'npm test --'}
    ${3} | ${'some other test'}                | ${'yarn.lock'}         | ${'jest'}                 | ${'binary'}
    ${4} | ${'some other test'}                | ${'package-lock.json'} | ${'react-native-scripts'} | ${'npm test --'}
    ${5} | ${'some other test'}                | ${'package-lock.json'} | ${undefined}              | ${undefined}
    ${6} | ${'jest'}                           | ${'package-lock.json'} | ${undefined}              | ${'npm test --'}
    ${7} | ${undefined}                        | ${'package-lock.json'} | ${'jest'}                 | ${'binary'}
    ${8} | ${'something with jest --someFlag'} | ${undefined}           | ${'jest'}                 | ${'npm test --'}
  `('case $case => $expected', ({ packageTestScript, pmLockFile, binary, expected }) => {
    const packageFile = {
      scripts: {
        test: packageTestScript,
      },
    };
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(packageFile));

    const binaryFile = `${binary}.TEST`;
    mockExistsSync.mockImplementation((p) => p.endsWith(pmLockFile) || p.endsWith(binaryFile));

    const defaultCmd = getDefaultJestCommand();
    if (expected === 'binary') {
      const pattern = new RegExp(`${binaryFile}"$`);
      expect(defaultCmd).toMatch(pattern);
    } else {
      expect(defaultCmd).toEqual(expected);
    }
  });
});

describe('plateform specific tests', () => {
  const canRunTest = (isWin32: boolean) =>
    (isWin32 && os.platform() === 'win32') || (!isWin32 && os.platform() !== 'win32');

  beforeAll(() => {
    mockPlatform.mockImplementation(jest.requireActual('os').platform);
  });

  describe('parseCmdLine', () => {
    it.each`
      isWin32  | cmdLine                                                       | expected
      ${false} | ${'jest'}                                                     | ${{ cmd: 'jest', args: [], program: '${workspaceFolder}/jest' }}
      ${false} | ${'./node_modules/.bin/jest'}                                 | ${{ cmd: 'node_modules/.bin/jest', args: [], program: '${workspaceFolder}/node_modules/.bin/jest' }}
      ${false} | ${'./node_modules/.bin/..//jest'}                             | ${{ cmd: 'node_modules/jest', args: [], program: '${workspaceFolder}/node_modules/jest' }}
      ${false} | ${'../jest --config ../jest-config.json'}                     | ${{ cmd: '../jest', args: ['--config', '../jest-config.json'], program: '${workspaceFolder}/../jest' }}
      ${false} | ${'../jest --config "../jest-config.json"'}                   | ${{ cmd: '../jest', args: ['--config', '"../jest-config.json"'], program: '${workspaceFolder}/../jest' }}
      ${false} | ${'../jest --config=../jest-config.json'}                     | ${{ cmd: '../jest', args: ['--config=../jest-config.json'], program: '${workspaceFolder}/../jest' }}
      ${false} | ${'../jest --config="../jest-config.json"'}                   | ${{ cmd: '../jest', args: ['--config=', '"../jest-config.json"'], program: '${workspaceFolder}/../jest' }}
      ${false} | ${'../jest --config "a dir/jest-config.json" --coverage'}     | ${{ cmd: '../jest', args: ['--config', '"a dir/jest-config.json"', '--coverage'], program: '${workspaceFolder}/../jest' }}
      ${false} | ${'jest --config "../dir with space/jest-config.json"'}       | ${{ cmd: 'jest', args: ['--config', '"../dir with space/jest-config.json"'], program: '${workspaceFolder}/jest' }}
      ${false} | ${'/absolute/jest --runInBand'}                               | ${{ cmd: '/absolute/jest', args: ['--runInBand'], program: '/absolute/jest' }}
      ${false} | ${'"dir with space/jest" --arg1=1 --arg2 2 "some string"'}    | ${{ cmd: 'dir with space/jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '${workspaceFolder}/dir with space/jest' }}
      ${false} | ${'"/dir with space/jest" --arg1=1 --arg2 2 "some string"'}   | ${{ cmd: '/dir with space/jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '/dir with space/jest' }}
      ${false} | ${"'/dir with space/jest' --arg1=1 --arg2 2 'some string'"}   | ${{ cmd: '/dir with space/jest', args: ['--arg1=1', '--arg2', '2', "'some string'"], program: '/dir with space/jest' }}
      ${false} | ${'jest --arg1 "escaped \\"this\\" string" --arg2 2'}         | ${{ cmd: 'jest', args: ['--arg1', '"escaped \\"this\\" string"', '--arg2', '2'], program: '${workspaceFolder}/jest' }}
      ${true}  | ${'.\\node_modules\\.bin\\jest'}                              | ${{ cmd: 'node_modules\\.bin\\jest', args: [], program: '${workspaceFolder}\\node_modules\\.bin\\jest' }}
      ${true}  | ${'..\\jest --config="..\\jest-config.json"'}                 | ${{ cmd: '..\\jest', args: ['--config=', '"..\\jest-config.json"'], program: '${workspaceFolder}\\..\\jest' }}
      ${true}  | ${'jest --config "..\\dir with space\\jest-config.json"'}     | ${{ cmd: 'jest', args: ['--config', '"..\\dir with space\\jest-config.json"'], program: '${workspaceFolder}\\jest' }}
      ${true}  | ${'\\absolute\\jest --runInBand'}                             | ${{ cmd: '\\absolute\\jest', args: ['--runInBand'], program: '\\absolute\\jest' }}
      ${true}  | ${'"\\dir with space\\jest" --arg1=1 --arg2 2 "some string"'} | ${{ cmd: '\\dir with space\\jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '\\dir with space\\jest' }}
      ${true}  | ${'c:\\jest --arg1 "escaped \\"this\\" string" --arg2 2'}     | ${{ cmd: 'c:\\jest', args: ['--arg1', '"escaped \\"this\\" string"', '--arg2', '2'], program: 'c:\\jest' }}
    `('$cmdLine', ({ cmdLine, expected, isWin32 }) => {
      if (!canRunTest(isWin32)) {
        return;
      }
      const [actualCmd, ...actualArgs] = parseCmdLine(cmdLine);
      expect(actualCmd).toEqual(expected.cmd);
      expect(actualArgs).toEqual(expected.args);
    });
    describe('will remove surrounding quotes', () => {
      it.each`
        command                                      | expected
        ${'cleanCmd'}                                | ${'cleanCmd'}
        ${'"with double quote"'}                     | ${'with double quote'}
        ${"'with single quote'"}                     | ${'with single quote'}
        ${'"with quotes "in the middle" is fine"'}   | ${'with quotes "in the middle" is fine'}
        ${"'with quotes 'in the middle' is fine'"}   | ${"with quotes 'in the middle' is fine"}
        ${'with quotes "in the middle" is fine'}     | ${'with quotes "in the middle" is fine'}
        ${'with escape "in the \'middle\'" is fine'} | ${'with escape "in the \'middle\'" is fine'}
        ${'with escape "in the "middle"" is fine'}   | ${'with escape "in the "middle"" is fine'}
        ${"'c:\\quoted root\\window\\command'"}      | ${'c:\\quoted root\\window\\command'}
        ${"'\\quoted root\\window\\command'"}        | ${'\\quoted root\\window\\command'}
      `(
        'uses cleanupCommand to remove surrouding quotes for command: $command',
        ({ command, expected }) => {
          expect(removeSurroundingQuote(command)).toEqual(expected);
        }
      );
    });
  });
});
describe('toAbsoluteRootPath', () => {
  const ws = makeWorkspaceFolder('ws1');
  ws.uri.fsPath = path.join(path.sep, 'ws1');

  it.each`
    case | rootPath                         | expected
    ${1} | ${''}                            | ${ws.uri.fsPath}
    ${2} | ${'folder'}                      | ${path.resolve(ws.uri.fsPath, 'folder')}
    ${3} | ${path.join(path.sep, 'folder')} | ${path.join(path.sep, 'folder')}
  `('case $case', ({ rootPath, expected }) => {
    expect(toAbsoluteRootPath(ws, rootPath)).toEqual(expected);
  });
});

describe('getValidJestCommand', () => {
  const workspace = makeWorkspaceFolder('test-folder');
  const ws1 = makeUri('', 'test-folder', 'w1', 'child');
  const ws2 = makeUri('', 'test-folder', 'w2');
  const mockWorkspaceManager: any = {
    getFoldersFromFilesystem: jest.fn(),
  };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it.each`
    case                     | defaultJestCommands              | uris          | validSettings
    ${'valid default'}       | ${['jest']}                      | ${undefined}  | ${[{ jestCommandLine: 'jest', rootPath: workspace.uri.fsPath }]}
    ${'valid workspace'}     | ${[undefined, 'jest2']}          | ${[ws1]}      | ${[{ rootPath: ws1.fsPath, jestCommandLine: 'jest2' }]}
    ${'same rootPath'}       | ${[undefined, undefined]}        | ${[ws2]}      | ${undefined}
    ${'no workspace'}        | ${[undefined]}                   | ${[]}         | ${undefined}
    ${'multiple workspaces'} | ${[undefined, 'jest1', 'jest2']} | ${[ws1, ws2]} | ${[{ rootPath: ws1.fsPath, jestCommandLine: 'jest1' }, { rootPath: ws2.fsPath, jestCommandLine: 'jest2' }]}
  `('$case', async ({ defaultJestCommands, uris, validSettings }) => {
    const defaultJestCommandSpy = jest.spyOn(helper, 'getDefaultJestCommand');
    defaultJestCommands.forEach((cmd) => {
      defaultJestCommandSpy.mockReturnValueOnce(cmd);
    });

    mockWorkspaceManager.getFoldersFromFilesystem.mockReturnValue(Promise.resolve(uris));

    const result = await helper.getValidJestCommand(workspace, mockWorkspaceManager);
    expect(result.uris).toEqual(uris);
    if (!validSettings) {
      expect(result.validSettings).toHaveLength(0);
    } else {
      expect(result.validSettings).toHaveLength(validSettings.length);
      validSettings.forEach((setting) => expect(result.validSettings).toContainEqual(setting));
    }
  });

  it('when root has no jest but the sub folder did', async () => {
    (vscode.workspace as any).workspaceFolders = [makeWorkspaceFolder('whatever')];
    mockWorkspaceManager.getFoldersFromFilesystem.mockReturnValue(Promise.resolve([ws1, ws2]));

    const defaultJestCommandSpy = jest.spyOn(helper, 'getDefaultJestCommand');
    defaultJestCommandSpy.mockReturnValueOnce(undefined).mockReturnValueOnce('should be ws2');

    const result = await helper.getValidJestCommand(workspace, mockWorkspaceManager, ws1.fsPath);
    expect(defaultJestCommandSpy).toHaveBeenCalledTimes(2);

    expect(result.validSettings).toEqual([
      { rootPath: ws2.fsPath, jestCommandLine: 'should be ws2' },
    ]);
  });
});
