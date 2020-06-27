import { TestReconciler, JestTotalResults, TestFileAssertionStatus } from 'jest-editor-support';
import { TestReconciliationState } from './TestReconciliationState';
import { TestResult } from './TestResult';
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
    this.resultsByFilePath[filePath] = matchResult;
    return matchResult;
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
