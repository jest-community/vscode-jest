jest.unmock('../../src/TestResults/TestResult')
jest.mock('path', () => ({
  sep: require.requireActual('path').sep,
  win32: require.requireActual('path').win32,
}))
jest.mock('wsl-path', () => ({
  wslToWindowsSync: path => {
    return path.replace(/\/mnt\/c\//, 'C:\\')
  },
}))

import {
  resultsWithLowerCaseWindowsDriveLetters,
  coverageMapWithLowerCaseWindowsDriveLetters,
  testResultsWithLowerCaseWindowsDriveLetters,
  withLowerCaseWindowsDriveLetter,
  translateWslPathsToWindowsPaths,
} from '../../src/TestResults/TestResult'
import * as path from 'path'
import { JestTotalResults } from 'jest-editor-support'

describe('TestResult', () => {
  describe('translateWslPathsToWindowsPaths', () => {
    it('should translate testresults from posix to windows paths', () => {
      const result = translateWslPathsToWindowsPaths({
        testResults: [{ name: '/mnt/c/file1' }, { name: '/mnt/c/file2' }],
      } as MockedTestResult)

      expect(result.testResults[0].name).toEqual('C:\\file1')
      expect(result.testResults[1].name).toEqual('C:\\file2')
    })

    it('should translate coverage maps from posi to windows paths', () => {
      const result = translateWslPathsToWindowsPaths({
        coverageMap: {
          '/mnt/c/file1': { path: '/mnt/c/file1' },
          '/mnt/c/file2': { path: '/mnt/c/file2' },
        },
      } as MockedTestResult)

      expect(result.coverageMap['C:\\file1'].path).toEqual('C:\\file1')
      expect(result.coverageMap['C:\\file2'].path).toEqual('C:\\file2')
    })
  })

  describe('resultsWithLowerCaseWindowsDriveLetters', () => {
    describe('on POSIX systems', () => {
      it('should return the results unchanged', () => {
        ;(path as any).sep = '/'
        const expected: any = {}

        expect(resultsWithLowerCaseWindowsDriveLetters(expected)).toBe(expected)
      })
    })

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

type MockedTestResult = JestTotalResults | any
