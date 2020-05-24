jest.unmock('../src/DebugConfigurationProvider');

import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider';
import { getTestCommand, isCreateReactAppTestCommand } from '../src/helpers';

describe('DebugConfigurationProvider', () => {
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
    ((getTestCommand as unknown) as jest.Mock<{}>).mockReturnValueOnce(
      'react-scripts test --env=jsdom'
    );
    ((isCreateReactAppTestCommand as unknown) as jest.Mock<{}>).mockReturnValueOnce(true);

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
  });

  it('should append the specified tests', () => {
    const fileName = 'fileName';
    const testNamePattern = 'testNamePattern';
    const expected = [fileName, '--testNamePattern', testNamePattern];
    let configuration: any = { name: 'vscode-jest-tests' };

    const sut = new DebugConfigurationProvider();
    sut.prepareTestRun(fileName, testNamePattern);

    configuration = sut.resolveDebugConfiguration(undefined, configuration);

    expect(configuration).toBeDefined();
    expect(configuration.env && configuration.env.CI).toBeTruthy();
    expect(configuration.args).toEqual(expected);
  });
});
