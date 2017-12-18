jest.unmock('../src/JestExt')
jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}))

import { JestExt } from '../src/JestExt'
import { ProjectWorkspace, Settings, Runner } from 'jest-editor-support'
import { window, workspace, debug } from 'vscode'

describe('JestExt', () => {
  const mockSettings = (Settings as any) as jest.Mock<any>
  const mockRunner = (Runner as any) as jest.Mock<any>
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>
  let projectWorkspace: ProjectWorkspace
  const channelStub = { appendLine: () => {} } as any
  const mockShowErrorMessage = window.showErrorMessage as jest.Mock<any>
  const extensionSettings = {} as any

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
    new JestExt(projectWorkspace, channelStub, extensionSettings)
    expect(mockShowErrorMessage.mock.calls).toMatchSnapshot()
  })

  it.skip('should not show error message if jest version is 20', () => {
    mockSettings.mockImplementation(() => ({
      getConfig: callback => callback(),
      jestVersionMajor: 20,
    }))
    new JestExt(projectWorkspace, channelStub, extensionSettings)
    expect(window.showErrorMessage).not.toBeCalled()
  })

  describe('after starting the process', () => {
    const closeProcess = jest.fn()
    let extension: JestExt
    let eventEmitter: any

    beforeEach(() => {
      jest.clearAllMocks()
      eventEmitter = {
        on: jest.fn(() => eventEmitter),
        start: jest.fn(),
        closeProcess,
      }
      mockRunner.mockImplementation(() => eventEmitter)
      extension = new JestExt(projectWorkspace, channelStub, extensionSettings)
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

    function getExitHandler() {
      const filtered = eventEmitter.on.mock.calls.filter(args => args[0] === 'debuggerProcessExit')
      return filtered[filtered.length - 1][1]
    }
    describe('when jest process exit', () => {
      function getJestWatchMode(index: number): boolean {
        return eventEmitter.start.mock.calls[index][0]
      }
      let handler: () => void
      beforeEach(() => {
        handler = getExitHandler()
        jest.clearAllMocks()
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
          jest.clearAllMocks()
          eventEmitter.watchMode = watchMode
          handler()
          handler()
          expect(eventEmitter.start).toHaveBeenCalledTimes(1)
          expect(getJestWatchMode(0)).toEqual(true)
        })
      })
    })
    describe('safeguard restart', () => {
      function testMaxRestart(maxCount: number) {
        for (let i = 1; i <= maxCount * 2; i++) {
          const j = Math.min(maxCount, i)
          handler()
          expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(j)
          expect(eventEmitter.start).toHaveBeenCalledTimes(j)
          handler()
        }
      }
      let handler: () => void
      beforeEach(() => {
        handler = getExitHandler()
        jest.clearAllMocks()
      })
      it('should not restart jest if closeProcess() is invoked by user', () => {
        extension.stopProcess()
        expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(1)
        handler()
        expect(eventEmitter.start).toHaveBeenCalledTimes(0)
      })
      it('will not restart if exceed maxRestart (4)', () => {
        testMaxRestart(4)
      })
      it('will reset maxRestart if startProcess() is called again', () => {
        testMaxRestart(4)

        extension.startProcess()
        handler = getExitHandler()
        jest.clearAllMocks()

        testMaxRestart(4)
      })
    })
  })

  describe('runTest()', () => {
    const fileName = 'fileName'
    const testNamePattern = 'testNamePattern'
    const defaultArgs = ['--runInBand', fileName, '--testNamePattern', testNamePattern]

    it('should use the config if set', () => {
      const config = 'jest.json'
      const expected = [...defaultArgs, '--config', config]
      const extensionSettings = {
        pathToConfig: config,
      } as any

      const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      // @ts-ignore: Overriding private method
      sut.resolvePathToJestBin = jest.fn().mockReturnValueOnce(true)
      sut.runTest(fileName, testNamePattern)

      expect(debug.startDebugging).toHaveBeenCalledTimes(1)

      const configuration = (debug.startDebugging as jest.Mock<Function>).mock.calls[0][1]
      expect(configuration).toBeDefined()
      expect(configuration.args).toEqual(expected)
    })
  })

  describe('onDidCloseTextDocument()', () => {
    it('should remove the cached test results', () => {
      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      const document = {} as any
      sut.removeCachedTestResults = jest.fn()

      sut.onDidCloseTextDocument(document)
      expect(sut.removeCachedTestResults).toBeCalledWith(document)
    })
  })

  describe('onDidSaveTextDocument()', () => {
    let sut

    beforeEach(() => {
      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    })

    it('should remove the cached test results', () => {
      const document = {} as any
      sut.removeCachedTestResults = jest.fn()

      sut.onDidSaveTextDocument(null, document)
      expect(sut.removeCachedTestResults).toBeCalledWith(document)
    })

    it('should update the decorations', () => {
      const editor = {} as any
      sut.triggerUpdateDecorations = jest.fn()
      sut.onDidSaveTextDocument(editor, null)

      expect(sut.triggerUpdateDecorations).toBeCalledWith(editor)
    })
  })

  describe('removeCachedTestResults()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    sut.testResultProvider.removeCachedResults = jest.fn()

    it('should do nothing when the document is null', () => {
      sut.onDidCloseTextDocument(null)

      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled()
    })

    it('should do nothing when the document is untitled', () => {
      const document: any = { isUntitled: true } as any
      sut.onDidCloseTextDocument(document)

      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled()
    })

    it('should reset the test result cache for the document', () => {
      const expected = 'file.js'
      sut.onDidCloseTextDocument({ fileName: expected } as any)

      expect(sut.testResultProvider.removeCachedResults).toBeCalledWith(expected)
    })
  })
})
