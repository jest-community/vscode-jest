jest.unmock('../../src/TestResults/TestResultProvider')

const updateFileWithJestStatus = jest.fn()
const assertionsForTestFile = jest.fn()
jest.mock('jest-editor-support', () => {
  class TestReconciler {
    assertionsForTestFile: jest.Mock
    updateFileWithJestStatus: jest.Mock

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

    beforeEach(() => {
      jest.resetAllMocks()
    })

    it('should return the cached results if possible', () => {
      const sut = new TestResultProvider()
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [],
      })
      assertionsForTestFile.mockReturnValueOnce([])
      const expected = sut.getResults(filePath)

      expect(sut.getResults(filePath)).toBe(expected)
    })

    it('should re-index the line and column number to zero-based', () => {
      const sut = new TestResultProvider()
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
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

    it('should look up the test result by line number only if the name matches', () => {
      const sut = new TestResultProvider()
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      const assertionC = { ...assertion }
      assertionC.title = 'xxx'
      assertionsForTestFile.mockReturnValueOnce([assertionC])
      const actual = sut.getResults(filePath)
      expect(actual).toHaveLength(1)
      expect(actual[0].status).toBe(TestReconciliationState.Unknown)
    })

    it('should look up the test result by test name', () => {
      const sut = new TestResultProvider()
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      const assertionC = { ...assertion }
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
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock],
      })
      assertionsForTestFile.mockReturnValueOnce([])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(1)
      expect(actual[0].status).toBe(TestReconciliationState.Unknown)
      expect(actual[0].shortMessage).toBeUndefined()
      expect(actual[0].terseMessage).toBeUndefined()
    })
    describe('duplicate test names', () => {
      const testBlock2 = {
        ...testBlock,
        start: {
          line: 5,
          column: 3,
        },
        end: {
          line: 7,
          column: 5,
        },
      }
      const testBlock3 = {
        ...testBlock,
        start: {
          line: 20,
          column: 3,
        },
        end: {
          line: 25,
          column: 5,
        },
      }
      beforeEach(() => {})
      it('can resolve by matching error line', () => {
        ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
          itBlocks: [testBlock, testBlock2],
        })

        const sut = new TestResultProvider()
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
      it('can resolve even if these tests pass, i.e. no line number', () => {
        ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
          itBlocks: [testBlock2, testBlock3],
        })

        const sut = new TestResultProvider()
        assertionsForTestFile.mockReturnValueOnce([
          {
            title: testBlock.name,
            status: TestReconciliationState.KnownSuccess,
          },
          {
            title: testBlock.name,
            status: TestReconciliationState.KnownSuccess,
            location: { colum: 3, line: 22 },
          },
        ])
        const actual = sut.getResults(filePath)

        expect(actual).toHaveLength(2)
        expect(actual.every(r => r.status === TestReconciliationState.KnownSuccess)).toEqual(true)
      })
      it('default to unknown if failed to match by line or location', () => {
        ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
          itBlocks: [testBlock2, testBlock3],
        })

        const sut = new TestResultProvider()
        assertionsForTestFile.mockReturnValueOnce([
          {
            title: testBlock.name,
            status: TestReconciliationState.KnownSuccess,
          },
          {
            title: testBlock.name,
            status: TestReconciliationState.KnownSuccess,
          },
        ])
        const actual = sut.getResults(filePath)

        expect(actual).toHaveLength(2)
        expect(actual.every(r => r.status === TestReconciliationState.Unknown)).toEqual(true)
        expect(actual.every(r => r.shortMessage && r.shortMessage.includes('duplicate test names'))).toEqual(true)
      })
    })
    it('should only mark error line number if it is within the right itBlock', () => {
      const sut = new TestResultProvider()
      const testBlock2 = {
        name: 'test2',
        start: {
          line: 5,
          column: 3,
        },
        end: {
          line: 7,
          column: 5,
        },
      }
      ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        itBlocks: [testBlock, testBlock2],
      })
      assertionsForTestFile.mockReturnValueOnce([
        {
          title: testBlock2.name,
          status: TestReconciliationState.KnownSuccess,
          line: 3,
        },
      ])
      const actual = sut.getResults(filePath)

      expect(actual).toHaveLength(2)
      expect(actual.some(a => a.name === testBlock.name && a.status === TestReconciliationState.Unknown)).toEqual(true)
      expect(
        actual.some(
          a =>
            a.name === testBlock2.name &&
            a.status === TestReconciliationState.KnownSuccess &&
            a.lineNumberOfError === testBlock2.end.line - 1
        )
      ).toEqual(true)
    })

    describe('template literal handling', () => {
      const testBlock2 = {
        ...testBlock,
        // tslint:disable-next-line no-invalid-template-strings
        name: 'template literal ${num}',
        start: {
          line: 5,
          column: 3,
        },
        end: {
          line: 7,
          column: 5,
        },
      }
      const useTests = (itBlocks = [testBlock, testBlock2]) => {
        ;((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
          itBlocks,
        })
      }
      beforeEach(() => {
        jest.resetAllMocks()
      })
      it(`find test by assertion error line`, () => {
        const sut = new TestResultProvider()

        useTests()
        assertionsForTestFile.mockReturnValueOnce([
          {
            title: 'template literal 2',
            status: TestReconciliationState.KnownFail,
            line: 6,
          },
        ])
        const actual = sut.getResults(filePath)

        expect(actual).toHaveLength(2)
        expect(actual.some(a => a.status === TestReconciliationState.Unknown && a.name === testBlock.name)).toEqual(
          true
        )
        expect(actual.some(a => a.status === TestReconciliationState.KnownFail && a.name === testBlock2.name)).toEqual(
          true
        )
      })
      it(`find test by assertion location`, () => {
        const sut = new TestResultProvider()

        useTests()
        assertionsForTestFile.mockReturnValueOnce([
          {
            title: 'template literal 2',
            status: TestReconciliationState.KnownSuccess,
            location: { colum: 3, line: 6 },
          },
        ])
        const actual = sut.getResults(filePath)

        expect(actual).toHaveLength(2)
        expect(actual.some(a => a.status === TestReconciliationState.Unknown && a.name === testBlock.name)).toEqual(
          true
        )
        expect(
          actual.some(a => a.status === TestReconciliationState.KnownSuccess && a.name === testBlock2.name)
        ).toEqual(true)
      })
      it(`find test by partial name match`, () => {
        const sut = new TestResultProvider()
        useTests()

        assertionsForTestFile.mockReturnValueOnce([
          {
            title: 'template literals ok',
            status: TestReconciliationState.KnownFail,
          },
          {
            title: 'template literal 2',
            status: TestReconciliationState.KnownSuccess,
          },
        ])
        const actual = sut.getResults(filePath)
        expect(actual).toHaveLength(2)
        expect(actual.some(a => a.status === TestReconciliationState.Unknown && a.name === testBlock.name)).toEqual(
          true
        )
        expect(
          actual.some(a => a.status === TestReconciliationState.KnownSuccess && a.name === testBlock2.name)
        ).toEqual(true)
      })
      it(`multiple template literals`, () => {
        const sut = new TestResultProvider()
        // tslint:disable-next-line: no-invalid-template-strings
        const testBlock3 = { ...testBlock2, name: 'template literal ${i}, ${k}: {something}' }
        useTests([testBlock3, testBlock2])
        assertionsForTestFile.mockReturnValueOnce([
          {
            title: 'template literal I got something like this',
            status: TestReconciliationState.KnownFail,
          },
          {
            title: 'template literal 1, 2: {something}',
            status: TestReconciliationState.KnownSuccess,
          },
        ])
        const actual = sut.getResults(filePath)
        expect(actual).toHaveLength(2)
        expect(
          actual.some(a => a.status === TestReconciliationState.KnownSuccess && a.name === testBlock3.name)
        ).toEqual(true)
        expect(actual.some(a => a.status === TestReconciliationState.KnownFail && a.name === testBlock2.name)).toEqual(
          true
        )
      })

      describe('when match failed', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        beforeEach(() => {
          jest.resetAllMocks()
          useTests([testBlock2])
          assertionsForTestFile.mockReturnValueOnce([
            {
              title: 'template literals 2',
              status: TestReconciliationState.KnownSuccess,
            },
          ])
        })

        it(`will report error`, () => {
          const sut = new TestResultProvider()
          const actual = sut.getResults(filePath)

          expect(actual).toHaveLength(1)
          expect(actual[0].status).toBe(TestReconciliationState.Unknown)
          expect(actual[0].shortMessage).not.toBeUndefined()
          expect(consoleSpy).not.toHaveBeenCalled()
        })
        it('will also output to console in verbose mode', () => {
          const sut = new TestResultProvider(true)
          const actual = sut.getResults(filePath)

          expect(actual).toHaveLength(1)
          expect(actual[0].status).toBe(TestReconciliationState.Unknown)
          expect(actual[0].shortMessage).not.toBeUndefined()
          expect(consoleSpy).toHaveBeenCalled()
        })
      })
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
