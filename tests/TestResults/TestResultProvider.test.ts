jest.unmock('../../src/TestResults/TestResultProvider')

const updateFileWithJestStatus = jest.fn()
const assertionsForTestFile = jest.fn()
jest.mock('jest-editor-support', () => {
  class TestReconciler {
    assertionsForTestFile: Function
    updateFileWithJestStatus: Function

    constructor() {
      this.assertionsForTestFile = assertionsForTestFile
      this.updateFileWithJestStatus = updateFileWithJestStatus
    }
  }
  const parse = jest.fn()

  return { TestReconciler, parse }
})

const pathProperties = {
  sep: jest.fn(),
}
jest.mock('path', () => {
  const path = {}

  Object.defineProperty(path, 'sep', {
    get: () => pathProperties.sep(),
  })

  return path
})

import { TestResultProvider } from '../../src/TestResults/TestResultProvider'
import { TestReconciliationState } from '../../src/TestResults'
import { parseTest } from '../../src/TestParser'

describe('TestResultProvider', () => {
  describe('getResults()', () => {
    const filePath = 'file.js'
    const testBlock = {
      name: 'test name',
      start: {
        line: 2,
        column: 3,
      },
      end: {
        line: 4,
        column: 5,
      },
    }
    const assertion = {
      title: testBlock.name,
      status: TestReconciliationState.KnownFail,
      terseMessage: 'terseMessage',
      shortMessage: 'shortMesage',
      line: 3,
    }

    it('should return the cached results if possible', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [],
      })
      assertionsForTestFile.mockReturnValueOnce([])
      const expected = sut.getResults(filePath)

      expect(sut.getResults(filePath)).toBe(expected)
    })

    it('should re-index the line and column number to zero-based', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      assertionsForTestFile.mockReturnValueOnce([assertion])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].lineNumberOfError).toBe(assertion.line - 1)
      expect(actual[0].start).toEqual({
        line: testBlock.start.line - 1,
        column: testBlock.start.column - 1,
      })
      expect(actual[0].end).toEqual({
        line: testBlock.end.line - 1,
        column: testBlock.end.column - 1,
      })
    })

    it('should look up the test result by test name', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      assertionsForTestFile.mockReturnValueOnce([assertion])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].name).toBe(testBlock.name)
      expect(actual[0].status).toBe(assertion.status)
      expect(actual[0].shortMessage).toBe(assertion.shortMessage)
      expect(actual[0].terseMessage).toBe(assertion.terseMessage)
    })

    it('should use default values for unmatched assertions', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      assertionsForTestFile.mockReturnValueOnce([])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].status).toBe(TestReconciliationState.Unknown)
      expect(actual[0].shortMessage).toBeUndefined()
      expect(actual[0].terseMessage).toBeUndefined()
      expect(actual[0].lineNumberOfError).toBeUndefined()
    })
  })

  describe('getSortedResults()', () => {
    const filePath = 'file.js'

    it('should return cached results if possible', () => {
      const sut = new TestResultProvider()
      sut.getResults = jest.fn().mockReturnValueOnce([])
      const expected = sut.getSortedResults(filePath)

      expect(sut.getSortedResults(filePath)).toBe(expected)
    })

    it('should return the sorted test results', () => {
      const sut = new TestResultProvider()
      sut.getResults = jest
        .fn()
        .mockReturnValueOnce([
          { status: TestReconciliationState.KnownFail },
          { status: TestReconciliationState.KnownSkip },
          { status: TestReconciliationState.KnownSuccess },
          { status: TestReconciliationState.Unknown },
        ])
      expect(sut.getSortedResults(filePath)).toEqual({
        fail: [{ status: TestReconciliationState.KnownFail }],
        skip: [{ status: TestReconciliationState.KnownSkip }],
        success: [{ status: TestReconciliationState.KnownSuccess }],
        unknown: [{ status: TestReconciliationState.Unknown }],
      })
    })
  })

  describe('updateTestResults()', () => {
    afterEach(() => pathProperties.sep.mockReset())

    it('should update the cached file status', () => {
      const sut = new TestResultProvider()
      const results: any = {}
      sut.updateTestResults(results)

      expect(updateFileWithJestStatus).toBeCalledWith(results)
    })

    it('should test file paths to use lowercase drive letters on Windows', () => {
      pathProperties.sep.mockReturnValue('\\')

      const sut = new TestResultProvider()
      const results: any = {
        testResults: [{ name: 'relative.js' }, { name: 'c:\\stays-lowercase' }, { name: 'D:\\changes-case' }],
      }
      sut.updateTestResults(results)

      expect(updateFileWithJestStatus).toBeCalledWith({
        testResults: [{ name: 'relative.js' }, { name: 'c:\\stays-lowercase' }, { name: 'd:\\changes-case' }],
      })
    })
  })
})
