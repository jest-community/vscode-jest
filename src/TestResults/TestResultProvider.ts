import { TestReconciler, JestTotalResults, TestFileAssertionStatus } from 'jest-editor-support';
import { TestReconciliationState } from './TestReconciliationState';
import { TestResult, TestResultStatusInfo } from './TestResult';
import { parseTest } from '../TestParser';
import * as match from './match-by-context';

interface TestResultsMap {
  [filePath: string]: TestResult[];
}

export interface SortedTestResults {
  fail: TestResult[];
  skip: TestResult[];
  success: TestResult[];
  unknown: TestResult[];
}

interface SortedTestResultsMap {
  [filePath: string]: SortedTestResults;
}

const sortByStatus = (a: TestResult, b: TestResult): number => {
  if (a.status === b.status) {
    return 0;
  }
  return TestResultStatusInfo[a.status].precedence - TestResultStatusInfo[b.status].precedence;
};
export class TestResultProvider {
  verbose: boolean;
  private reconciler: TestReconciler;
  private resultsByFilePath: TestResultsMap;
  private sortedResultsByFilePath: SortedTestResultsMap;

  constructor(verbose = false) {
    this.reconciler = new TestReconciler();
    this.resetCache();
    this.verbose = verbose;
  }

  resetCache(): void {
    this.resultsByFilePath = {};
    this.sortedResultsByFilePath = {};
  }

  private groupByRange(results: TestResult[]): TestResult[] {
    if (!results.length) {
      return results;
    }
    // build a range based map
    const byRange: Map<string, TestResult[]> = new Map();
    results.forEach((r) => {
      // Q: is there a better/efficient way to index the range?
      const key = `${r.start.line}-${r.start.column}-${r.end.line}-${r.end.column}`;
      const list = byRange.get(key);
      if (!list) {
        byRange.set(key, [r]);
      } else {
        list.push(r);
      }
    });
    // sort the test by status precedence
    byRange.forEach((list) => list.sort(sortByStatus));

    //merge multiResults under the primary (highest precedence)
    const consolidated: TestResult[] = [];
    byRange.forEach((list) => {
      if (list.length > 1) {
        list[0].multiResults = list.slice(1);
      }
      consolidated.push(list[0]);
    });
    return consolidated;
  }

  getResults(filePath: string): TestResult[] {
    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath];
    }

    let matchResult: TestResult[] = [];

    try {
      const assertions = this.reconciler.assertionsForTestFile(filePath);
      if (!assertions) {
        if (this.verbose) {
          console.log(`no assertion found, perhaps not a test file? '${filePath}'`);
        }
      } else if (assertions.length <= 0) {
        // no assertion, all tests are unknown
        const { itBlocks } = parseTest(filePath);
        matchResult = itBlocks.map((t) => match.toMatchResult(t, 'no assertion found'));
      } else {
        const { root } = parseTest(filePath);
        matchResult = match.matchTestAssertions(filePath, root, assertions, this.verbose);
      }
    } catch (e) {
      console.warn(`failed to get test result for ${filePath}:`, e);
    }
    const testResults = this.groupByRange(matchResult);
    this.resultsByFilePath[filePath] = testResults;
    return testResults;
  }

  getSortedResults(filePath: string): SortedTestResults {
    if (this.sortedResultsByFilePath[filePath]) {
      return this.sortedResultsByFilePath[filePath];
    }

    const result: SortedTestResults = {
      fail: [],
      skip: [],
      success: [],
      unknown: [],
    };

    const testResults = this.getResults(filePath);
    for (const test of testResults) {
      if (test.status === TestReconciliationState.KnownFail) {
        result.fail.push(test);
      } else if (test.status === TestReconciliationState.KnownSkip) {
        result.skip.push(test);
      } else if (test.status === TestReconciliationState.KnownSuccess) {
        result.success.push(test);
      } else {
        result.unknown.push(test);
      }
    }

    this.sortedResultsByFilePath[filePath] = result;
    return result;
  }

  updateTestResults(data: JestTotalResults): TestFileAssertionStatus[] {
    this.resetCache();
    return this.reconciler.updateFileWithJestStatus(data);
  }

  removeCachedResults(filePath: string): void {
    this.resultsByFilePath[filePath] = null;
    this.sortedResultsByFilePath[filePath] = null;
  }
}
