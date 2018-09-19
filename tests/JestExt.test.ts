jest.unmock('events')
jest.unmock('../src/JestExt')
jest.unmock('../src/messaging')

jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}))
jest.mock('os')
jest.mock('../src/decorations')

const statusBar = {
  bind: () => ({
    initial: jest.fn(),
    running: jest.fn(),
    success: jest.fn(),
    failed: jest.fn(),
    stopped: jest.fn(),
  }),
}
jest.mock('../src/StatusBar', () => ({ statusBar }))

import { JestExt } from '../src/JestExt'
import { ProjectWorkspace } from 'jest-editor-support'
import { window, workspace, debug } from 'vscode'
import { hasDocument, isOpenInMultipleEditors } from '../src/editor'
import * as decorations from '../src/decorations'
import { updateCurrentDiagnostics } from '../src/diagnostics'

describe('JestExt', () => {
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>
  const workspaceFolder = {} as any
  let projectWorkspace: ProjectWorkspace
  const channelStub = { appendLine: () => {}, clear: () => {} } as any
  // const mockShowErrorMessage = window.showErrorMessage as jest.Mock<any>
  // const mockShowWarningMessage = window.showWarningMessage as jest.Mock<any>
  const extensionSettings = { debugCodeLens: {} } as any
  const debugCodeLensProvider = {} as any
  const debugConfigurationProvider = {
    provideDebugConfigurations: jest.fn(),
    prepareTestRun: jest.fn(),
  } as any

  console.error = jest.fn()

  beforeEach(() => {
    jest.resetAllMocks()

    projectWorkspace = new ProjectWorkspace(null, null, null, null)
    getConfiguration.mockReturnValue({})
  })

  describe('resetInlineErrorDecorators()', () => {
    let sut: JestExt
    const editor: any = {
      document: { fileName: 'file.js' },
      setDecorations: jest.fn(),
    }
    const decorationType: any = { dispose: jest.fn() }

    beforeEach(() => {
      sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )

      sut.canUpdateActiveEditor = jest.fn().mockReturnValueOnce(true)
      sut.debugCodeLensProvider.didChange = jest.fn()
      ;(decorations.failingAssertionStyle as jest.Mock<{}>).mockReturnValue({})
      ;(sut.testResultProvider.getSortedResults as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      })
    })

    it('should initialize the cached decoration types as an empty array', () => {
      expect(sut.failingAssertionDecorators[editor.document.fileName]).toBeUndefined()
      sut.triggerUpdateActiveEditor(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([])
      expect(isOpenInMultipleEditors).not.toBeCalled()
    })

    it('should not clear the cached decorations types when the document is open more than once', () => {
      ;(isOpenInMultipleEditors as jest.Mock<{}>).mockReturnValueOnce(true)

      sut.failingAssertionDecorators[editor.document.fileName] = {
        forEach: jest.fn(),
      } as any
      sut.triggerUpdateActiveEditor(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName].forEach).not.toBeCalled()
    })

    it('should dispose of each cached decoration type', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType]
      sut.triggerUpdateActiveEditor(editor)

      expect(decorationType.dispose).toBeCalled()
    })

    it('should reset the cached decoration types', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType]
      sut.triggerUpdateActiveEditor(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([])
    })
  })

  describe('generateInlineErrorDecorator()', () => {
    it('should add the decoration type to the cache', () => {
      const settings: any = {
        debugCodeLens: {},
        enableInlineErrorMessages: true,
      }
      const sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
      const editor: any = {
        document: { fileName: 'file.js' },
        setDecorations: jest.fn(),
      }
      const expected = {}
      ;(decorations.failingAssertionStyle as jest.Mock<{}>).mockReturnValueOnce(expected)
      sut.canUpdateActiveEditor = jest.fn().mockReturnValueOnce(true)
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
      sut.triggerUpdateActiveEditor(editor)

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([expected])
    })
  })

  describe('runTest()', () => {
    const workspaceFolder = {} as any
    const fileName = 'fileName'
    const testNamePattern = 'testNamePattern'

    it('should run the supplied test', async () => {
      const startDebugging = debug.startDebugging as jest.Mock<Function>

      startDebugging.mockImplementation(async (_folder: any, nameOrConfig: any) => {
        // trigger fallback to default configuration
        if (typeof nameOrConfig === 'string') {
          throw null
        }
      })

      const debugConfiguration = { type: 'dummyconfig' }
      const sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
      ;(sut.debugConfigurationProvider.provideDebugConfigurations as jest.Mock<Function>).mockReturnValue([
        debugConfiguration,
      ])

      await sut.runTest(workspaceFolder, fileName, testNamePattern)

      expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration)

      const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1]
      expect(configuration).toBeDefined()
      expect(configuration.type).toBe('dummyconfig')

      expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(fileName, testNamePattern)
    })
  })

  describe('onDidCloseTextDocument()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null)
    const sut = new JestExt(
      null,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider
    )
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
    const sut = new JestExt(
      null,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider
    )
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
    const sut = new JestExt(
      null,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider
    )

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
    sut = new JestExt(
      null,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider
    )
    sut.triggerUpdateActiveEditor = jest.fn()

    beforeEach(() => {
      ;(sut.triggerUpdateActiveEditor as jest.Mock<{}>).mockReset()
    })

    it('should update the annotations when the editor has a document', () => {
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(true)
      sut.onDidChangeActiveTextEditor(editor)

      expect(sut.triggerUpdateActiveEditor).toBeCalledWith(editor)
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
      sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
    })

    function expectItTakesNoAction(event) {
      sut.removeCachedTestResults = jest.fn()
      sut.triggerUpdateActiveEditor = jest.fn()
      sut.onDidChangeTextDocument(event)

      expect(sut.removeCachedTestResults).not.toBeCalledWith(event.document)
      expect(sut.triggerUpdateActiveEditor).not.toBeCalled()
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
      sut.triggerUpdateActiveEditor = jest.fn()
      window.visibleTextEditors = [editor]
      sut.onDidChangeTextDocument(event)

      expect(sut.triggerUpdateActiveEditor).toBeCalledWith(editor)
    })
  })

  describe('toggleCoverageOverlay()', () => {
    it('should toggle the coverage overlay visibility', () => {
      const sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
      sut.toggleCoverageOverlay()

      expect(sut.coverageOverlay.toggleVisibility).toBeCalled()
    })
  })

  describe('triggerUpdateActiveEditor()', () => {
    beforeEach(() => {
      jest.resetAllMocks()
    })
    it('should update the coverage overlay in visible editors', () => {
      const editor: any = {}

      const sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
      sut.triggerUpdateActiveEditor(editor)

      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled()
    })
    it('should update both decorators and diagnostics for valid editor', () => {
      const sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
      sut.updateDecorators = jest.fn()
      const mockEditor: any = {
        document: { uri: { fsPath: 'file://a/b/c.ts' } },
      }
      ;(sut.testResultProvider.getSortedResults as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      })
      sut.triggerUpdateActiveEditor(mockEditor)

      expect(sut.updateDecorators).toBeCalled()
      expect(updateCurrentDiagnostics).toBeCalled()
    })
  })

  describe('canUpdateActiveEditor', () => {
    const mockTextEditor = (ext: string): any => {
      const extension = ext.length ? `.${ext}` : ''
      return {
        document: { uri: { fsPath: `file://a/b/c${extension}` } },
      }
    }

    let sut
    beforeEach(() => {
      jest.resetAllMocks()
      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )
    })
    it('will skip if there is no document in editor', () => {
      const editor: any = {}
      expect(sut.canUpdateActiveEditor(editor)).toBe(false)
    })
    it('can not update if file is being parsed', () => {
      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(true)
      sut.parsingTestFile = true
      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(false)
    })
    it('can only update if document is a typescript or javascript file', () => {
      expect(sut.canUpdateActiveEditor(mockTextEditor('json'))).toBe(false)
      expect(sut.canUpdateActiveEditor(mockTextEditor(''))).toBe(false)

      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(true)
      expect(sut.canUpdateActiveEditor(mockTextEditor('jsx'))).toBe(true)
      expect(sut.canUpdateActiveEditor(mockTextEditor('ts'))).toBe(true)
      expect(sut.canUpdateActiveEditor(mockTextEditor('tsx'))).toBe(true)
    })
  })
  describe('updateDecorators', () => {
    let sut: JestExt
    const mockEditor: any = { document: { uri: { fsPath: `file://a/b/c.js` } } }
    const emptyTestResults = { success: [], fail: [], skip: [], unknown: [] }

    const settings: any = {
      debugCodeLens: {},
      enableInlineErrorMessages: false,
    }

    const tr1 = {
      start: { line: 1, column: 0 },
    }
    const tr2 = {
      start: { line: 100, column: 0 },
    }

    beforeEach(() => {
      jest.resetAllMocks()
      ;(decorations.failingItName as jest.Mock<{}>).mockReturnValue({ key: 'fail' })
      ;(decorations.passingItName as jest.Mock<{}>).mockReturnValue({ key: 'pass' })
      ;(decorations.skipItName as jest.Mock<{}>).mockReturnValue({ key: 'skip' })
      ;(decorations.notRanItName as jest.Mock<{}>).mockReturnValue({ key: 'notRan' })

      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )

      mockEditor.setDecorations = jest.fn()
      sut.debugCodeLensProvider.didChange = jest.fn()
    })

    it('will reset decorator if testResults is empty', () => {
      sut.updateDecorators(emptyTestResults, mockEditor)
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4)
      for (const args of mockEditor.setDecorations.mock.calls) {
        expect(args[1].length).toBe(0)
      }
    })
    it('will generate dot dectorations for test results', () => {
      console.log('decorations.passingItName() = ', decorations.passingItName())

      const testResults2: any = { success: [tr1], fail: [tr2], skip: [], unknown: [] }
      sut.updateDecorators(testResults2, mockEditor)
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4)
      for (const args of mockEditor.setDecorations.mock.calls) {
        switch (args[0].key) {
          case 'fail':
          case 'pass':
            expect(args[1].length).toBe(1)
            break
          case 'skip':
          case 'notRan':
            expect(args[1].length).toBe(0)
            break
          default:
            expect(args[0].key).toBe('never be here')
        }
      }
    })

    it('will update inlineError decorator only if setting is enabled', () => {
      const testResults2: any = { success: [], fail: [tr1, tr2], skip: [], unknown: [] }
      const expected = {}
      ;(decorations.failingAssertionStyle as jest.Mock<{}>).mockReturnValueOnce(expected)
      sut.updateDecorators(testResults2, mockEditor)
      expect(decorations.failingAssertionStyle).not.toBeCalled()
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4)

      jest.clearAllMocks()
      settings.enableInlineErrorMessages = true
      sut.updateDecorators(testResults2, mockEditor)
      expect(decorations.failingAssertionStyle).toHaveBeenCalledTimes(2)
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(6)
    })
  })

  describe('detectedSnapshotErrors()', () => {
    let sut: JestExt
    const mockEditor: any = { document: { uri: { fsPath: `file://a/b/c.js` } } }

    const settings: any = {
      debugCodeLens: {},
      enableSnapshotUpdateMessages: true,
    }

    beforeEach(() => {
      jest.resetAllMocks()
      const projectWorkspace = new ProjectWorkspace(null, null, null, null)
      sut = new JestExt(
        null,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider
      )

      mockEditor.setDecorations = jest.fn()
      sut.debugCodeLensProvider.didChange = jest.fn()
    })

    it('will trigger snapshot update message when a snapshot test fails', () => {
      window.showInformationMessage = jest.fn(async () => null)
      const spy = jest.spyOn(sut as any, 'detectedSnapshotErrors')
      ;(sut as any).handleStdErr(new Error('Snapshot test failed'))
      ;(sut as any).handleStdErr(new Error('Snapshot failed'))
      ;(sut as any).handleStdErr(new Error('Failed for some other reason'))
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })
})
