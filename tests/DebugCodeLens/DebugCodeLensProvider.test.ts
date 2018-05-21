jest.unmock('../../src/DebugCodeLens/DebugCodeLensProvider')
jest.unmock('../../src/DebugCodeLens/DebugCodeLens')
jest.unmock('../../src/helpers')
jest.mock('path')

const rangeConstructor = jest.fn()
jest.mock('vscode', () => {
  class CodeLens {
    range: any

    constructor(range) {
      this.range = range
    }
  }

  class EventEmitter {
    fire() {}
  }

  class Position {
    lineNumber: string
    character: string

    constructor(lineNumber, character) {
      this.lineNumber = lineNumber
      this.character = character
    }
  }

  class Range {
    start: Position
    end: Position

    constructor(start, end) {
      rangeConstructor(...arguments)
      this.start = start
      this.end = end
    }
  }

  return {
    CodeLens,
    EventEmitter,
    Position,
    Range,
  }
})

import { DebugCodeLensProvider } from '../../src/DebugCodeLens/DebugCodeLensProvider'
import { TestResultProvider, TestResult, TestReconciliationState } from '../../src/TestResults'
import { DebugCodeLens } from '../../src/DebugCodeLens/DebugCodeLens'
import { extensionName } from '../../src/appGlobals'
import { basename } from 'path'
import * as vscode from 'vscode'
import { TestState } from '../../src/DebugCodeLens'

