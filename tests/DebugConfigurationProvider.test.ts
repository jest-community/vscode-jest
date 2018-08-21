jest.unmock('../src/DebugConfigurationProvider')

import { DebugConfigurationProvider } from '../src/DebugConfigurationProvider'
import { getTestCommand, isCreateReactAppTestCommand } from '../src/helpers'
import { ProjectWorkspace } from 'jest-editor-support'

describe('DebugConfigurationProvider', () => {
  it('should by default return a DebugConfiguration for Jest', () => {
    const folder: any = { uri: { fsPath: null } }
    const sut = new DebugConfigurationProvider()
    const configurations = sut.provideDebugConfigurations(folder)

    expect(configurations).toHaveLength(1)
    const config = configurations[0]
    expect(config.name).toBe('vscode-jest-tests')
    expect(config.type).toBe('node')
    expect(config.args).toContain('--runInBand')
    expect(config.program).toMatch('jest')
  })
  it('should return a valid CRA DebugConfiguration', () => {
    ;(getTestCommand as jest.Mock<Function>).mockReturnValueOnce('react-scripts test --env=jsdom')
    ;(isCreateReactAppTestCommand as jest.Mock<Function>).mockReturnValueOnce(true)

    const folder: any = { uri: { fsPath: null } }
    const sut = new DebugConfigurationProvider()
    const configurations = sut.provideDebugConfigurations(folder)

    expect(configurations).toHaveLength(1)
    const config = configurations[0]
    expect(config.name).toBe('vscode-jest-tests')
    expect(config.type).toBe('node')
    expect(config.runtimeExecutable).toBe('${workspaceFolder}/node_modules/.bin/react-scripts')
    expect(config.args[0]).toBe('test')
    expect(config.args).toContain('--env=jsdom')
    expect(config.args).toContain('--runInBand')
  })
  it('should utilise workspace jestConfig', () => {
    const folder = { uri: { fspath: 'folderName' } }
    const fileName = 'fileName'
    const testNamePattern = 'testNamePattern'
    const workspace = {
      pathToConfig: './jest-config.js',
    }
    const expected = ['--runInBand', '--config', workspace.pathToConfig]

    const sut = new DebugConfigurationProvider()
    sut.prepareTestRun(fileName, testNamePattern, workspace as any)

    const configuration = sut.provideDebugConfigurations(folder as any)

    expect(configuration).toBeDefined()
    expect(configuration[0].args).toEqual(expected)
  })
  it('should append the specified tests', () => {
    const fileName = 'fileName'
    const testNamePattern = 'testNamePattern'
    const expected = [fileName, '--testNamePattern', testNamePattern]
    let configuration: any = { name: 'vscode-jest-tests' }

    const sut = new DebugConfigurationProvider()
    sut.prepareTestRun(fileName, testNamePattern, {} as ProjectWorkspace)

    configuration = sut.resolveDebugConfiguration(undefined, configuration)

    expect(configuration).toBeDefined()
    expect(configuration.env && configuration.env.CI).toBeTruthy()
    expect(configuration.args).toEqual(expected)
  })
})
