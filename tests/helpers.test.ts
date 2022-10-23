jest.unmock('../src/helpers');
jest.unmock('../src/Settings');

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

const mockJoin = jest.fn();
const mockNormalize = jest.fn();
jest.mock('path', () => ({
  join: mockJoin,
  normalize: mockNormalize,
}));

import * as vscode from 'vscode';
import {
  isCreateReactAppTestCommand,
  pathToJest,
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
} from '../src/helpers';

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

  describe('pathToJest', () => {
    const defaultSettings: any = {
      pathToJest: null,
      rootPath: '',
    };

    beforeEach(() => {
      mockJoin.mockImplementation(jest.requireActual('path').join);
      mockNormalize.mockImplementation(jest.requireActual('path').normalize);
      mockExistsSync.mockImplementation(jest.requireActual('path').existsSync);
    });

    it('returns "npm test --" when bootstrapped with create-react-app', () => {
      mockReadFileSync.mockReturnValueOnce(
        JSON.stringify({
          scripts: {
            test: 'react-scripts test',
          },
        })
      );

      expect(pathToJest(defaultSettings)).toBe('npm test --');
    });

    it('returns the normalized "pathToJest" setting when set by the user', () => {
      const expected = {};
      mockNormalize.mockReturnValueOnce(expected);

      const settings: any = {
        pathToJest: expected,
        rootPath: '',
      };

      expect(pathToJest(settings)).toBe(expected);
      expect(mockNormalize).toHaveBeenCalledWith(settings.pathToJest);
    });
    it('defaults to "node_modules/.bin/jest" when Jest is locally installed', () => {
      const expected = 'node_modules/.bin/jest.TEST';

      mockJoin.mockImplementation(jest.requireActual('path').posix.join);
      mockNormalize.mockImplementation((arg) => arg);
      mockExistsSync.mockImplementation((path) => path === expected);

      expect(pathToJest(defaultSettings)).toBe(`"${expected}"`);
    });
    it('default jestToPath path can preserve special characters', () => {
      mockJoin.mockImplementation(jest.requireActual('path').posix.join);
      mockNormalize.mockImplementation((arg) => arg);

      const testPaths = [
        '/root/my dir/space',
        '/root/my dir/escape-space',
        '/root/👍/emoji',
        '/root/外國人/unicode',
        '/root/\\space/double-escape',
      ];
      testPaths.forEach((p) => {
        const settings = { ...defaultSettings, rootPath: p };
        const expected = `${p}/node_modules/.bin/jest.TEST`;
        mockExistsSync.mockImplementation((path) => path === expected);
        expect(pathToJest(settings)).toBe(`"${expected}"`);
      });
    });
    it('defaults to "jest" when Jest is not locally installed', () => {
      const expected = '"jest.TEST"';

      mockJoin.mockImplementation(jest.requireActual('path').posix.join);
      mockNormalize.mockImplementation((arg) => arg);
      mockExistsSync.mockImplementation(() => false);

      expect(pathToJest(defaultSettings)).toBe(expected);
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
        mockJoin('generated-icons', 'state.svg'),
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
  beforeEach(() => {
    mockJoin.mockImplementation((...parts) => parts);
  });
  describe('getPackageJson', () => {
    it('can read package.json from file system', () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(packageWithTest));
      expect(getPackageJson('root')).toEqual(packageWithTest);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.arrayContaining(['root', 'package.json']),
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
