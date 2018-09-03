import { TestReconciliationState } from './TestReconciliationState'
import { JestTotalResults } from 'jest-editor-support'
import { JestFileResults } from 'jest-editor-support'
import { FileCoverage } from 'istanbul-lib-coverage'
import { wslToWindowsSync } from 'wsl-path'
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
 * Return a rewritten copy of {@see JestTotalResults} that have been executed in Windows Subsystem
 * for Linux to  Windows file paths, so vscode (that runs in windows) can find them
 * @param data The test original resuls results
 */
export function translateWslPathsToWindowsPaths(data: JestTotalResults): JestTotalResults {
  return {
    ...data,
    coverageMap: translateWslPathCoverateToWindowsPaths(data.coverageMap),
    testResults: translateWslTestResultsToWindowsPaths(data.testResults),
  }
}

/**
 * Return a rewritten copy a coverage map created by a jest run in wsl. All POSIX paths
 * are rewritten to Windows paths, so vscode-jest running in windows can map the coverage.
 *
 * @param coverageMap The coverage map to rewrite
 */
function translateWslPathCoverateToWindowsPaths(coverageMap: {
  [key: string]: FileCoverage
}): { [key: string]: FileCoverage } {
  if (!coverageMap) {
    return coverageMap
  }
  const result = {}
  Object.keys(coverageMap).forEach(key => {
    const translatedPath = wslToWindowsSync(key)
    const entry = { ...coverageMap[key], path: translatedPath }
    result[translatedPath] = entry
  })
  return result
}

/**
  * Return a rewritten copy a {@see JestFileResults} array created by a jest run in wsl. All POSIX paths
  * are rewritten to Windows paths, so vscode-jest running in windows can map the test
  * status.
  *
 * @param testResults the TestResults to rewrite
 */
function translateWslTestResultsToWindowsPaths(testResults: JestFileResults[]) {
  if (!testResults) {
    return testResults
  }
  return testResults.map(result => {
    return { ...result, name: wslToWindowsSync(result.name) }
  })
}

/**
 * Normalize file paths on Windows systems to use lowercase drive letters.
 * This follows the standard used by Visual Studio Code for URIs which includes
 * the document fileName property.
 *
 * @param data Parsed JSON results
 */
export function resultsWithLowerCaseWindowsDriveLetters(data: JestTotalResults) {
  if (path.sep === path.win32.sep) {
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
  const newFilePath = withLowerCaseWindowsDriveLetter(fileCoverage.path)
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
  const newFilePath = withLowerCaseWindowsDriveLetter(testResult.name)
  if (newFilePath) {
    return {
      ...testResult,
      name: newFilePath,
    }
  }

  return testResult
}

export function withLowerCaseWindowsDriveLetter(filePath: string): string | undefined {
  const match = filePath.match(/^([A-Z]:\\)(.*)$/)
  if (match) {
    return `${match[1].toLowerCase()}${match[2]}`
  }
}
