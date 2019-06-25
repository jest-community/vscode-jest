import { TestReconciliationState } from './TestReconciliationState'
import { JestFileResults, JestTotalResults } from 'jest-editor-support'
import { FileCoverage } from 'istanbul-lib-coverage'
import * as path from 'path'

interface Position {
  /** Zero-based column number */
  column: number

  /** Zero-based line number */
  line: number
}

export interface TestResult {
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
  const newFilePath = withLowerCaseWindowsDriveLetter(fileCoverage.path)
  if (newFilePath) {
    return {
      ...fileCoverage,
      path: newFilePath,
    }
  }

  return fileCoverage
}

export function testResultsWithLowerCaseWindowsDriveLetters(testResults: JestFileResults[]): JestFileResults[] {
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
