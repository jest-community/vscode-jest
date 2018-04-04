jest.unmock('events')
jest.unmock('../src/JestExt')
jest.unmock('../src/DebugConfigurationProvider')

jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}))

import { JestExt } from '../src/JestExt'
import { ProjectWorkspace, Settings } from 'jest-editor-support'
import { window, workspace, debug } from 'vscode'
import { hasDocument, isOpenInMultipleEditors } from '../src/editor'
import { failingAssertionStyle } from '../src/decorations'

describe('JestExt', () => {
  const mockSettings = (Settings as any) as jest.Mock<any>
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

    it('should use the config if set', async () => {
      const config = 'jest.json'
      const expected = ['--runInBand', '--config', config, fileName, '--testNamePattern', testNamePattern]
      const extensionSettings = {
        pathToConfig: config,
      } as any

      projectWorkspace.pathToConfig = extensionSettings.pathToConfig

      const startDebugging = debug.startDebugging as jest.Mock<Function>

      startDebugging.mockImplementation(async (_folder: any, nameOrConfig: any) => {
        if (typeof nameOrConfig === 'string') {
          throw null
        }
      })

      const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      await sut.runTest(fileName, testNamePattern)

      expect(debug.startDebugging).toHaveBeenCalledTimes(2)

      let configuration = startDebugging.mock.calls[1][1]
      expect(configuration.type).toBe('node')

      configuration = sut.debugConfigurationProvider.resolveDebugConfiguration(undefined, configuration)
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

  describe('toggleCoverageOverlay()', () => {
    it('should toggle the coverage overlay visibility', () => {
      const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      sut.toggleCoverageOverlay()

      expect(sut.coverageOverlay.toggleVisibility).toBeCalled()
    })
  })

  describe('triggerUpdateDecorations()', () => {
    it('should update the coverage overlay in visible editors', () => {
      const editor: any = {}

      const sut = new JestExt(projectWorkspace, channelStub, extensionSettings)
      sut.triggerUpdateDecorations(editor)

      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled()
    })
  })
})
