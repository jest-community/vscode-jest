jest.unmock('./mock-platform');
jest.unmock('./test-helper');
jest.unmock('../src/DebugConfigurationProvider');

import { restorePlatform, setPlatform } from './mock-platform';
import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import {
  getTestCommand,
  isCreateReactAppTestCommand,
  toFilePath,
  escapeRegExp,
  parseCmdLine,
  toAbsoluteRootPath,
  escapeQuotes,
} from '../src/helpers';
import * as fs from 'fs';
import { makeWorkspaceFolder } from './test-helper';

describe('DebugConfigurationProvider', () => {
  const fileName = '/a/file';
  const testName = 'a test';

  it('should by default return a DebugConfiguration for Jest', () => {
    const folder: any = { name: 'folder', uri: { fsPath: null } };
    const sut = new DebugConfigurationProvider();
    const configurations = sut.provideDebugConfigurations(folder);

    expect(configurations).toHaveLength(1);
    const config = configurations[0];
    expect(config.name).toBe('vscode-jest-tests.v2.folder');
    expect(config.type).toBe('node');
    expect(config.program).toMatch('jest');
    expect(config.args).toEqual(
      expect.arrayContaining([
        '--runInBand',
        '--watchAll=false',
        '--testNamePattern',
        '${jest.testNamePattern}',
        '--runTestsByPath',
        '${jest.testFile}',
      ])
    );
  });
  it('should return a valid CRA DebugConfiguration', () => {
    (getTestCommand as unknown as jest.Mock<{}>).mockReturnValueOnce(
      'react-scripts test --env=jsdom'
    );
    (isCreateReactAppTestCommand as unknown as jest.Mock<{}>).mockReturnValueOnce(true);

    const folder: any = { name: 'cra-app', uri: { fsPath: null } };
    const sut = new DebugConfigurationProvider();
    const configurations = sut.provideDebugConfigurations(folder);

    expect(configurations).toHaveLength(1);
    const config = configurations[0];
    expect(config.name).toBe('vscode-jest-tests.v2.cra-app');
    expect(config.type).toBe('node');
    // tslint:disable-next-line no-invalid-template-strings
    expect(config.runtimeExecutable).toBe('${workspaceFolder}/node_modules/.bin/react-scripts');
    expect(config.args).toEqual(
      expect.arrayContaining([
        'test',
        '--env=jsdom',
        '--runInBand',
        '--watchAll=false',
        '--testNamePattern',
        '${jest.testNamePattern}',
        '--runTestsByPath',
        '${jest.testFile}',
      ])
    );
  });

  it.each`
    debugConfigArgs    | expectedArgs
    ${[]}              | ${['--testNamePattern', testName, '--runTestsByPath', fileName]}
    ${['--runInBand']} | ${['--runInBand', '--testNamePattern', testName, '--runTestsByPath', fileName]}
  `(
    'should append the specified tests arguments for non-v2 config',
    ({ debugConfigArgs, expectedArgs }) => {
      (toFilePath as unknown as jest.Mock<{}>).mockImplementation((s) => s);

      let configuration: any = { name: 'vscode-jest-tests', args: debugConfigArgs };

      const sut = new DebugConfigurationProvider();
      const ws = makeWorkspaceFolder('whatever');
      sut.prepareTestRun(fileName, testName, ws);

      configuration = sut.resolveDebugConfiguration(undefined, configuration);

      expect(configuration).toBeDefined();
      expect(configuration.env && configuration.env.CI).toBeTruthy();
      if (expectedArgs.includes('--runTestsByPath')) {
        expect(toFilePath).toHaveBeenCalled();
      }
      expect(configuration.args).toEqual(expectedArgs);
    }
  );
  it('skip non-jest config', () => {
    (toFilePath as unknown as jest.Mock<{}>).mockImplementation((s) => s);

    const configuration: any = { name: 'non-jest', args: [] };

    const sut = new DebugConfigurationProvider();
    const config = sut.resolveDebugConfiguration(undefined, configuration);

    expect(config).toBe(configuration);
  });
  describe('v2 config', () => {
    const fileNamePattern = 'a/b/test\\.ts';
    it.each`
      args                                                                                        | expected
      ${[]}                                                                                       | ${[]}
      ${['${jest.testFile}']}                                                                     | ${[fileName]}
      ${['${jest.testFilePattern}']}                                                              | ${[fileNamePattern]}
      ${['${jest.testNamePattern}']}                                                              | ${[testName]}
      ${['--testNamePattern', '${jest.testNamePattern}', '--runTestsByPath', '${jest.testFile}']} | ${['--testNamePattern', testName, '--runTestsByPath', fileName]}
      ${['${jest.testNamePattern}', true]}                                                        | ${[testName, true]}
    `('will only translate known variables: $args', ({ args, expected }) => {
      (toFilePath as unknown as jest.Mock<{}>).mockReturnValueOnce(fileName);
      (escapeRegExp as unknown as jest.Mock<{}>).mockReturnValueOnce(fileNamePattern);
      (escapeQuotes as unknown as jest.Mock<{}>).mockImplementation((s) => s);

      let configuration: any = { name: 'vscode-jest-tests.v2', args };

      const sut = new DebugConfigurationProvider();
      const ws = makeWorkspaceFolder('whatever');
      sut.prepareTestRun(fileName, testName, ws);

      configuration = sut.resolveDebugConfiguration(undefined, configuration);

      expect(configuration).toBeDefined();
      expect(configuration.args).toEqual(expected);
    });
    it('will translate multiple variables in a single arg', () => {
      (toFilePath as unknown as jest.Mock<{}>).mockReturnValueOnce(fileName);
      (escapeRegExp as unknown as jest.Mock<{}>).mockReturnValueOnce(fileNamePattern);
      (escapeQuotes as unknown as jest.Mock<{}>).mockImplementation((s) => s);

      let configuration: any = {
        name: 'vscode-jest-tests.v2',
        args: ['--testNamePattern "${jest.testNamePattern}" --runTestsByPath "${jest.testFile}"'],
      };

      const sut = new DebugConfigurationProvider();
      const ws = makeWorkspaceFolder('whatever');
      sut.prepareTestRun(fileName, testName, ws);

      configuration = sut.resolveDebugConfiguration(undefined, configuration);

      expect(configuration).toBeDefined();
      expect(configuration.args).toEqual([
        `--testNamePattern "${testName}" --runTestsByPath "${fileName}"`,
      ]);
    });
  });
  describe('createDebugConfig', () => {
    const switchToWin32 = (useWin32: boolean) => {
      if (useWin32) {
        setPlatform('win32');
      } else {
        setPlatform('linux');
      }
    };

    const config1 = {
      type: 'node',
      name: 'vscode-jest-tests',
      request: 'launch',
      args: ['--runInBand'],
      cwd: '${workspaceFolder}',
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      disableOptimisticBPs: true,
      program: '${workspaceFolder}/node_modules/.bin/jest',
      windows: {
        program: '${workspaceFolder}/node_modules/jest/bin/jest',
      },
    };
    const config2 = {
      type: 'node',
      name: 'vscode-jest-tests.v2',
      request: 'launch',
      args: [
        '--runInBand',
        '--watchAll=false',
        '--testNamePattern',
        '${jest.testNamePattern}',
        '--runTestsByPath',
        '${jest.testFile}',
      ],
      cwd: '${workspaceFolder}',
      console: 'integratedTerminal',
      internalConsoleOptions: 'neverOpen',
      disableOptimisticBPs: true,
      program: '${workspaceFolder}/node_modules/.bin/jest',
      windows: {
        program: '${workspaceFolder}/node_modules/jest/bin/jest',
      },
    };
    const workspace = makeWorkspaceFolder('project-root');
    afterEach(() => {
      restorePlatform();
    });
    beforeEach(() => {
      (parseCmdLine as jest.Mocked<any>).mockImplementation(
        jest.requireActual('../src/helpers').parseCmdLine
      );
      (toAbsoluteRootPath as jest.Mocked<any>).mockImplementation(
        jest.requireActual('../src/helpers').toAbsoluteRootPath
      );
    });

    describe.each`
      name                      | config
      ${'vscode-jest-tests'}    | ${config1}
      ${'vscode-jest-tests.v2'} | ${config2}
    `('with config $name', ({ config }) => {
      describe('when merge should succeed', () => {
        describe.each`
          case  | useWin32 | jestCommandLine                                               | expected
          ${1}  | ${false} | ${'jest'}                                                     | ${{ cmd: 'jest', args: [], program: '${workspaceFolder}/jest' }}
          ${2}  | ${false} | ${'./node_modules/.bin/jest'}                                 | ${{ cmd: 'node_modules/.bin/jest', args: [], program: '${workspaceFolder}/node_modules/.bin/jest' }}
          ${3}  | ${false} | ${'./node_modules/.bin/..//jest'}                             | ${{ cmd: 'node_modules/jest', args: [], program: '${workspaceFolder}/node_modules/jest' }}
          ${4}  | ${false} | ${'../jest --config ../jest-config.json'}                     | ${{ cmd: '../jest', args: ['--config', '../jest-config.json'], program: '${workspaceFolder}/../jest' }}
          ${5}  | ${false} | ${'../jest --config "../jest-config.json"'}                   | ${{ cmd: '../jest', args: ['--config', '"../jest-config.json"'], program: '${workspaceFolder}/../jest' }}
          ${6}  | ${false} | ${'../jest --config=../jest-config.json'}                     | ${{ cmd: '../jest', args: ['--config=../jest-config.json'], program: '${workspaceFolder}/../jest' }}
          ${7}  | ${false} | ${'../jest --config="../jest-config.json"'}                   | ${{ cmd: '../jest', args: ['--config=', '"../jest-config.json"'], program: '${workspaceFolder}/../jest' }}
          ${8}  | ${false} | ${'../jest --config "a dir/jest-config.json" --coverage'}     | ${{ cmd: '../jest', args: ['--config', '"a dir/jest-config.json"', '--coverage'], program: '${workspaceFolder}/../jest' }}
          ${9}  | ${false} | ${'jest --config "../dir with space/jest-config.json"'}       | ${{ cmd: 'jest', args: ['--config', '"../dir with space/jest-config.json"'], program: '${workspaceFolder}/jest' }}
          ${10} | ${false} | ${'/absolute/jest --runInBand'}                               | ${{ cmd: '/absolute/jest', args: ['--runInBand'], program: '/absolute/jest' }}
          ${11} | ${false} | ${'"dir with space/jest" --arg1=1 --arg2 2 "some string"'}    | ${{ cmd: 'dir with space/jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '${workspaceFolder}/dir with space/jest' }}
          ${12} | ${false} | ${'"/dir with space/jest" --arg1=1 --arg2 2 "some string"'}   | ${{ cmd: '/dir with space/jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '/dir with space/jest' }}
          ${13} | ${false} | ${"'/dir with space/jest' --arg1=1 --arg2 2 'some string'"}   | ${{ cmd: '/dir with space/jest', args: ['--arg1=1', '--arg2', '2', "'some string'"], program: '/dir with space/jest' }}
          ${14} | ${false} | ${'jest --arg1 "escaped \\"this\\" string" --arg2 2'}         | ${{ cmd: 'jest', args: ['--arg1', '"escaped \\"this\\" string"', '--arg2', '2'], program: '${workspaceFolder}/jest' }}
          ${15} | ${false} | ${undefined}                                                  | ${{ cmd: 'jest', args: [], program: '${workspaceFolder}/node_modules/.bin/jest' }}
          ${16} | ${true}  | ${'.\\node_modules\\.bin\\jest.cmd'}                          | ${{ cmd: 'node_modules\\jest\\bin\\jest.js', args: [], program: '${workspaceFolder}\\node_modules\\jest\\bin\\jest.js' }}
          ${17} | ${true}  | ${'..\\jest --config="..\\jest-config.json"'}                 | ${{ cmd: '..\\jest', args: ['--config=', '"..\\jest-config.json"'], program: '${workspaceFolder}\\..\\jest' }}
          ${18} | ${true}  | ${'jest --config "..\\dir with space\\jest-config.json"'}     | ${{ cmd: 'jest', args: ['--config', '"..\\dir with space\\jest-config.json"'], program: '${workspaceFolder}\\jest' }}
          ${19} | ${true}  | ${'\\absolute\\jest --runInBand'}                             | ${{ cmd: '\\absolute\\jest', args: ['--runInBand'], program: '\\absolute\\jest' }}
          ${20} | ${true}  | ${'"\\dir with space\\jest" --arg1=1 --arg2 2 "some string"'} | ${{ cmd: '\\dir with space\\jest', args: ['--arg1=1', '--arg2', '2', '"some string"'], program: '\\dir with space\\jest' }}
          ${21} | ${true}  | ${'c:\\jest --arg1 "escaped \\"this\\" string" --arg2 2'}     | ${{ cmd: 'c:\\jest', args: ['--arg1', '"escaped \\"this\\" string"', '--arg2', '2'], program: 'c:\\jest' }}
        `('case $case', ({ jestCommandLine, expected, useWin32 }) => {
          it('can incorporate jestCommandLine  (for win32 only? $useWin32)', () => {
            switchToWin32(useWin32);

            (fs.existsSync as jest.Mocked<any>) = jest.fn().mockReturnValue(true);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { args, program, windows, ...restConfig } = config;
            const sut = new DebugConfigurationProvider();
            const spy = jest.spyOn(sut, 'provideDebugConfigurations');
            spy.mockImplementation(() => [config]);

            const {
              args: newArgs,
              program: newProgram,
              ...restNewConfig
            } = sut.createDebugConfig(workspace, { jestCommandLine });
            expect(newArgs).toContain('--runInBand');
            expect(newArgs).toEqual([...expected.args, ...args]);
            expect(newProgram).toEqual(expected.program);
            expect(restNewConfig).toEqual(restConfig);
          });
        });
        describe('can incorporate nodeEnv', () => {
          it.each`
            case | nodeEnv
            ${1} | ${undefined}
            ${2} | ${{ NODE_OPTIONS: '--experimental-vm-modules' }}
            ${3} | ${{ a: 'whatever', b: 3 }}
          `('case $case', ({ nodeEnv }) => {
            const sut = new DebugConfigurationProvider();
            const spy = jest.spyOn(sut, 'provideDebugConfigurations');
            spy.mockImplementation(() => [config]);

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { args, program, windows, ...restConfig } = config;
            const {
              args: newArgs,
              program: newProgram,
              env,
              ...restNewConfig
            } = sut.createDebugConfig(workspace, { nodeEnv });
            expect(newArgs).toContain('--runInBand');
            expect(newArgs).toEqual([...args]);
            expect(newProgram).toEqual(program);
            expect(restNewConfig).toEqual(restConfig);
            if (nodeEnv) {
              expect(env).toEqual(nodeEnv);
            } else {
              expect(env).toBeUndefined();
            }
          });
        });
      });
      it.each`
        jestCommandLine
        ${' '}
      `(
        'createDebugConfig should throw error for invalid cmdLine: $cmdLine',
        ({ jestCommandLine }) => {
          const sut = new DebugConfigurationProvider();
          expect(() => sut.createDebugConfig(workspace, { jestCommandLine })).toThrow(
            'invalid cmdLine'
          );
        }
      );
      it('if not passing any options, we will get the default config', () => {
        const sut = new DebugConfigurationProvider();
        const spy = jest.spyOn(sut, 'provideDebugConfigurations');
        spy.mockImplementation(() => [config]);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { windows, ...noWindowsConfig } = config;
        const newConfig = sut.createDebugConfig(workspace);
        expect(noWindowsConfig).toEqual(newConfig);
      });
      describe('on win32, should throw error if the raw jest binary can not be found', () => {
        it.each`
          exists
          ${true}
          ${false}
        `('file exists = $exists', ({ exists }) => {
          setPlatform('win32');
          (fs.existsSync as jest.Mocked<any>) = jest.fn().mockReturnValue(exists);
          const sut = new DebugConfigurationProvider();
          if (!exists) {
            expect(() =>
              sut.createDebugConfig(workspace, {
                jestCommandLine: 'whatever\\node_modules\\.bin\\jest.cmd',
              })
            ).toThrow();
          } else {
            expect(() =>
              sut.createDebugConfig(workspace, {
                jestCommandLine: 'whatever\\node_modules\\.bin\\jest.cmd',
              })
            ).not.toThrow();
          }
        });
      });
      it.each`
        cmd       | cArgs                                           | appendExtraArg
        ${'yarn'} | ${['test']}                                     | ${false}
        ${'yarn'} | ${['test', '--config', 'test-jest.json']}       | ${false}
        ${'npm'}  | ${['run', 'test']}                              | ${true}
        ${'npm'}  | ${['test', '--', '--config', 'test-jest.json']} | ${false}
      `('can merge yarn or npm command line: $cmd $cArgs', ({ cmd, cArgs, appendExtraArg }) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, program, windows, ...restConfig } = config;
        const sut = new DebugConfigurationProvider();
        const spy = jest.spyOn(sut, 'provideDebugConfigurations');
        spy.mockImplementation(() => [config]);

        const cmdLine = [cmd, ...cArgs].join(' ');
        const {
          args: newArgs,
          program: newProgram,
          runtimeExecutable,
          ...restNewConfig
        } = sut.createDebugConfig(workspace, { jestCommandLine: cmdLine });
        expect(newArgs).toContain('--runInBand');
        expect(runtimeExecutable).toEqual(cmd);
        expect(newProgram).toBeUndefined();

        const expectArgs = [...cArgs];
        if (appendExtraArg) {
          expectArgs.push('--');
        }
        expectArgs.push(...args);

        expect(newArgs).toEqual(expectArgs);
        expect(restNewConfig).toEqual(restConfig);
      });

      it('platform specific sections are removed.', () => {
        const sut = new DebugConfigurationProvider();
        const newConfig = sut.createDebugConfig(workspace, { jestCommandLine: 'whatever' });
        expect(newConfig.windows).toBeUndefined();
      });

      describe.each`
        case | useWin32 | absoluteRootPath              | jestCommandLine | expected
        ${1} | ${false} | ${undefined}                  | ${'jest'}       | ${{ program: '${workspaceFolder}/jest', cwd: '${workspaceFolder}' }}
        ${2} | ${false} | ${'/absolute/root/path'}      | ${'jest'}       | ${{ program: '/absolute/root/path/jest' }}
        ${3} | ${false} | ${'/absolute/root/path'}      | ${'./jest'}     | ${{ program: '/absolute/root/path/jest' }}
        ${4} | ${false} | ${'/absolute/root/path'}      | ${'../jest'}    | ${{ program: '/absolute/root/jest' }}
        ${5} | ${false} | ${'/absolute/root/path'}      | ${'yarn test'}  | ${{ runtimeExecutable: 'yarn' }}
        ${6} | ${true}  | ${undefined}                  | ${'jest'}       | ${{ program: '${workspaceFolder}\\jest', cwd: '${workspaceFolder}' }}
        ${7} | ${true}  | ${'c:\\absolute\\root\\path'} | ${'..\\jest'}   | ${{ program: 'c:\\absolute\\root\\jest' }}
        ${8} | ${true}  | ${'\\absolute\\root\\path'}   | ${'yarn test'}  | ${{ runtimeExecutable: 'yarn' }}
      `('case $case', ({ useWin32, absoluteRootPath, jestCommandLine, expected }) => {
        it('debugConfig.cwd will be based on absolute rootPath', () => {
          switchToWin32(useWin32);

          const sut = new DebugConfigurationProvider();
          const { cwd } = sut.createDebugConfig(workspace, {
            jestCommandLine,
            rootPath: absoluteRootPath,
          });
          expect(cwd).toEqual(expected.cwd ?? absoluteRootPath);
        });
        it('program will be adjust by rootPath', () => {
          switchToWin32(useWin32);
          const sut = new DebugConfigurationProvider();
          const { program } = sut.createDebugConfig(workspace, {
            jestCommandLine,
            rootPath: absoluteRootPath,
          });
          expect(program).toEqual(expected.program);
        });
        it('runtimeExecutable will NOT be adjusted by rootPath', () => {
          switchToWin32(useWin32);
          const sut = new DebugConfigurationProvider();
          const { runtimeExecutable } = sut.createDebugConfig(workspace, {
            jestCommandLine,
            rootPath: absoluteRootPath,
          });
          expect(runtimeExecutable).toEqual(expected.runtimeExecutable);
        });
      });
    });
  });
});
