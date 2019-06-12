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

type IsMatched = (test: ItBlock, assertion: TestAssertionStatus) => boolean
type OnMatchError = (test: ItBlock, matched: TestAssertionStatus[]) => string | undefined

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
    const toMatchResult = (test: ItBlock, assertion?: TestAssertionStatus, err?: string) => ({
      // Note the shift from one-based to zero-based line number and columns
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

    const matchTests = (
      _itBlocks: ItBlock[],
      _assertions: TestAssertionStatus[],
      _isMatched: IsMatched[],
      _onMatchError?: OnMatchError,
      trackRemaining?: boolean
    ): [TestResult[], ItBlock[], TestAssertionStatus[]] => {
      const results: TestResult[] = []
      const remainingAssertions = Array.from(_assertions)
      const remainingTests: ItBlock[] = []
      const _trackRemaining = trackRemaining === undefined ? true : trackRemaining

      _itBlocks.forEach(test => {
        const matched = remainingAssertions.filter(a => _isMatched.every(m => m(test, a)))
        if (matched.length === 1) {
          const aIndex = remainingAssertions.indexOf(matched[0])
          if (aIndex < 0) {
            throw new Error(`can't find assertion in the list`)
          }
          results.push(toMatchResult(test, matched[0]))
          if (_trackRemaining) {
            remainingAssertions.splice(aIndex, 1)
          }
          return
        }

        let err: string
        if (_onMatchError) {
          err = _onMatchError(test, matched)
        }
        // if there is an error string, create a test result with it
        if (err) {
          results.push(toMatchResult(test, undefined, err))
          return
        }

        if (_trackRemaining) {
          remainingTests.push(test)
        }
      })
      return [results, remainingTests, remainingAssertions]
    }

    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath]
    }
    const matchPos = (t: ItBlock, a: TestAssertionStatus): boolean =>
      (a.line !== undefined && a.line >= t.start.line && a.line <= t.end.line) ||
      (a.location && a.location.line >= t.start.line && a.location.line <= t.end.line)

    const matchName = (t: ItBlock, a: TestAssertionStatus): boolean => t.name === a.title
    const templateLiteralPattern = /\${.*?}/ // template literal pattern
    const matchTemplateLiteral = (t: ItBlock, a: TestAssertionStatus): boolean => {
      if (!t.name.match(templateLiteralPattern)) {
        return false
      }
      const parts = t.name.split(templateLiteralPattern)
      const r = parts.every(p => a.title.includes(p))
      return r
    }
    const onMatchError: OnMatchError = (t: ItBlock, match: TestAssertionStatus[]) => {
      let err: string
      if (match.length <= 0 && t.name.match(templateLiteralPattern)) {
        err = 'no test result found, could be caused by template literals?'
      }
      if (match.length > 1) {
        err = 'found multiple potential matches, could be caused by duplicate test names or template literals?'
      }
      if (err && this.verbose) {
        // tslint:disable-next-line: no-console
        console.log(`'${t.name}' failed to find test result: ${err}`)
      }
      return err
    }

    let { itBlocks } = parseTest(filePath)
    let assertions = this.reconciler.assertionsForTestFile(filePath) || []
    const totalResult: TestResult[] = []

    if (assertions.length > 0 && itBlocks.length > 0) {
      const algorithms: Array<[IsMatched[], OnMatchError]> = [
        [[matchName, matchPos], undefined],
        [[matchTemplateLiteral, matchPos], undefined],
        [[matchTemplateLiteral], undefined],
        [[matchName], onMatchError],
      ]
      for (const [matchers, onError] of algorithms) {
        let result: TestResult[]
        ;[result, itBlocks, assertions] = matchTests(itBlocks, assertions, matchers, onError)
        totalResult.push(...result)
        if (itBlocks.length <= 0 || assertions.length <= 0) {
          break
        }
      }
    }

    // convert remaining itBlocks to unmatched result
    itBlocks.forEach(t => totalResult.push(toMatchResult(t)))

    this.resultsByFilePath[filePath] = totalResult
    return totalResult
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
