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
  const mockShowErrorMessage = window.showErrorMessage as jest.Mock<any>

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
    expect(mockShowErrorMessage.mock.calls).toMatchSnapshot()
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
    let eventEmitter: any

    beforeEach(() => {
      jest.resetAllMocks()
      eventEmitter = {
        on: jest.fn(() => eventEmitter),
        start: jest.fn(),
        closeProcess,
      }
      mockRunner.mockImplementation(() => eventEmitter)
      extension = new JestExt(projectWorkspace, channelStub, {})
      extension.startProcess()
    })

    it('should not attempt to closeProcess again after stopping and starting', () => {
      expect(closeProcess).toHaveBeenCalledTimes(0)
      extension.stopProcess()
      expect(closeProcess).toHaveBeenCalledTimes(1)
      extension.startProcess()
      expect(closeProcess).toHaveBeenCalledTimes(1)
    })

    it('should closeProcess when starting again', () => {
      expect(closeProcess).toHaveBeenCalledTimes(0)
      extension.startProcess()
      expect(closeProcess).toHaveBeenCalledTimes(1)
    })
    describe('when jest process exit', () => {
      function getExitHandler() {
        return eventEmitter.on.mock.calls.filter(args => args[0] === 'debuggerProcessExit')[0][1]
      }
      function getJestWatchMode(index: number): boolean {
        return eventEmitter.start.mock.calls[index][0]
      }
      let handler: () => void
      beforeEach(() => {
        handler = getExitHandler()
        jest.resetAllMocks()
      })
      it('if non-watch mode, exit should reset process and trigger the watch mode', () => {
        eventEmitter.watchMode = false
        handler()

        expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(1)

        expect(eventEmitter.start).toHaveBeenCalledTimes(1)
        expect(getJestWatchMode(0)).toEqual(true)
      })
      it('in watch mode, exit should re-start the watch mode', () => {
        eventEmitter.watchMode = true
        handler()
        expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(1)
        expect(eventEmitter.start).toHaveBeenCalledTimes(1)
        expect(getJestWatchMode(0)).toEqual(true)
      })
      it('should not restart jest if closeProcess() is invoked by exit handler', () => {
        expect(eventEmitter.start).toHaveBeenCalledTimes(0)
        ;[true, false].forEach(watchMode => {
          jest.resetAllMocks()
          eventEmitter.watchMode = watchMode
          handler()
          handler()
          expect(eventEmitter.start).toHaveBeenCalledTimes(1)
          expect(getJestWatchMode(0)).toEqual(true)
        })
      })
      it('should not restart jest if closeProcess() is invoked by user', () => {
        extension.stopProcess()
        expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(1)
        handler()
        expect(eventEmitter.start).toHaveBeenCalledTimes(0)
      })

      it('will not restart if exceed maxRestart (4)', () => {
        jest.resetAllMocks()
        for (let i = 0; i < 7; i++) {
          const j = Math.min(3, i)
          handler()
          expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(j + 1)
          expect(eventEmitter.start).toHaveBeenCalledTimes(j + 1)
          handler()
        }
      })
    })
  })
})
