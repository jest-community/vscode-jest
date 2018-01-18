jest.unmock('../src/JestExt')
jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}))

import { JestExt } from '../src/JestExt'
import { ProjectWorkspace, Settings, Runner } from 'jest-editor-support'
import { window, workspace, debug } from 'vscode'
import { hasDocument, isOpenInMultipleEditors } from '../src/editor'
import { failingAssertionStyle } from '../src/decorations'
import { EventEmitter } from 'events'

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
      const consoleWarn = console.warn

      beforeEach(() => {
        handler = getExitHandler()
        jest.clearAllMocks()
        console.warn = consoleWarn
      })

      it('should not restart jest if closeProcess() is invoked by user', () => {
        extension.stopProcess()
        expect(eventEmitter.closeProcess).toHaveBeenCalledTimes(1)
        handler()
        expect(eventEmitter.start).toHaveBeenCalledTimes(0)
      })

      it('will not restart if exceed maxRestart (4)', () => {
        console.warn = jest.fn()
        testMaxRestart(4)
      })

      it('will reset maxRestart if startProcess() is called again', () => {
        console.warn = jest.fn()
        testMaxRestart(4)

        extension.startProcess()
        handler = getExitHandler()
        jest.clearAllMocks()

        testMaxRestart(4)
      })
    })
  })

  describe('updateWithData()', () => {
    class MockRunner extends EventEmitter {
      start: Function = jest.fn()
    }

    const expected = {}
    const data = {
      coverageMap: expected,
    }

    let sut
    let processMock
    beforeEach(() => {
      processMock = new MockRunner()
      mockRunner.mockImplementation(() => processMock)

      sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      sut.startProcess()
    })

    it('should update the coverage map (no additional argument)', () => {
      window.visibleTextEditors = []

      // Indirectly call updateWithData()
      processMock.emit('executableJSON', data)

      expect(sut.coverage.mapCoverage).toBeCalledWith(expected)
    })

    it('should update the coverage map when the test results do not follow "No tests found related to files changed since the last commit"', () => {
      window.visibleTextEditors = []
      const meta = {
        noTestsFound: false,
      }

      // Indirectly call updateWithData()
      processMock.emit('executableJSON', data, meta)

      expect(sut.coverage.mapCoverage).toBeCalledWith(expected)
    })

    it('should not update the coverage map when the test results follow "No tests found related to files changed since the last commit"', () => {
      window.visibleTextEditors = []
      const meta = {
        noTestsFound: true,
      }

      // Indirectly call updateWithData()
      processMock.emit('executableJSON', data, meta)

      expect(sut.coverage.mapCoverage).not.toBeCalled()
    })
  })

  describe('resetInlineErrorDecorators()', () => {
    let sut: JestExt
    const editor: any = {
      document: { fileName: 'file.js' },
      setDecorations: jest.fn(),
    }
    const decorationType: any = { dispose: jest.fn() }

    beforeEach(() => {
      sut = new JestExt(projectWorkspace, channelStub, extensionSettings)

      sut.canUpdateDecorators = jest.fn().mockReturnValueOnce(true)
      sut.debugCodeLensProvider.didChange = jest.fn()
      ;(failingAssertionStyle as jest.Mock<{}>).mockReturnValue({})
      ;(sut.testResultProvider.getSortedResults as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      })
    })

    it('should initialize the cached decoration types as an empty array', () => {
      expect(sut.failingAssertionDecorators[editor.document.fileName]).toBeUndefined()
      sut.triggerUpdateDecorations(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([])
      expect(isOpenInMultipleEditors).not.toBeCalled()
    })

    it('should not clear the cached decorations types when the document is open more than once', () => {
      ;(isOpenInMultipleEditors as jest.Mock<{}>).mockReturnValueOnce(true)

      sut.failingAssertionDecorators[editor.document.fileName] = {
        forEach: jest.fn(),
      } as any
      sut.triggerUpdateDecorations(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName].forEach).not.toBeCalled()
    })

    it('should dispose of each cached decoration type', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType]
      sut.triggerUpdateDecorations(editor)

      expect(decorationType.dispose).toBeCalled()
    })

    it('should reset the cached decoration types', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType]
      sut.triggerUpdateDecorations(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([])
    })
  })

  describe('generateInlineErrorDecorator()', () => {
    it('should add the decoration type to the cache', () => {
      const settings: any = { enableInlineErrorMessages: true }
      const sut = new JestExt(projectWorkspace, channelStub, settings)
      const editor: any = {
        document: { fileName: 'file.js' },
        setDecorations: jest.fn(),
      }
      const expected = {}
      ;(failingAssertionStyle as jest.Mock<{}>).mockReturnValueOnce(expected)
      sut.canUpdateDecorators = jest.fn().mockReturnValueOnce(true)
      sut.testResultProvider.getSortedResults = jest.fn().mockReturnValueOnce({
        success: [],
        fail: [
          {
            start: {},
          },
        ],
        skip: [],
        unknown: [],
      })
      sut.debugCodeLensProvider.didChange = jest.fn()
      sut.triggerUpdateDecorations(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([expected])
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
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    const document = {} as any
    sut.removeCachedTestResults = jest.fn()
    sut.removeCachedDecorationTypes = jest.fn()

    it('should remove the cached test results', () => {
      sut.onDidCloseTextDocument(document)
      expect(sut.removeCachedTestResults).toBeCalledWith(document)
    })

    it('should remove the cached decorations', () => {
      sut.onDidCloseTextDocument(document)
      expect(sut.removeCachedDecorationTypes)
    })
  })

  describe('removeCachedTestResults()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    sut.testResultProvider.removeCachedResults = jest.fn()

    it('should do nothing when the document is falsy', () => {
      sut.removeCachedTestResults(null)
      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled()
    })

    it('should do nothing when the document is untitled', () => {
      const document: any = { isUntitled: true } as any
      sut.removeCachedTestResults(document)

      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled()
    })

    it('should reset the test result cache for the document', () => {
      const expected = 'file.js'
      sut.removeCachedTestResults({ fileName: expected } as any)

      expect(sut.testResultProvider.removeCachedResults).toBeCalledWith(expected)
    })
  })

  describe('removeCachedAnnotations()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)

    beforeEach(() => {
      sut.failingAssertionDecorators = {
        'file.js': [],
      }
    })

    it('should do nothing when the document is falsy', () => {
      sut.onDidCloseTextDocument(null)

      expect(sut.failingAssertionDecorators['file.js']).toBeDefined()
    })

    it('should remove the annotations for the document', () => {
      const document: any = { fileName: 'file.js' } as any
      sut.onDidCloseTextDocument(document)

      expect(sut.failingAssertionDecorators['file.js']).toBeUndefined()
    })
  })

  describe('onDidChangeActiveTextEditor()', () => {
    let sut
    const editor: any = {}
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    sut.triggerUpdateDecorations = jest.fn()

    beforeEach(() => {
      ;(sut.triggerUpdateDecorations as jest.Mock<{}>).mockReset()
    })

    it('should do nothing if the editor does not have a document', () => {
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(false)
      sut.onDidChangeActiveTextEditor(editor)

      expect(sut.triggerUpdateDecorations).not.toBeCalled()
    })

    it('should update the annotations when the editor has a document', () => {
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(true)
      sut.onDidChangeActiveTextEditor(editor)

      expect(sut.triggerUpdateDecorations).toBeCalledWith(editor)
    })
  })

  describe('onDidChangeTextDocument()', () => {
    let sut
    const event: any = {
      document: {
        isDirty: false,
        uri: { scheme: 'file' },
      },
      contentChanges: [],
    }

    beforeEach(() => {
      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
    })

    function expectItTakesNoAction(event) {
      sut.removeCachedTestResults = jest.fn()
      sut.triggerUpdateDecorations = jest.fn()
      sut.onDidChangeTextDocument(event)

      expect(sut.removeCachedTestResults).not.toBeCalledWith(event.document)
      expect(sut.triggerUpdateDecorations).not.toBeCalled()
    }

    it('should do nothing if the document has unsaved changes', () => {
      const event: any = {
        document: {
          isDirty: true,
          uri: { scheme: 'file' },
        },
        contentChanges: [],
      }
      expectItTakesNoAction(event)
    })

    it('should do nothing if the document URI scheme is "git"', () => {
      const event: any = {
        document: {
          isDirty: false,
          uri: {
            scheme: 'git',
          },
        },
        contentChanges: [],
      }
      expectItTakesNoAction(event)
    })

    it('should do nothing if the document is clean but there are changes', () => {
      const event = {
        document: {
          isDirty: false,
          uri: { scheme: 'file' },
        },
        contentChanges: { length: 1 },
      }
      expectItTakesNoAction(event)
    })

    it('should remove the cached test results if the document is clean', () => {
      sut.removeCachedTestResults = jest.fn()
      window.visibleTextEditors = []
      sut.onDidChangeTextDocument(event)

      expect(sut.removeCachedTestResults).toBeCalledWith(event.document)
    })

    it('should update the decorations', () => {
      const editor: any = { document: event.document }
      sut.triggerUpdateDecorations = jest.fn()
      window.visibleTextEditors = [editor]
      sut.onDidChangeTextDocument(event)

      expect(sut.triggerUpdateDecorations).toBeCalledWith(editor)
    })
  })
})
