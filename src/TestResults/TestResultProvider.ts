import { TestReconciler, FormattedTestResults } from 'jest-editor-support'
import { TestFileAssertionStatus } from 'jest-editor-support'
import { TestReconciliationState } from './TestReconciliationState'
import { parseTest } from '../TestParser'
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

type TestResultsMap = { [filePath: string]: TestResult[] }

export type SortedTestResults = {
  fail: TestResult[]
  skip: TestResult[]
  success: TestResult[]
  unknown: TestResult[]
}

type SortedTestResultsMap = { [filePath: string]: SortedTestResults }

export class TestResultProvider {
  private reconciler: TestReconciler
  private resultsByFilePath: TestResultsMap
  private sortedResultsByFilePath: SortedTestResultsMap

  constructor() {
    this.reconciler = new TestReconciler()
    this.resultsByFilePath = {}
    this.sortedResultsByFilePath = {}
  }

  getResults(filePath: string): TestResult[] {
    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath]
    }

    const { itBlocks } = parseTest(filePath)
    const results = this.reconciler.assertionsForTestFile(filePath) || []

    const resultsByTestName = {}
    for (const result of results) {
      const testName = result.title
      resultsByTestName[testName] = result
    }

    const result: TestResult[] = []
    for (const test of itBlocks) {
      const assertion = resultsByTestName[test.name] || {}

      // Note the shift from one-based to zero-based line number and columns
      result.push({
        name: test.name,
        start: {
          column: test.start.column - 1,
          line: test.start.line - 1,
        },
        end: {
          column: test.end.column - 1,
          line: test.end.line - 1,
        },

        status: assertion.status || TestReconciliationState.Unknown,
        shortMessage: assertion.shortMessage,
        terseMessage: assertion.terseMessage,
        lineNumberOfError: assertion.line ? assertion.line - 1 : undefined,
      })
    }

    this.resultsByFilePath[filePath] = result
    return result
  }

  getSortedResults(filePath: string) {
    if (this.sortedResultsByFilePath[filePath]) {
      return this.sortedResultsByFilePath[filePath]
    }

    const result: SortedTestResults = {
      fail: [],
      skip: [],
      success: [],
      unknown: [],
    }

    const testResults = this.getResults(filePath)
    for (const test of testResults) {
      if (test.status === TestReconciliationState.KnownFail) {
        result.fail.push(test)
      } else if (test.status === TestReconciliationState.KnownSkip) {
        result.skip.push(test)
      } else if (test.status === TestReconciliationState.KnownSuccess) {
        result.success.push(test)
      } else {
        result.unknown.push(test)
      }
    }

    this.sortedResultsByFilePath[filePath] = result
    return result
  }

  updateTestResults(data: FormattedTestResults): TestFileAssertionStatus[] {
    this.resultsByFilePath = {}
    this.sortedResultsByFilePath = {}

    // To support Windows systems, the drive letter is converted to a lowercase
    // letter to match the convention of the document URI (e.g.: document.fileName)
    if (data.testResults && path.sep === '\\') {
      for (let i = 0; i < data.testResults.length; i += 1) {
        if (data.testResults[i].name.match(/^[A-Z]:\\/)) {
          const filePath = data.testResults[i].name
          data.testResults[i].name = filePath[0].toLowerCase() + filePath.slice(1)
        }
      }
    }

    return this.reconciler.updateFileWithJestStatus(data)
  }

  removeCachedResults(filePath: string) {
    this.resultsByFilePath[filePath] = null
    this.sortedResultsByFilePath[filePath] = null
  }
}
