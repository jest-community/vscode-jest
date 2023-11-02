import {
  TestReconciler,
  JestTotalResults,
  TestFileAssertionStatus,
  IParseResults,
  parse,
  TestAssertionStatus,
  ParsedRange,
  ItBlock,
  SnapshotParserOptions,
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
import { ExtSnapshotBlock, SnapshotProvider, SnapshotSuite } from './snapshot-provider';

type TestBlocks = IParseResults & { sourceContainer: ContainerNode<ItBlock> };
interface TestSuiteParseResultRaw {
  testBlocks: TestBlocks | 'failed';
}
interface TestSuiteResultRaw {
  status: TestReconciliationStateType;
  message: string;
  assertionContainer?: ContainerNode<TestAssertionStatus>;
  results?: TestResult[];
  sorted?: SortedTestResults;
  // if we are certain the record is for a test file, set this flag to true
  // otherwise isTestFile is determined by the testFileList
  isTestFile?: boolean;
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
  private _isTestFile?: boolean;

  private _testBlocks?: TestBlocks | 'failed';
  private _assertionContainer?: ContainerNode<TestAssertionStatus>;

  constructor(
    public testFile: string,
    private reconciler: TestReconciler,
    private parser: Parser
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
  public get isTestFile(): boolean | undefined {
    return this._isTestFile;
  }

  /**
   * parse test file and create sourceContainer, if needed.
   * @returns TestBlocks | 'failed'
   */
  public get testBlocks(): TestBlocks | 'failed' {
    if (!this._testBlocks) {
      try {
        const pResult = this.parser.parseTestFile(this.testFile);
        if (![pResult.describeBlocks, pResult.itBlocks].find((blocks) => blocks.length > 0)) {
          // nothing in this file yet, skip. Otherwise we might accidentally publish a source file, for example
          return 'failed';
        }
        const sourceContainer = match.buildSourceContainer(pResult.root);
        this._testBlocks = { ...pResult, sourceContainer };

        const snapshotBlocks = this.parser.parseSnapshot(this.testFile).blocks;
        if (snapshotBlocks.length > 0) {
          this.updateSnapshotAttr(sourceContainer, snapshotBlocks);
        }
      } catch (e) {
        // normal to fail, for example when source file has syntax error
        if (this.parser.options?.verbose) {
          console.log(`parseTestBlocks failed for ${this.testFile}`, e);
        }
        this._testBlocks = 'failed';
      }
    }

    return this._testBlocks ?? 'failed';
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

    this._isTestFile = 'isTestFile' in change ? change.isTestFile : this._isTestFile;
    this._results = 'results' in change ? change.results : this._results;
    this._sorted = 'sorted' in change ? change.sorted : this._sorted;
    this._assertionContainer =
      'assertionContainer' in change ? change.assertionContainer : this._assertionContainer;
  }
}
export type TestResultProviderOptions = SnapshotParserOptions;

class Parser {
  constructor(
    private snapshotProvider: SnapshotProvider,
    public options?: TestResultProviderOptions
  ) {}
  public parseSnapshot(testPath: string): SnapshotSuite {
    const res = this.snapshotProvider.parse(testPath, this.options);
    return res;
  }

  public parseTestFile(testPath: string): IParseResults {
    const res = parse(testPath, undefined, this.options?.parserOptions);
    return res;
  }
}
export class TestResultProvider {
  private _options: TestResultProviderOptions;
  events: TestResultEvents;
  private reconciler: TestReconciler;
  private testSuites: Map<string, TestSuiteRecord>;
  private testFiles?: string[];
  private snapshotProvider: SnapshotProvider;
  private parser: Parser;

  constructor(
    extEvents: JestSessionEvents,
    options: TestResultProviderOptions = { verbose: false }
  ) {
    this.reconciler = new TestReconciler();
    this._options = options;
    this.events = createTestResultEvents();
    this.testSuites = new Map();
    this.snapshotProvider = new SnapshotProvider();
    this.parser = new Parser(this.snapshotProvider, this._options);
    extEvents.onTestSessionStarted.event(this.onSessionStart.bind(this));
  }

  dispose(): void {
    this.events.testListUpdated.dispose();
    this.events.testSuiteChanged.dispose();
  }

  set options(options: TestResultProviderOptions) {
    this._options = options;
    this.parser.options = this._options;
    this.testSuites.clear();
  }

  private addTestSuiteRecord(testFile: string): TestSuiteRecord {
    const record = new TestSuiteRecord(testFile, this.reconciler, this.parser);
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

  isTestFile(fileName: string): 'yes' | 'no' | 'maybe' {
    if (this.testFiles?.includes(fileName) || this.testSuites.get(fileName)?.isTestFile) {
      return 'yes';
    }
    if (!this.testFiles) {
      return 'maybe';
    }
    return 'no';
  }

  public getTestSuiteResult(filePath: string): TestSuiteResult | undefined {
    return this.testSuites.get(filePath);
  }

  /**
   * match assertions with source file, if successful, update cache, results and related.
   * Will also fire testSuiteChanged event
   *
   * if the file is not a test or can not be parsed, the results will be undefined.
   * any other errors will result the source blocks to be returned as unmatched block.
   **/
  private updateMatchedResults(filePath: string, record: TestSuiteRecord): void {
    let error: string | undefined;
    // make sure we do not fire changeEvent since that will be proceeded with match or unmatch event anyway
    const testBlocks = record.testBlocks;
    if (testBlocks === 'failed') {
      record.update({ status: 'KnownFail', message: 'test file parse error', results: [] });
      return;
    }

    const { itBlocks } = testBlocks;
    if (record.assertionContainer) {
      try {
        const results = this.groupByRange(
          match.matchTestAssertions(
            filePath,
            testBlocks.sourceContainer,
            record.assertionContainer,
            this._options.verbose
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

    // file match failed event so the listeners can display the source blocks instead
    this.events.testSuiteChanged.fire({
      type: 'result-match-failed',
      file: filePath,
      sourceContainer: testBlocks.sourceContainer,
    });
  }

  /**
   * returns matched test results for the given file
   * @param filePath
   * @returns valid test result list or an empty array if the source file is not a test or can not be parsed.
   */
  getResults(filePath: string, record?: TestSuiteRecord): TestResult[] | undefined {
    if (this.isTestFile(filePath) === 'no') {
      return;
    }

    const _record = record ?? this.testSuites.get(filePath) ?? this.addTestSuiteRecord(filePath);
    if (_record.results) {
      return _record.results;
    }

    this.updateMatchedResults(filePath, _record);
    return _record.results;
  }

  /**
   * returns sorted test results for the given file
   * @param filePath
   * @returns valid sorted test result or undefined if the file is not a test.
   */

  getSortedResults(filePath: string): SortedTestResults | undefined {
    if (this.isTestFile(filePath) === 'no') {
      return;
    }

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
    record.update({ sorted });
    return sorted;
  }

  updateTestResults(data: JestTotalResults, process: JestProcessInfo): TestFileAssertionStatus[] {
    const results = this.reconciler.updateFileWithJestStatus(data);
    results?.forEach((r) => {
      const record = this.testSuites.get(r.file) ?? this.addTestSuiteRecord(r.file);
      record.update({
        status: r.status,
        message: r.message,
        isTestFile: true,
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
