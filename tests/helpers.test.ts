jest.unmock('../src/helpers');
jest.unmock('../src/Settings');

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

const mockPlatform = jest.fn();
jest.mock('os', () => ({ platform: mockPlatform }));

const mockJoin = jest.fn();
const mockNormalize = jest.fn();
jest.mock('path', () => ({
  join: mockJoin,
  normalize: mockNormalize,
}));

import {
  isCreateReactAppTestCommand,
  pathToJest,
  nodeBinExtension,
  cleanAnsi,
} from '../src/helpers';

// Manually (forcefully) set the executable's file extension to test its addition independendly of the operating system.
(nodeBinExtension as string) = '.TEST';

describe('ModuleHelpers', () => {
  describe('nodeBinExtension', () => {
    // Since `nodeBinExtension` is a variable, we have to reload the module in order to re-evaluate it.
    it('should return an empty string on Linux', () => {
      jest.resetModules();
      mockPlatform.mockReturnValueOnce('linux');
      expect(require('../src/helpers').nodeBinExtension).toBe('');
    });

    it('should equal ".cmd" on Windows', () => {
      jest.resetModules();
      mockPlatform.mockReturnValueOnce('win32');
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
      mockJoin.mockImplementation(require.requireActual('path').join);
      mockNormalize.mockImplementation(require.requireActual('path').normalize);
      mockExistsSync.mockImplementation(require.requireActual('path').existsSync);
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
      expect(mockNormalize).toBeCalledWith(settings.pathToJest);
    });
    it('defaults to "node_modules/.bin/jest" when Jest is locally installed', () => {
      const expected = 'node_modules/.bin/jest.TEST';

      mockJoin.mockImplementation(require.requireActual('path').posix.join);
      mockNormalize.mockImplementation((arg) => arg);
      mockExistsSync.mockImplementation((path) => path === expected);

      expect(pathToJest(defaultSettings)).toBe(`"${expected}"`);
    });
    it('default jestToPath path can preserve special characters', () => {
      mockJoin.mockImplementation(require.requireActual('path').posix.join);
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

      mockJoin.mockImplementation(require.requireActual('path').posix.join);
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
});
