jest.unmock('../src/TestResultProvider')

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

import { TestResultProvider } from '../src/TestResultProvider'
import { TestReconciliationState } from '../src/TestReconciliationState'
import { parseTest } from '../src/TestParser'
import * as path from 'path'

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
      sut.getAssertions = jest.fn().mockReturnValueOnce([])
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

  describe('getAssertions()', () => {
    it('should get the assertions for a test file', () => {
      const expected = 'file.js'
      const sut = new TestResultProvider()
      sut.getAssertions(expected)

      expect(assertionsForTestFile).toBeCalledWith(expected)
    })

    it('should use an uppercase drive letter for Windows paths', () => {
      pathProperties.sep.mockReturnValueOnce('\\')

      const sut = new TestResultProvider()
      sut.getAssertions('d:\\filePath')

      expect(assertionsForTestFile).toBeCalledWith(`D:\\filePath`)
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
    it('should update the cached file status', () => {
      const sut = new TestResultProvider()
      const results = {} as any
      sut.updateTestResults(results)

      expect(updateFileWithJestStatus).toBeCalledWith(results)
    })
  })
})
