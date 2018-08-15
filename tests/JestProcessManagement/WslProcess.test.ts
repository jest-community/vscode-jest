jest.mock('child_process')
jest.unmock('../../src/JestProcessManagement/WslProcess')
jest.unmock('jest-editor-support')

import * as child_process from 'child_process'
import { ProjectWorkspace } from 'jest-editor-support'
import { createProcessInWSL } from '../../src/JestProcessManagement/WslProcess'

describe('WslProcess', () => {
  beforeEach(() => jest.resetAllMocks())

  it('should convert windows path to the wsl root', () => {
    const expectedArguments = ['test', '--config', '/mnt/c/config/json']
    const projectWorkspaceMock = new ProjectWorkspace('C:\\Temp', 'wsl test', 'C:\\config\\json', null)

    createProcessInWSL(projectWorkspaceMock, [], {
      shell: true,
    })

    const spawnMock = child_process.spawn as jest.Mock
    const spawnArguments: string[] = spawnMock.mock.calls[0][1]

    expect(spawnArguments).toEqual(expectedArguments)
  })

  it('should convert also wrongly build windows paths to the wsl root', () => {
    const expectedArguments = ['test', '--config', '/mnt/c/myPath/some_unix_path']
    const projectWorkspaceMock = new ProjectWorkspace('C:\\Temp', 'wsl test', 'C:\\myPath/some_unix_path', null)

    createProcessInWSL(projectWorkspaceMock, [], {
      shell: true,
    })

    const spawnMock = child_process.spawn as jest.Mock
    const spawnArguments: string[] = spawnMock.mock.calls[0][1]

    expect(spawnArguments).toEqual(expectedArguments)
  })
})
