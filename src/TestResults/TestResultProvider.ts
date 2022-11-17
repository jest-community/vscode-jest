import {
  TestReconciler,
  JestTotalResults,
  TestFileAssertionStatus,
  IParseResults,
  parse,
  TestAssertionStatus,
  ParsedRange,
  ItBlock,
} from 'jest-editor-support';
import { TestReconciliationState, TestReconciliationStateType } from './TestReconciliationState';
import { TestResult, TestResultStatusInfo } from './TestResult';
import * as match from './match-by-context';
import { JestSessionEvents } from '../JestExt';
import { TestStats } from '../types';
import { emptyTestStats } from '../helpers';
import { createTestResultEvents, TestResultEvents } from './test-result-events';
import { ContainerNode, ROOT_NODE_NAME } from './match-node';
import { JestProcessInfo } from '../JestProcessManagement';
import { ExtSnapshotBlock, SnapshotProvider } from './snapshot-provider';

type TestBlocks = IParseResults & { sourceContainer: ContainerNode<ItBlock> };
interface TestSuiteParseResultRaw {
  testBlocks: TestBlocks | 'failed';
}
interface TestSuiteResultRaw {
  // test result
  status: TestReconciliationStateType;
  message: string;
  assertionContainer?: ContainerNode<TestAssertionStatus>;
  results?: TestResult[];
  sorted?: SortedTestResults;
}

export type TestSuiteResult = Readonly<TestSuiteResultRaw>;
type TestSuiteUpdatable = Readonly<TestSuiteResultRaw & TestSuiteParseResultRaw>;

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

export class TestSuiteRecord implements TestSuiteUpdatable {
  private _status: TestReconciliationStateType;
  private _message: string;
  private _results?: TestResult[];
  private _sorted?: SortedTestResults;

  private _testBlocks?: TestBlocks | 'failed';
  // private _snapshotBlocks?: ExtSnapshotBlock[] | 'failed';
  private _assertionContainer?: ContainerNode<TestAssertionStatus>;

  constructor(
    public testFile: string,
    private snapshotProvider: SnapshotProvider,
    private events: TestResultEvents,
    private reconciler: TestReconciler,
    private verbose = false
  ) {
    this._status = TestReconciliationState.Unknown;
    this._message = '';
  }
  public get status(): TestReconciliationStateType {
    return this._status;
  }
  public get message(): string {
    return this._message;
  }
  public get results(): TestResult[] | undefined {
    return this._results;
  }
  public get sorted(): SortedTestResults | undefined {
    return this._sorted;
  }

  public get testBlocks(): TestBlocks | 'failed' {
    if (!this._testBlocks) {
      try {
        const pResult = parse(this.testFile);
        const sourceContainer = match.buildSourceContainer(pResult.root);
        this._testBlocks = { ...pResult, sourceContainer };

        const snapshotBlocks = this.snapshotProvider.parse(this.testFile).blocks;
        if (snapshotBlocks.length > 0) {
          this.updateSnapshotAttr(sourceContainer, snapshotBlocks);
        }

        this.events.testSuiteChanged.fire({
          type: 'test-parsed',
          file: this.testFile,
          sourceContainer: sourceContainer,
        });
      } catch (e) {
        // normal to fail, for example when source file has syntax error
        if (this.verbose) {
          console.log(`parseTestBlocks failed for ${this.testFile}`, e);
        }
        this._testBlocks = 'failed';
      }
    }

    return this._testBlocks;
  }

  public get assertionContainer(): ContainerNode<TestAssertionStatus> | undefined {
    if (!this._assertionContainer) {
      const assertions = this.reconciler.assertionsForTestFile(this.testFile);
      if (assertions && assertions.length > 0) {
        this._assertionContainer = match.buildAssertionContainer(assertions);
      }
    }
    return this._assertionContainer;
  }

  private updateSnapshotAttr(
    container: ContainerNode<ItBlock>,
    snapshots: ExtSnapshotBlock[]
  ): void {
    const isWithin = (snapshot: ExtSnapshotBlock, range?: ParsedRange): boolean => {
      const zeroBasedLine = snapshot.node.loc.start.line - 1;
      return !!range && range.start.line <= zeroBasedLine && range.end.line >= zeroBasedLine;
    };

    if (
      container.name !== ROOT_NODE_NAME &&
      container.attrs.range &&
      !snapshots.find((s) => isWithin(s, container.attrs.range))
    ) {
      return;
    }
    container.childData.forEach((block) => {
      const snapshot = snapshots.find((s) => isWithin(s, block.attrs.range));
      if (snapshot) {
        block.attrs.snapshot = snapshot.isInline ? 'inline' : 'external';
      }
    });
    container.childContainers.forEach((childContainer) =>
      this.updateSnapshotAttr(childContainer, snapshots)
    );
  }

  public update(change: Partial<TestSuiteUpdatable>): void {
    this._status = change.status ?? this.status;
    this._message = change.message ?? this.message;

    this._results = 'results' in change ? change.results : this._results;
    this._sorted = 'sorted' in change ? change.sorted : this._sorted;
    this._testBlocks = 'testBlocks' in change ? change.testBlocks : this._testBlocks;
    this._assertionContainer =
      'assertionContainer' in change ? change.assertionContainer : this._assertionContainer;
  }
}
export class TestResultProvider {
  verbose: boolean;
  events: TestResultEvents;
  private reconciler: TestReconciler;
  private testSuites: Map<string, TestSuiteRecord>;
  private testFiles?: string[];
  private snapshotProvider: SnapshotProvider;

