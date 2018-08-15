import { TestReconciliationState } from './TestReconciliationState'
import { JestTotalResults } from 'jest-editor-support'
import { JestFileResults } from 'jest-editor-support'
import { FileCoverage } from 'istanbul-lib-coverage'
import * as path from 'path'

type Position = {
  /** Zero-based column number */
  column: number

  /** Zero-based line number */
  line: number
}

export type TestResult = {
  name: string
  start: Position
  end: Position

  status: TestReconciliationState
  shortMessage?: string
  terseMessage?: string

  /** Zero-based line number */
  lineNumberOfError?: number
}

/**
 * Normalize file paths on Windows systems to use lowercase drive letters.
 * This follows the standard used by Visual Studio Code for URIs which includes
 * the document fileName property.
 *
 * @param data Parsed JSON results
 */
export function resultsWithLowerCaseWindowsDriveLetters(data: JestTotalResults) {
  if (path.sep === '\\') {
    return {
      ...data,
      coverageMap: coverageMapWithLowerCaseWindowsDriveLetters(data),
      testResults: testResultsWithLowerCaseWindowsDriveLetters(data.testResults),
    }
  }

  return data
}

export function coverageMapWithLowerCaseWindowsDriveLetters(data: JestTotalResults) {
  if (!data.coverageMap) {
    return
  }

  const result = {}
  const filePaths = Object.keys(data.coverageMap)
  for (const filePath of filePaths) {
    const newFileCoverage = fileCoverageWithLowerCaseWindowsDriveLetter(data.coverageMap[filePath])
    result[newFileCoverage.path] = newFileCoverage
  }

  return result
}

function fileCoverageWithLowerCaseWindowsDriveLetter(fileCoverage: FileCoverage) {
  const newFilePath = withNormalizedWindowsPath(fileCoverage.path)
  if (newFilePath) {
    return {
      ...fileCoverage,
      path: newFilePath,
    }
  }

  return fileCoverage
}

export function testResultsWithLowerCaseWindowsDriveLetters(
  testResults: Array<JestFileResults>
): Array<JestFileResults> {
  if (!testResults) {
    return testResults
  }

  return testResults.map(testResultWithLowerCaseWindowsDriveLetter)
}

function testResultWithLowerCaseWindowsDriveLetter(testResult: JestFileResults): JestFileResults {
  const newFilePath = withNormalizedWindowsPath(testResult.name)
  if (newFilePath) {
    return {
      ...testResult,
      name: newFilePath,
    }
  }

  return testResult
}

export function withNormalizedWindowsPath(filePath: string, platform = process.platform): string | undefined {
  if (platform === 'win32') {
    filePath = convertWSLPathToWindows(filePath)
  }

  const match = filePath.match(/^([A-Z]:\\)(.*)$/)
  if (match) {
    return `${match[1].toLowerCase()}${match[2]}`
  }
  return filePath
}

function convertWSLPathToWindows(filePath: string) {
  const isLinuxPath = filePath.match(/^\/mnt\/(\w)\/(.*)$/)
  if (isLinuxPath) {
    const normalizedPath = isLinuxPath[2].split(path.posix.sep).join(path.win32.sep)
    const driveLetter = `${isLinuxPath[1]}:\\`
    filePath = `${driveLetter}${normalizedPath}`
  }
  return filePath
}
