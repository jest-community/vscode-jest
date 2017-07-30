jest.unmock('../src/JestExt')

import { JestExt } from '../src/JestExt'
import { ProjectWorkspace, Settings, Runner } from 'jest-editor-support'
import { window, workspace } from 'vscode'

describe('JestExt', () => {
  const mockSettings = (Settings as any) as jest.Mock<any>
  const mockRunner = (Runner as any) as jest.Mock<any>
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>
  let projectWorkspace: ProjectWorkspace
  const channelStub = { appendLine: () => {} } as any

  beforeEach(() => {
    jest.resetAllMocks()

    projectWorkspace = new ProjectWorkspace(null, null, null, null)
    getConfiguration.mockReturnValue({})
  })

  it('should show error message if jest version i < 18', () => {
    mockSettings.mockImplementation(() => ({
      getConfig: callback => callback(),
      jestVersionMajor: 17,
    }))
    new JestExt(projectWorkspace, channelStub, {})
    expect(window.showErrorMessage.mock.calls).toMatchSnapshot()
  })

  it.skip('should not show error message if jest version is 20', () => {
    mockSettings.mockImplementation(() => ({
      getConfig: callback => callback(),
      jestVersionMajor: 20,
    }))
    new JestExt(projectWorkspace, channelStub, {})
    expect(window.showErrorMessage).not.toBeCalled()
  })

  describe('after starting the process', () => {
    const closeProcess = jest.fn()
    let extension: JestExt

    beforeEach(() => {
      const eventEmitter = {
        on: jest.fn(() => eventEmitter),
        start: jest.fn(),
        closeProcess,
      }
      mockRunner.mockImplementation(() => eventEmitter)
      extension = new JestExt(projectWorkspace, channelStub, {})
      extension.startProcess()
    })

    it('should not attempt to closeProcess again after stopping and starting', () => {
      extension.stopProcess()
      extension.startProcess()
      expect(closeProcess).toHaveBeenCalledTimes(1)
    })

    it('should closeProcess when starting again', () => {
      extension.startProcess()
      expect(closeProcess).toHaveBeenCalledTimes(1)
    })
  })
})
