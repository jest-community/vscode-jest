jest.unmock('../src/DebugConfigurationProvider');

import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import {
  getTestCommand,
  isCreateReactAppTestCommand,
  toFilePath,
  escapeRegExp,
} from '../src/helpers';

describe('DebugConfigurationProvider', () => {
  const fileName = '/a/file';
  const testName = 'a test';

  it('should by default return a DebugConfiguration for Jest', () => {
    const folder: any = { uri: { fsPath: null } };
    const sut = new DebugConfigurationProvider();
    const configurations = sut.provideDebugConfigurations(folder);

    expect(configurations).toHaveLength(1);
    const config = configurations[0];
    expect(config.name).toBe('vscode-jest-tests.v2');
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

    const folder: any = { uri: { fsPath: null } };
    const sut = new DebugConfigurationProvider();
    const configurations = sut.provideDebugConfigurations(folder);

    expect(configurations).toHaveLength(1);
    const config = configurations[0];
    expect(config.name).toBe('vscode-jest-tests.v2');
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
      sut.prepareTestRun(fileName, testName);

      configuration = sut.resolveDebugConfiguration(undefined, configuration);

      expect(configuration).toBeDefined();
      expect(configuration.env && configuration.env.CI).toBeTruthy();
      if (expectedArgs.includes('--runTestsByPath')) {
        expect(toFilePath).toBeCalled();
      }
      expect(configuration.args).toEqual(expectedArgs);
    }
  );
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

      let configuration: any = { name: 'vscode-jest-tests.v2', args };

      const sut = new DebugConfigurationProvider();
      sut.prepareTestRun(fileName, testName);

      configuration = sut.resolveDebugConfiguration(undefined, configuration);

      expect(configuration).toBeDefined();
      expect(configuration.args).toEqual(expected);
    });
  });
});
