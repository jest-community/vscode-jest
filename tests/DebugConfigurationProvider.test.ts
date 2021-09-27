jest.unmock('../src/DebugConfigurationProvider');

import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import { getTestCommand, isCreateReactAppTestCommand, toFilePath } from '../src/helpers';

describe('DebugConfigurationProvider', () => {
  const fileName = '/a/file';
  const testName = 'a test';

  it('should by default return a DebugConfiguration for Jest', () => {
    const folder: any = { uri: { fsPath: null } };
    const sut = new DebugConfigurationProvider();
    const configurations = sut.provideDebugConfigurations(folder);

    expect(configurations).toHaveLength(1);
    const config = configurations[0];
    expect(config.name).toBe('vscode-jest-tests');
    expect(config.type).toBe('node');
    expect(config.args).toContain('--runInBand');
    expect(config.program).toMatch('jest');
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
    expect(config.name).toBe('vscode-jest-tests');
    expect(config.type).toBe('node');
    // tslint:disable-next-line no-invalid-template-strings
    expect(config.runtimeExecutable).toBe('${workspaceFolder}/node_modules/.bin/react-scripts');
    expect(config.args[0]).toBe('test');
    expect(config.args).toContain('--env=jsdom');
    expect(config.args).toContain('--runInBand');
    expect(config.args).toContain('--watchAll=false');
  });

  it.each`
    debugConfigArgs    | expectedArgs
    ${[]}              | ${['--testNamePattern', testName, '--runTestsByPath', fileName]}
    ${['--runInBand']} | ${['--runInBand', '--testNamePattern', testName, '--runTestsByPath', fileName]}
  `('should append the specified tests arguments', ({ debugConfigArgs, expectedArgs }) => {
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
  });
});
