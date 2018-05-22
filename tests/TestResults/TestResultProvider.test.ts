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

    it('should look up the test result by line number', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      const assertionC = Object.assign({}, assertion)
      assertionC.title = 'xxx'
      assertionsForTestFile.mockReturnValueOnce([assertionC])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].name).toBe(testBlock.name)
      expect(actual[0].status).toBe(assertionC.status)
      expect(actual[0].shortMessage).toBe(assertionC.shortMessage)
      expect(actual[0].terseMessage).toBe(assertionC.terseMessage)
      expect(actual[0].lineNumberOfError).toEqual(assertionC.line - 1)
    })

    it('should look up the test result by test name', () => {
      const sut = new TestResultProvider()
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      const assertionC = Object.assign({}, assertion)
      assertionC.line = undefined
      assertionsForTestFile.mockReturnValueOnce([assertionC])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].name).toBe(testBlock.name)
      expect(actual[0].status).toBe(assertionC.status)
      expect(actual[0].shortMessage).toBe(assertionC.shortMessage)
      expect(actual[0].terseMessage).toBe(assertionC.terseMessage)
      expect(actual[0].lineNumberOfError).toEqual(testBlock.end.line - 1)
      expect(actual[0].start).toEqual({
        line: testBlock.start.line - 1,
        column: testBlock.start.column - 1,
      })
      expect(actual[0].end).toEqual({
        line: testBlock.end.line - 1,
        column: testBlock.end.column - 1,
      })
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
    })
    it('should handle duplicate test names', () => {
      const sut = new TestResultProvider()
      const testBlock2 = Object.assign({}, testBlock, {
        start: {
          line: 5,
          column: 3,
        },
        end: {
          line: 7,
          column: 5,
        },
      })
      ;(parseTest as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock, testBlock2],
      })
      assertionsForTestFile.mockReturnValueOnce([
        assertion,
        {
          title: testBlock.name,
          status: TestReconciliationState.KnownSuccess,
        },
      ])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(2)
      expect(actual[0].status).toBe(TestReconciliationState.KnownFail)
      expect(actual[1].status).toBe(TestReconciliationState.KnownSuccess)
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
    it('should reset the cache', () => {
      const sut = new TestResultProvider()
      const results: any = {}
      sut.resetCache = jest.fn()
      sut.updateTestResults(results)

      expect(sut.resetCache).toBeCalled()
    })

    it('should update the cached file status', () => {
      const expected: any = {}
      updateFileWithJestStatus.mockReturnValueOnce(expected)

      const sut = new TestResultProvider()
      const results: any = {}

      expect(sut.updateTestResults(results)).toBe(expected)
      expect(updateFileWithJestStatus).toBeCalledWith(results)
    })
  })
})
