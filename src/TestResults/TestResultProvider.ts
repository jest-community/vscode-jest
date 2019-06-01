import {
  TestReconciler,
  JestTotalResults,
  TestAssertionStatus,
  TestFileAssertionStatus,
  ItBlock,
} from 'jest-editor-support'
import { TestReconciliationState } from './TestReconciliationState'
import { TestResult } from './TestResult'
import { parseTest } from '../TestParser'

interface TestResultsMap {
  [filePath: string]: TestResult[]
}

export interface SortedTestResults {
  fail: TestResult[]
  skip: TestResult[]
  success: TestResult[]
  unknown: TestResult[]
}

interface SortedTestResultsMap {
  [filePath: string]: SortedTestResults
}

export class TestResultProvider {
  verbose: boolean
  private reconciler: TestReconciler
  private resultsByFilePath: TestResultsMap
  private sortedResultsByFilePath: SortedTestResultsMap

  constructor(verbose = false) {
    this.reconciler = new TestReconciler()
    this.resetCache()
    this.verbose = verbose
  }

  resetCache() {
    this.resultsByFilePath = {}
    this.sortedResultsByFilePath = {}
  }

  getResults(filePath: string): TestResult[] {
    const maybeTemplateLiteral = (s: string) => s.indexOf('${') > -1

    const findAssertionByLocation = (testBlock: ItBlock, _assertions: TestAssertionStatus[]) => {
      return _assertions.find(
        a =>
          (a.line >= testBlock.start.line && a.line <= testBlock.end.line) ||
          (a.location && a.location.line >= testBlock.start.line && a.location.line <= testBlock.end.line)
      )
    }

    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath]
    }

    const { itBlocks } = parseTest(filePath)

    const assertions = this.reconciler.assertionsForTestFile(filePath) || []

    const result: TestResult[] = []
    for (const test of itBlocks) {
      let assertion: TestAssertionStatus | undefined
      let err: string | undefined

      const match = assertions.filter(a => a.title === test.name)
      switch (match.length) {
        case 1:
          assertion = match[0]
          break
        case 0:
          if (maybeTemplateLiteral(test.name)) {
            assertion = findAssertionByLocation(test, assertions)
            if (this.verbose) {
              // tslint:disable-next-line no-console
              console.log(
                `not able to match test block by name, possible due to template-iteral? matching by line number instead.`
              )
            }
            if (!assertion) {
              err = 'failed to match test result, might be caused by template-literal test name?'
            }
          }
          break
        default:
          // multiple matches, select according to the following criteria
          assertion = findAssertionByLocation(test, match)
          if (!assertion) {
            // can't find the match, it could due to sourceMap related issue, let's try our best to locate one then
            assertion = match.find(a => a.status !== TestReconciliationState.KnownFail) || match[0]
            if (this.verbose) {
              // tslint:disable-next-line no-console
              console.log(`assertion might not be correct, best effort from:`, assertions)
            }
          }
      }

      if (!assertion && this.verbose) {
        // tslint:disable-next-line no-console
        console.log(`failed to find assertion for ite block:`, test)
      }

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

        status: assertion ? assertion.status : TestReconciliationState.Unknown,
        shortMessage: assertion ? assertion.shortMessage : err,
        terseMessage: assertion ? assertion.terseMessage : undefined,
        lineNumberOfError:
          assertion && assertion.line && assertion.line >= test.start.line && assertion.line <= test.end.line
            ? assertion.line - 1
            : test.end.line - 1,
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