  constructor(extEvents: JestSessionEvents, verbose = false) {
    this.reconciler = new TestReconciler();
    this.verbose = verbose;
    this.events = createTestResultEvents();
    this.testSuites = new Map();
    this.snapshotProvider = new SnapshotProvider();
    extEvents.onTestSessionStarted.event(this.onSessionStart.bind(this));
  }

  dispose(): void {
    this.events.testListUpdated.dispose();
    this.events.testSuiteChanged.dispose();
  }

  private addTestSuiteRecord(testFile: string): TestSuiteRecord {
    const record = new TestSuiteRecord(
      testFile,
      this.snapshotProvider,
      this.events,
      this.reconciler,
      this.verbose
    );
    this.testSuites.set(testFile, record);
    return record;
  }
  private onSessionStart(): void {
    this.testSuites.clear();
    this.reconciler = new TestReconciler();
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
    this.testSuites.clear();

    this.events.testListUpdated.fire(testFiles);
  }
  getTestList(): string[] {
    if (this.testFiles && this.testFiles.length > 0) {
      return this.testFiles;
    }
    return Array.from(this.testSuites.keys());
  }

  isTestFile(fileName: string): 'yes' | 'no' | 'unknown' {
    if (this.testFiles?.includes(fileName) || this.testSuites.get(fileName) != null) {
      return 'yes';
    }
    if (!this.testFiles) {
      return 'unknown';
    }
    return 'no';
  }

  public getTestSuiteResult(filePath: string): TestSuiteResult | undefined {
    return this.testSuites.get(filePath);
  }

  /** match assertions with source file, if successful, update cache.results and related. Will also fire testSuiteChanged event */
  private updateMatchedResults(filePath: string, record: TestSuiteRecord): void {
    let error: string | undefined;
    if (record.testBlocks === 'failed') {
      record.update({ status: 'KnownFail', message: 'test file parse error', results: [] });
      return;
    }

    const { itBlocks } = record.testBlocks;
    if (record.assertionContainer) {
      try {
        const results = this.groupByRange(
          match.matchTestAssertions(
            filePath,
            record.testBlocks.sourceContainer,
            record.assertionContainer,
            this.verbose
          )
        );
        record.update({ results });

        this.events.testSuiteChanged.fire({
          type: 'result-matched',
          file: filePath,
        });
        return;
      } catch (e) {
        console.warn(`failed to match test results for ${filePath}:`, e);
        error = `encountered internal match error: ${e}`;
      }
    } else {
      error = 'no assertion generated for file';
    }

    // no need to do groupByRange as the source block will not have blocks under the same location
    record.update({
      status: 'KnownFail',
      message: error,
      results: itBlocks.map((t) => match.toMatchResult(t, 'no assertion found', 'match-failed')),
    });
  }

  /**
   * returns matched test results for the given file
   * @param filePath
   * @returns valid test result list or undefined if the file is not a test.
   *  In the case when file can not be parsed or match error, empty results will be returned.
   * @throws if parsing or matching internal error
   */
  getResults(filePath: string, record?: TestSuiteRecord): TestResult[] | undefined {
    const _record = record ?? this.testSuites.get(filePath) ?? this.addTestSuiteRecord(filePath);
    if (_record.results) {
      return _record.results;
    }

    if (this.isTestFile(filePath) === 'no') {
      return;
    }

    this.updateMatchedResults(filePath, _record);
    return _record.results;
  }

  /**
   * returns sorted test results for the given file
   * @param filePath
   * @returns valid sorted test result or undefined if the file is not a test.
   * @throws if encountered internal error for test files
   */

  getSortedResults(filePath: string): SortedTestResults | undefined {
    const record = this.testSuites.get(filePath) ?? this.addTestSuiteRecord(filePath);
    if (record.sorted) {
      return record.sorted;
    }

    const sorted: SortedTestResults = {
      fail: [],
      skip: [],
      success: [],
      unknown: [],
    };

    try {
      const testResults = this.getResults(filePath, record);
      if (!testResults) {
        return;
      }

      for (const test of testResults) {
        if (test.status === TestReconciliationState.KnownFail) {
          sorted.fail.push(test);
        } else if (test.status === TestReconciliationState.KnownSkip) {
          sorted.skip.push(test);
        } else if (test.status === TestReconciliationState.KnownSuccess) {
          sorted.success.push(test);
        } else {
          sorted.unknown.push(test);
        }
      }
    } finally {
      record.update({ sorted });
    }
    return sorted;
  }

  updateTestResults(data: JestTotalResults, process: JestProcessInfo): TestFileAssertionStatus[] {
    const results = this.reconciler.updateFileWithJestStatus(data);
    results?.forEach((r) => {
      const record = this.testSuites.get(r.file) ?? this.addTestSuiteRecord(r.file);
      record.update({
        status: r.status,
        message: r.message,
        assertionContainer: undefined,
        results: undefined,
        sorted: undefined,
      });
    });
    this.events.testSuiteChanged.fire({
      type: 'assertions-updated',
      files: results.map((r) => r.file),
      process,
    });
    return results;
  }

  removeCachedResults(filePath: string): void {
    this.testSuites.delete(filePath);
  }
  invalidateTestResults(filePath: string): void {
    this.removeCachedResults(filePath);
    this.reconciler.removeTestFile(filePath);
  }

  // test stats
  getTestSuiteStats(): TestStats {
    const stats = emptyTestStats();
    this.testSuites.forEach((suite) => {
      if (suite.status === 'KnownSuccess') {
        stats.success += 1;
      } else if (suite.status === 'KnownFail') {
        stats.fail += 1;
      } else {
        stats.unknown += 1;
      }
    });

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

  // snapshot support

  public previewSnapshot(testPath: string, testFullName: string): Promise<void> {
    return this.snapshotProvider.previewSnapshot(testPath, testFullName);
  }
}
