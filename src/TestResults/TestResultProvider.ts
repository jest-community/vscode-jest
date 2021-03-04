import {
  TestReconciler,
  JestTotalResults,
  TestFileAssertionStatus,
  IParseResults,
  parse,
} from 'jest-editor-support';
import { TestReconciliationState, TestReconciliationStateType } from './TestReconciliationState';
import { TestResult, TestResultStatusInfo } from './TestResult';
import * as match from './match-by-context';
import { JestExtSessionAware } from '../JestExt';
import { TestStats } from '../types';
import { emptyTestStats } from '../helpers';

interface TestSuiteResult {
  status: TestReconciliationStateType;
  results?: TestResult[];
  sorted?: SortedTestResults;
}
type TestSuiteResultMap = {
  [filePath: string]: TestSuiteResult;
};

export interface SortedTestResults {
  fail: TestResult[];
  skip: TestResult[];
  success: TestResult[];
  unknown: TestResult[];
}

const sortByStatus = (a: TestResult, b: TestResult): number => {
  if (a.status === b.status) {
    return 0;
  }
  return TestResultStatusInfo[a.status].precedence - TestResultStatusInfo[b.status].precedence;
};
export class TestResultProvider implements JestExtSessionAware {
  verbose: boolean;
  private reconciler: TestReconciler;
  private testSuites: TestSuiteResultMap = {};
  private testFiles?: string[];

  constructor(verbose = false) {
    this.reconciler = new TestReconciler();
    this.resetCache();
    this.verbose = verbose;
  }

  public onSessionStart(): void {
    this.resetCache();
    this.reconciler = new TestReconciler();
  }

  resetCache(): void {
    this.testSuites = {};
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

  updateTestFileList(testFiles?: string[]): void {
    this.testFiles = testFiles;

    // clear the cache in case we have cached some non-test files prior
    this.testSuites = {};
  }

  private matchResults(filePath: string, { root, itBlocks }: IParseResults): TestSuiteResult {
    try {
      const assertions = this.reconciler.assertionsForTestFile(filePath);
      if (assertions && assertions.length > 0) {
        const status = this.reconciler.stateForTestFile(filePath);
        return {
          status,
          results: this.groupByRange(
            match.matchTestAssertions(filePath, root, assertions, this.verbose)
          ),
        };
      }
    } catch (e) {
      console.warn(`failed to match test results for ${filePath}:`, e);
    }
    // no need to do groupByRange as the source block will not have blocks under the same location
    return {
      status: 'Unknown',
      results: itBlocks.map((t) =>
        match.toMatchResult(t, 'no assertion found', 'no-matched-assertion')
      ),
    };
  }

  /**
   * if we have test file list, returns true if the file is NOT in the list; otherwise always returns false since we can't be sure
   * @param filePath
   */
  private notTestFile(filePath: string): boolean {
    return (this.testFiles && !this.testFiles.includes(filePath)) ?? false;
  }
  /**
   * returns matched test results for the given file
   * @param filePath
   * @returns valid test result list or undefined if the file is not a test.
   *  In the case when file can not be parsed or match error, empty results will be returned.
   * @throws if parsing or matching internal error
   */
  getResults(filePath: string): TestResult[] | undefined {
    const results = this.testSuites[filePath]?.results;
    if (results) {
      return results;
    }

    if (this.notTestFile(filePath)) {
      return;
    }

    let suiteResult: TestSuiteResult = { status: 'Unknown', results: [] };
    try {
      const parseResult = parse(filePath);
      suiteResult = this.matchResults(filePath, parseResult);
    } catch (e) {
      console.warn(`failed to get test results for ${filePath}:`, e);
      suiteResult = { status: 'KnownFail', results: [] };
      throw e;
    } finally {
      this.testSuites[filePath] = suiteResult;
    }

    return suiteResult.results;
  }

  /**
   * returns sorted test results for the given file
   * @param filePath
   * @returns valid sorted test result or undefined if the file is not a test.
   * @throws if encountered internal error for test files
   */

  getSortedResults(filePath: string): SortedTestResults | undefined {
    const cached = this.testSuites[filePath]?.sorted;
    if (cached) {
      return cached;
    }

    if (this.notTestFile(filePath)) {
      return;
    }

    const result: SortedTestResults = {
      fail: [],
      skip: [],
      success: [],
      unknown: [],
    };

    try {
      const testResults = this.getResults(filePath);
      if (!testResults) {
        return;
      }

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
    } finally {
      if (this.testSuites[filePath]) {
        this.testSuites[filePath].sorted = result;
      }
    }
    return result;
  }

  updateTestResults(data: JestTotalResults): TestFileAssertionStatus[] {
    const results = this.reconciler.updateFileWithJestStatus(data);
    results?.forEach((r) => {
      this.testSuites[r.file] = { status: r.status };
    });
    return results;
  }

  removeCachedResults(filePath: string): void {
    delete this.testSuites[filePath];
  }
  invalidateTestResults(filePath: string): void {
    this.removeCachedResults(filePath);
    this.reconciler.removeTestFile(filePath);
  }

  // test stats
  getTestSuiteStats(): TestStats {
    const stats = emptyTestStats();
    for (const suite of Object.values(this.testSuites)) {
      if (suite.status === 'KnownSuccess') {
        stats.success += 1;
      } else if (suite.status === 'KnownFail') {
        stats.fail += 1;
      } else {
        stats.unknown += 1;
      }
    }

    if (this.testFiles) {
      if (this.testFiles.length > stats.fail + stats.success + stats.unknown) {
        return {
          ...stats,
          unknown: this.testFiles.length - stats.fail - stats.success,
        };
      }
    }
    return stats;
  }
}
