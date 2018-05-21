import { TestReconciler, JestTotalResults } from 'jest-editor-support'
import { TestFileAssertionStatus } from 'jest-editor-support'
import { TestReconciliationState } from './TestReconciliationState'
import { TestResult } from './TestResult'
import { parseTest } from '../TestParser'

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
    this.resetCache()
  }

  resetCache() {
    this.resultsByFilePath = {}
    this.sortedResultsByFilePath = {}
  }

  getResults(filePath: string): TestResult[] {
    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath]
    }

    const { itBlocks } = parseTest(filePath)
    const results = this.reconciler.assertionsForTestFile(filePath) || []

    const result: TestResult[] = []
    for (const test of itBlocks) {
      const assertion =
        results.filter(result => result.line >= test.start.line && result.line <= test.end.line)[0] ||
        results.filter(
          result => result.title === test.name && result.status !== TestReconciliationState.KnownFail
        )[0] ||
        ({} as any)

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

  updateTestResults(data: JestTotalResults): TestFileAssertionStatus[] {
    this.resetCache()
    return this.reconciler.updateFileWithJestStatus(data)
  }

  removeCachedResults(filePath: string) {
    this.resultsByFilePath[filePath] = null
    this.sortedResultsByFilePath[filePath] = null
  }
}
