jest.unmock('../../src/TestResults/TestResult')
jest.mock('path', () => ({ sep: require.requireActual('path').sep }))

import {
  resultsWithLowerCaseWindowsDriveLetters,
  coverageMapWithLowerCaseWindowsDriveLetters,
  testResultsWithLowerCaseWindowsDriveLetters,
  withLowerCaseWindowsDriveLetter,
} from '../../src/TestResults/TestResult'
import * as path from 'path'

describe('TestResult', () => {
  describe('resultsWithLowerCaseWindowsDriveLetters', () => {
    describe('on POSIX systems', () => {
      it('should return the results unchanged', () => {
        ;(path as any).sep = '/'
        const expected: any = {}

        expect(resultsWithLowerCaseWindowsDriveLetters(expected)).toBe(expected)
      })
    })

    // tslint:disable no-shadowed-variable
    describe('on Windows systems', () => {
      beforeEach(() => {
        jest.doMock('../../src/TestResults/TestResult', () => ({
          ...require.requireActual('../../src/TestResults/TestResult'),
          coverageMapWithLowerCaseWindowsDriveLetters: jest.fn(),
          testResultsWithLowerCaseWindowsDriveLetters: jest.fn(),
        }))
        ;(path as any).sep = '\\'
      })

      it('should normalize paths in the coverage map', () => {
        const {
          resultsWithLowerCaseWindowsDriveLetters,
          coverageMapWithLowerCaseWindowsDriveLetters,
        } = require('../../src/TestResults/TestResult')
        const expected = {}
        coverageMapWithLowerCaseWindowsDriveLetters.mockReturnValueOnce(expected)

        const data: any = { coverageMap: {} }
        expect(resultsWithLowerCaseWindowsDriveLetters(data)).toEqual({
          coverageMap: expected,
        })
      })

      it('should normalize paths in the test results', () => {
        const {
          resultsWithLowerCaseWindowsDriveLetters,
          testResultsWithLowerCaseWindowsDriveLetters,
        } = require('../../src/TestResults/TestResult')
        const expected = {}
        testResultsWithLowerCaseWindowsDriveLetters.mockReturnValueOnce(expected)

        const data: any = { coverageMap: {} }
        expect(resultsWithLowerCaseWindowsDriveLetters(data)).toEqual({
          coverageMap: expected,
        })
      })
    })
  })

  describe('testResultsWithLowerCaseWindowsDriveLetters', () => {
    it('should return nothing the test results when the results are undefined', () => {
      const testResults: any = undefined
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toBeUndefined()
    })

    it('should return the test results when no tests were run', () => {
      const testResults: any = []
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toEqual(testResults)
    })

    it('should normalizes paths in the test results when provided', () => {
      const testResults: any = [{ name: 'c:\\drive\\is\\lowercase' }, { name: 'D:\\drive\\is\\uppercase' }]
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toEqual([
        { name: 'c:\\drive\\is\\lowercase' },
        { name: 'd:\\drive\\is\\uppercase' },
      ])
    })
  })

  describe('coverageMapWithLowerCaseWindowsDriveLetters', () => {
    it('should return nothing when coverage was not collected', () => {
      const data: any = {}
      expect(coverageMapWithLowerCaseWindowsDriveLetters(data)).toBeUndefined()
    })

    it('should normalizes paths in the coverage map when collected', () => {
      const data: any = {
        coverageMap: {
          'c:\\drive\\is\\lowercase': {
            path: 'c:\\drive\\is\\lowercase',
            property: {},
          },
          'D:\\drive\\is\\uppercase': {
            path: 'D:\\drive\\is\\uppercase',
            property: {},
          },
        },
      }
      expect(coverageMapWithLowerCaseWindowsDriveLetters(data)).toEqual({
        'c:\\drive\\is\\lowercase': {
          path: 'c:\\drive\\is\\lowercase',
          property: {},
        },
        'd:\\drive\\is\\uppercase': {
          path: 'd:\\drive\\is\\uppercase',
          property: {},
        },
      })
    })
  })

  describe('withLowerCaseDriveLetter', () => {
    it('should return a new file path when provided a path with an upper case drive letter', () => {
      const filePath = 'C:\\path\\file.ext'
      expect(withLowerCaseWindowsDriveLetter(filePath)).toBe('c:\\path\\file.ext')
    })

    it('should indicate no change is required otherwise', () => {
      const filePath = 'c:\\path\\file.ext'
      expect(withLowerCaseWindowsDriveLetter(filePath)).toBeUndefined()
    })
  })
})