describe('DebugCodeLensProvider', () => {
  const testResultProvider = new TestResultProvider()
  const allTestStates = [TestState.Fail, TestState.Pass, TestState.Skip, TestState.Unknown]

  describe('constructor()', () => {
    it('should set the test result provider', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)

      expect(sut.testResultProvider).toBe(testResultProvider)
    })

    it('should set which test states to show the CodeLens above', () => {
      expect(new DebugCodeLensProvider(testResultProvider, allTestStates).showWhenTestStateIn).toBe(allTestStates)

      const none = []
      expect(new DebugCodeLensProvider(testResultProvider, none).showWhenTestStateIn).toBe(none)
    })

    it('should initialize the onChange event emitter', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)

      expect(sut.onDidChange).toBeInstanceOf(vscode.EventEmitter)
    })
  })

  describe('showWhenTestStateIn', () => {
    describe('get', () => {
      it('should return which test states to show the CodeLens above', () => {
        for (const states of [[], allTestStates]) {
          const sut = new DebugCodeLensProvider(testResultProvider, states)
          expect(sut.showWhenTestStateIn).toBe(states)
        }
      })
    })

    describe('set', () => {
      it('should set which test states to show the CodeLens above', () => {
        const sut = new DebugCodeLensProvider(testResultProvider, [])
        sut.showWhenTestStateIn = allTestStates

        expect(sut.showWhenTestStateIn).toBe(allTestStates)
      })

      it('should fire an onDidChange event', () => {
        const sut = new DebugCodeLensProvider(testResultProvider, [])
        sut.onDidChange.fire = jest.fn()
        sut.showWhenTestStateIn = allTestStates

        expect(sut.onDidChange.fire).toBeCalled()
      })
    })
  })

  describe('onDidChangeCodeLenses', () => {
    it('should return the onDidChange event', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      const expected = {} as any
      sut.onDidChange.event = expected

      expect(sut.onDidChangeCodeLenses).toBe(expected)
    })
  })

  describe('provideCodeLenses()', () => {
    const document = { fileName: 'file.js' } as any
    const token = {} as any
    const getResults = testResultProvider.getResults as jest.Mock<Function>
    const testResults = [
      {
        name: 'should fail',
        start: {
          line: 1,
          column: 2,
        },
        end: {
          line: 3,
          column: 4,
        },
        status: TestReconciliationState.KnownFail,
      } as TestResult,
    ]

    it('should return an empty array when the provider is disabled', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, [])

      expect(sut.provideCodeLenses(document, token)).toEqual([])
    })

    it('should return an empty array when the document is untitled', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      const untitled = { isUntitled: true } as any

      expect(sut.provideCodeLenses(untitled, token)).toEqual([])
    })

    it('should get the test results for the current document', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      getResults.mockReturnValueOnce([])
      sut.provideCodeLenses(document, token)

      expect(testResultProvider.getResults).toBeCalledWith(document.fileName)
    })

    it('should not show the CodeLens above failing tests unless configured', () => {
      const testStates = allTestStates.filter(s => s !== TestState.Fail)
      const status = TestReconciliationState.KnownFail
      const sut = new DebugCodeLensProvider(testResultProvider, testStates)
      getResults.mockReturnValueOnce([{ status }])

      expect(sut.provideCodeLenses(document, token)).toEqual([])
    })

    it('should not show the CodeLens above passing tests unless configured', () => {
      const testStates = allTestStates.filter(s => s !== TestState.Pass)
      const status = TestReconciliationState.KnownSuccess
      const sut = new DebugCodeLensProvider(testResultProvider, testStates)
      getResults.mockReturnValueOnce([{ status }])

      expect(sut.provideCodeLenses(document, token)).toEqual([])
    })
    it('should not show the CodeLens above skipped tests unless configured', () => {
      const testStates = allTestStates.filter(s => s !== TestState.Skip)
      const status = TestReconciliationState.KnownSkip
      const sut = new DebugCodeLensProvider(testResultProvider, testStates)
      getResults.mockReturnValueOnce([{ status }])

      expect(sut.provideCodeLenses(document, token)).toEqual([])
    })
    it('should not show the CodeLens above unknown tests unless configured', () => {
      const testStates = allTestStates.filter(s => s !== TestState.Unknown)
      const status = TestReconciliationState.Unknown
      const sut = new DebugCodeLensProvider(testResultProvider, testStates)
      getResults.mockReturnValueOnce([{ status }])

      expect(sut.provideCodeLenses(document, token)).toEqual([])
    })

    it('should create the CodeLens at the start of the `test`/`it` block', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      getResults.mockReturnValueOnce(testResults)
      const actual = sut.provideCodeLenses(document, token)

      expect(actual).toHaveLength(1)
      expect(actual[0].range.start).toEqual({
        lineNumber: 1,
        character: 2,
      })
      expect(actual[0].range.end).toEqual({
        lineNumber: 3,
        character: 2 + 5,
      })
    })

    it('should create the CodeLens specifying the document filename', () => {
      const expected = 'expected'
      ;(basename as jest.Mock<Function>).mockReturnValueOnce(expected)
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      getResults.mockReturnValueOnce(testResults)
      const actual = sut.provideCodeLenses(document, token)

      expect(actual).toHaveLength(1)
      expect((<DebugCodeLens>actual[0]).fileName).toBe(expected)
    })

    it('should create the CodeLens specifying the test name', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      getResults.mockReturnValueOnce(testResults)
      const actual = sut.provideCodeLenses(document, token)

      expect(actual).toHaveLength(1)
      expect((<DebugCodeLens>actual[0]).testName).toBe(testResults[0].name)
    })
  })

  describe('resolveCodeLenses()', () => {
    it('should add the command to a DebugCodeLenses', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      const range = {} as any
      const fileName = 'fileName'
      const testName = 'testName'
      const codeLens = new DebugCodeLens(range, fileName, testName)
      const token = {} as any
      sut.resolveCodeLens(codeLens, token)

      expect(codeLens.command).toEqual({
        arguments: [fileName, testName],
        command: `${extensionName}.run-test`,
        title: 'Debug',
      })
    })

    it('should escape testName for regex', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
      const range = {} as any
      const fileName = 'fileName'
      const testName = 'testName()'
      const codeLens = new DebugCodeLens(range, fileName, testName)
      const token = {} as any
      sut.resolveCodeLens(codeLens, token)

      expect(codeLens.command).toEqual({
        arguments: [fileName, 'testName\\(\\)'],
        command: `${extensionName}.run-test`,
        title: 'Debug',
      })
    })

    it('should leave other CodeLenses unchanged', () => {
      const sut = new DebugCodeLensProvider(testResultProvider, [])
      const codeLens = {} as any
      const token = {} as any
      sut.resolveCodeLens(codeLens, token)

      expect(codeLens.command).toBeUndefined()
    })
  })

  describe('didChange()', () => {
    const sut = new DebugCodeLensProvider(testResultProvider, allTestStates)
    sut.onDidChange.fire = jest.fn()
    sut.didChange()

    expect(sut.onDidChange.fire).toBeCalled()
  })
})
