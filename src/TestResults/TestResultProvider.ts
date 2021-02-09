import {
  TestReconciler,
  JestTotalResults,
  TestFileAssertionStatus,
  IParseResults,
} from 'jest-editor-support';
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
  private resultsByFilePath!: TestResultsMap;
  private sortedResultsByFilePath!: SortedTestResultsMap;

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

  private matchResults(filePath: string, { root, itBlocks }: IParseResults): TestResult[] {
    try {
      const assertions = this.reconciler.assertionsForTestFile(filePath);
      if (assertions && assertions.length > 0) {
        return this.groupByRange(
          match.matchTestAssertions(filePath, root, assertions, this.verbose)
        );
      }
    } catch (e) {
      console.warn(`failed to match test results for ${filePath}:`, e);
    }
    // no need to do groupByRange as the source block will not have blocks under the same location
    return itBlocks.map((t) =>
      match.toMatchResult(t, 'no assertion found', 'no-matched-assertion')
    );
  }
  private parseFile(filePath: string): IParseResults | undefined {
    try {
      // TODO this would parse any file, whether it is a test or not, because we don't know which file is actually included in jest test run! Should optimize this to only run for test files included in jest run
      return parseTest(filePath);
    } catch (e) {
      // it is possible to have parse error espeically during development phase where the code might not even compiled
      if (this.verbose) {
        console.warn(`failed to parse file ${filePath}:`, e);
      }
    }
  }
  getResults(filePath: string): TestResult[] {
    if (this.resultsByFilePath[filePath]) {
      return this.resultsByFilePath[filePath];
    }

    let matchResults: TestResult[] = [];
    try {
      const parseResult = this.parseFile(filePath);
      matchResults = parseResult ? this.matchResults(filePath, parseResult) : matchResults;
    } catch (e) {
      console.warn(`failed to get test results for ${filePath}:`, e);
    }

    this.resultsByFilePath[filePath] = matchResults;
    return matchResults;
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
    delete this.resultsByFilePath[filePath];
    delete this.sortedResultsByFilePath[filePath];
  }
}
