jest.unmock('../../src/TestResults/TestResultProvider');
jest.unmock('../../src/TestResults/test-result-events');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../../src/helpers');
jest.unmock('../test-helper');

const mockTestReconciler = jest.fn();
const mockReconciler = {
  updateFileWithJestStatus: jest.fn(),
  assertionsForTestFile: jest.fn(),
  removeTestFile: jest.fn(),
};

const mockParse = jest.fn();
jest.mock('jest-editor-support', () => {
  const TestReconciler = mockTestReconciler;
  const parse = mockParse;
  const ParsedNodeTypes = [];
  return { TestReconciler, parse, ParsedNodeTypes };
});

const pathProperties = {
  sep: jest.fn(),
};
jest.mock('path', () => {
  const path = {};

  Object.defineProperty(path, 'sep', {
    get: () => pathProperties.sep(),
  });

  return path;
});

import * as vscode from 'vscode';
import {
  TestResultProvider,
  TestResultProviderOptions,
} from '../../src/TestResults/TestResultProvider';
import { TestReconciliationState } from '../../src/TestResults';
import * as helper from '../test-helper';
import { ItBlock, TestAssertionStatus, TestReconcilationState } from 'jest-editor-support';
import * as match from '../../src/TestResults/match-by-context';
import { mockJestExtEvents } from '../test-helper';
import { ExtSnapshotBlock, SnapshotProvider } from '../../src/TestResults/snapshot-provider';

const setupMockParse = (itBlocks: ItBlock[]) => {
  mockParse.mockReturnValue({
    root: helper.makeRoot(itBlocks),
    itBlocks,
    describeBlocks: [],
  });
};

const createDataSet = (): [ItBlock[], TestAssertionStatus[], ExtSnapshotBlock[]] => {
  const testBlocks = [
    helper.makeItBlock('test 1', [2, 3, 4, 5]),
    helper.makeItBlock('test 2', [12, 13, 14, 15]),
    helper.makeItBlock('test 3', [22, 23, 24, 25]),
    helper.makeItBlock('test 4', [32, 33, 34, 35]),
    helper.makeItBlock('test 5', [42, 43, 44, 45]),
  ];
  const assertions = [
    helper.makeAssertion('test 1', TestReconciliationState.KnownSuccess, undefined, [2, 0]),
    helper.makeAssertion('test 2', TestReconciliationState.KnownFail, undefined, [12, 0]),
    helper.makeAssertion('test 3', TestReconciliationState.KnownSkip, undefined, [22, 0]),
    helper.makeAssertion('test 4', TestReconciliationState.Unknown, undefined, [32, 0]),
    helper.makeAssertion('test 5', TestReconciliationState.KnownSuccess, undefined, [42, 0]),
  ];
  const snapshots = [
    helper.makeSnapshotBlock('test 2', false, 13),
    helper.makeSnapshotBlock('test 5', true, 43),
  ];
  return [testBlocks, assertions, snapshots];
};

interface TestData {
  itBlocks: ItBlock[];
  assertions: TestAssertionStatus[];
  file: string;
  fStatus: TestReconcilationState;
  message?: string;
}

const makeData = (
  itBlocks: ItBlock[],
  assertions: TestAssertionStatus[],
  file: string,
  fStatus: TestReconcilationState = 'Unknown',
  message?: string
): TestData => ({
  itBlocks,
  assertions,
  file,
  fStatus,
  message,
});

const eventsMock: any = mockJestExtEvents();

const newProviderWithData = (
  testData: TestData[],
  options?: TestResultProviderOptions
): TestResultProvider => {
  mockParse.mockImplementation((file) => {
    const data = testData.find((data) => data.file === file);
    if (data) {
      return {
        root: helper.makeRoot(data.itBlocks),
        itBlocks: data.itBlocks,
        describeBlocks: [],
      };
    }
  });
  mockReconciler.assertionsForTestFile.mockImplementation((file) => {
    const data = testData.find((data) => data.file === file);
    return data?.assertions;
  });
  mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(
    testData.map((data) => ({
      file: data.file,
      status: data.fStatus,
      message: data.message,
      assertions: data.assertions,
    }))
  );
  const sut = new TestResultProvider(eventsMock, options);
  // warn up cache
  sut.updateTestResults({} as any, {} as any);
  return sut;
};
describe('TestResultProvider', () => {
  const filePath = 'file.js';
  const testBlock = helper.makeItBlock('test name', [2, 3, 4, 5]);
  const assertion = helper.makeAssertion(
    testBlock.name,
    TestReconciliationState.KnownFail,
    undefined,
    undefined,
    {
      terseMessage: 'terseMessage',
      shortMessage: 'shortMesage',
      line: 3,
    }
  );
  const forceParseError = () => {
    mockParse.mockImplementation(() => {
      throw new Error('forced error');
    });
  };
  const forceMatchError = () => {
    jest.spyOn(match, 'matchTestAssertions').mockImplementation(() => {
      throw new Error('forced error');
    });
  };

  let mockSnapshotProvider;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    console.warn = jest.fn();
    console.log = jest.fn();
    mockTestReconciler.mockReturnValue(mockReconciler);
    (vscode.EventEmitter as jest.Mocked<any>) = jest.fn().mockImplementation(helper.mockEvent);
    mockSnapshotProvider = {
      parse: jest.fn().mockReturnValue({ blocks: [] }),
      previewSnapshot: jest.fn().mockReturnValue(Promise.resolve()),
    };
    (SnapshotProvider as jest.Mocked<any>).mockReturnValue(mockSnapshotProvider);
  });

  describe('getResults()', () => {
    it('should return the cached results if possible', () => {
      const sut = newProviderWithData([makeData([], [], filePath)]);
      const expected = sut.getResults(filePath);

      expect(sut.getResults(filePath)).toBe(expected);
    });

    it('should re-index the line and column number to zero-based', () => {
      const sut = newProviderWithData([makeData([testBlock], [assertion], filePath)]);
      const actual = sut.getResults(filePath);

      expect(actual).toHaveLength(1);
      expect(actual[0].lineNumberOfError).toBe(assertion.line! - 1);
      expect(actual[0].start).toEqual({
        line: testBlock.start.line - 1,
        column: testBlock.start.column - 1,
      });
      expect(actual[0].end).toEqual({
        line: testBlock.end.line - 1,
        column: testBlock.end.column - 1,
      });
    });

    it('if context are the same, test will match even if name does not', () => {
      const assertionC = { ...assertion };
      assertionC.title = 'xxx';
      const sut = newProviderWithData([makeData([testBlock], [assertionC], filePath)]);
      const actual = sut.getResults(filePath);
      expect(actual).toHaveLength(1);
      expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
    });

    it('should look up the test result by test name', () => {
      const assertionC = { ...assertion };
      assertionC.line = undefined;
      const sut = newProviderWithData([makeData([testBlock], [assertionC], filePath)]);
      const actual = sut.getResults(filePath);

      expect(actual).toHaveLength(1);
      expect(actual[0].name).toBe(testBlock.name);
      expect(actual[0].status).toBe(assertionC.status);
      expect(actual[0].shortMessage).toBe(assertionC.shortMessage);
      expect(actual[0].terseMessage).toBe(assertionC.terseMessage);
      expect(actual[0].lineNumberOfError).toEqual(testBlock.end.line - 1);
      expect(actual[0].start).toEqual({
        line: testBlock.start.line - 1,
        column: testBlock.start.column - 1,
      });
      expect(actual[0].end).toEqual({
        line: testBlock.end.line - 1,
        column: testBlock.end.column - 1,
      });
    });

    it('unmatched test should report the reason', () => {
      const sut = newProviderWithData([makeData([testBlock], null, filePath)]);
      const actual = sut.getResults(filePath);

      expect(actual).toHaveLength(1);
      expect(actual[0].status).toBe(TestReconciliationState.Unknown);
      expect(actual[0].shortMessage).not.toBeUndefined();
      expect(actual[0].terseMessage).toBeUndefined();
    });

    describe('fire "result-matched" event', () => {
      it('fire testSuiteChanged event for newly matched result', () => {
        const sut = newProviderWithData([makeData([testBlock], [assertion], filePath)]);
        sut.getResults(filePath);
        expect(sut.events.testSuiteChanged.fire).toHaveBeenCalledWith({
          type: 'result-matched',
          file: filePath,
        });
      });
      it('will not fire if no assertion to match', () => {
        const sut = newProviderWithData([makeData([testBlock], [], filePath)]);
        sut.getResults(filePath);
        expect(sut.events.testSuiteChanged.fire).not.toHaveBeenCalledWith({
          type: 'result-matched',
          file: filePath,
        });
      });
    });
    it('unmatched test will file result-match-failed events', () => {
      const sut = newProviderWithData([makeData([testBlock], null, filePath)]);
      sut.getResults(filePath);
      expect(sut.events.testSuiteChanged.fire).toHaveBeenCalledWith({
        type: 'result-match-failed',
        file: filePath,
        sourceContainer: expect.anything(),
      });
    });

    describe('duplicate test names', () => {
      const testBlock2 = helper.makeItBlock(testBlock.name, [5, 3, 7, 5]);
      beforeEach(() => {});
      it('can resolve as long as they have the same context structure', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 0]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [10, 0]),
        ];
        const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);
        const actual = sut.getResults(filePath);

        expect(actual).toHaveLength(2);
        expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
        expect(actual[1].status).toBe(TestReconciliationState.KnownSuccess);
      });
      it('however when context structures are different, duplicate names within the same layer can not be resolved.', () => {
        setupMockParse([testBlock, testBlock2]);

        const sut = new TestResultProvider(eventsMock);
        // note: these 2 assertions have the same line number, therefore will be merge
        // into a group-node, which made the context difference: source: 2 nodes, assertion: 1 node.
        // but since the 2 assertions' name matched the testBlock, it will still be considered as 1-to-many match
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 0]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 0]),
        ]);
        const actual = sut.getResults(filePath);

        expect(actual).toHaveLength(2);
        expect(actual[0].status).toBe(TestReconciliationState.Unknown);
        expect(actual[1].status).toBe(TestReconciliationState.Unknown);
      });
    });

    it('should only mark error line number if it is within the right itBlock', () => {
      const testBlock2 = helper.makeItBlock('test2', [5, 3, 7, 5]);
      const assertions = [
        helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 1]),
        helper.makeAssertion(testBlock2.name, TestReconciliationState.KnownFail, [], [2, 2], {
          line: 3,
        }),
      ];
      const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);
      const actual = sut.getResults(filePath);

      expect(actual).toHaveLength(2);
      expect(actual.map((a) => a.name)).toEqual([testBlock.name, testBlock2.name]);
      expect(actual.map((a) => a.status)).toEqual([
        TestReconciliationState.KnownSuccess,
        TestReconciliationState.KnownFail,
      ]);
      expect(
        actual.find((a) => a.status === TestReconciliationState.KnownFail)?.lineNumberOfError
      ).toEqual(testBlock2.end.line - 1);
    });

    it('can handle template literal in the context', () => {
      const testBlock2 = helper.makeItBlock('template literal I got ${str}', [6, 0, 7, 20], {
        nameType: 'TemplateLiteral',
      });
      const testBlock3 = helper.makeItBlock(
        'template literal ${i}, ${k}: {something}',
        [10, 5, 20, 5],
        { nameType: 'TemplateLiteral' }
      );

      const assertions = [
        helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 0]),
        helper.makeAssertion(
          'template literal I got something like this',
          TestReconciliationState.KnownFail,
          [],
          [2, 0]
        ),
        helper.makeAssertion(
          'template literal 1, 2: {something}',
          TestReconciliationState.KnownSuccess,
          [],
          [3, 0]
        ),
      ];
      const sut = newProviderWithData([
        makeData([testBlock, testBlock3, testBlock2], assertions, filePath),
      ]);
      const actual = sut.getResults(filePath);
      expect(actual).toHaveLength(3);
      expect(actual.map((a) => a.name)).toEqual([
        assertions[0].fullName,
        assertions[1].fullName,
        assertions[2].fullName,
      ]);
      expect(actual.map((a) => a.identifier.title)).toEqual([
        assertions[0].title,
        assertions[1].title,
        assertions[2].title,
      ]);
      expect(actual.map((a) => a.identifier.ancestorTitles)).toEqual([
        assertions[0].ancestorTitles,
        assertions[1].ancestorTitles,
        assertions[2].ancestorTitles,
      ]);
      expect(actual.map((a) => a.status)).toEqual([
        TestReconciliationState.KnownSuccess,
        TestReconciliationState.KnownFail,
        TestReconciliationState.KnownSuccess,
      ]);
    });

    describe('safe-guard warnings', () => {
      let consoleWarning;
      beforeEach(() => {
        consoleWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
      });

      it('report warning if match failed', () => {
        const assertions = [
          helper.makeAssertion(
            'another name',
            TestReconciliationState.KnownSuccess,
            ['d-1'],
            [20, 25]
          ),
        ];
        const sut = newProviderWithData([makeData([testBlock], assertions, filePath)]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.Unknown);
        expect(actual[0].shortMessage).not.toBeUndefined();
        expect(consoleWarning).toHaveBeenCalled();
      });
      it('1-many match (jest.each) detected', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
        ];
        const sut = newProviderWithData([
          makeData([{ ...testBlock, lastProperty: 'each' }], assertions, filePath),
        ]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.KnownSuccess);
        expect(actual[0].shortMessage).toBeUndefined();
        expect(consoleWarning).not.toHaveBeenCalled();
      });
      it('when all goes according to plan, no warning but can still log debug message', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
        ];
        const sut = newProviderWithData([makeData([testBlock], assertions, filePath)]);
        sut.options = { verbose: true };
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
        expect(actual[0].shortMessage).toBeUndefined();
        expect(consoleWarning).not.toHaveBeenCalled();
      });
    });
    describe('parameterized tests', () => {
      const testBlock2 = helper.makeItBlock('p-test-$status', [8, 0, 20, 20], {
        lastProperty: 'each',
      });

      it('test results shared the same range will be grouped', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion('p-test-success', TestReconciliationState.KnownSuccess, [], [8, 20]),
          helper.makeAssertion('p-test-fail-1', TestReconciliationState.KnownFail, [], [8, 20]),
          helper.makeAssertion('p-test-fail-2', TestReconciliationState.KnownFail, [], [8, 20]),
        ];
        const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);
        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 3 assertions match to the same test block
        expect(actual).toHaveLength(2);
        expect(actual.map((a) => a.name)).toEqual([testBlock.name, 'p-test-fail-1']);
        expect(actual.map((a) => a.status)).toEqual([
          TestReconciliationState.KnownFail,
          TestReconciliationState.KnownFail,
        ]);

        // the parameterized test use the first failed results as its "primary" result and
        // put the other 2 tests in "extraResults" sorted by test precedence: fail > success
        const pResult = actual[1];
        expect(pResult.multiResults).toHaveLength(2);
        expect(pResult.multiResults!.map((a) => [a.name, a.status])).toEqual([
          ['p-test-fail-2', TestReconciliationState.KnownFail],
          ['p-test-success', TestReconciliationState.KnownSuccess],
        ]);
      });
      it('grouped test results are sorted by status precedence fail > unknown > skip > success', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion('p-test-success', TestReconciliationState.KnownSuccess, [], [8, 20]),
          helper.makeAssertion('p-test-skip', TestReconciliationState.KnownSkip, [], [8, 20]),
          helper.makeAssertion('p-test-fail', TestReconciliationState.KnownFail, [], [8, 20]),
          helper.makeAssertion('p-test-unknown', TestReconciliationState.Unknown, [], [8, 20]),
        ];
        const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);

        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 4 assertions match to the same test block
        expect(actual).toHaveLength(2);

        const pResult = actual[1];
        expect(pResult.name).toEqual('p-test-fail');
        expect(pResult.multiResults).toHaveLength(3);
        expect(pResult.multiResults!.map((a) => a.name)).toEqual([
          'p-test-unknown',
          'p-test-skip',
          'p-test-success',
        ]);
      });
      it('parameterized test is consider failed/skip/unknown if any of its test has the corresponding status', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion('p-test-success', TestReconciliationState.KnownSuccess, [], [8, 20]),
          helper.makeAssertion('p-test-skip', TestReconciliationState.KnownSkip, [], [8, 20]),
          helper.makeAssertion('p-test-unknown', TestReconciliationState.Unknown, [], [8, 20]),
        ];
        const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);
        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 4 assertions match to the same test block
        expect(actual).toHaveLength(2);

        const pResult = actual[1];
        expect(pResult.name).toEqual('p-test-unknown');
        expect(pResult.multiResults).toHaveLength(2);
        expect(pResult.multiResults!.map((a) => a.name)).toEqual(['p-test-skip', 'p-test-success']);
      });
      it('parameterized test are successful only if all of its tests succeeded', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion(
            'p-test-success-1',
            TestReconciliationState.KnownSuccess,
            [],
            [8, 20]
          ),
          helper.makeAssertion(
            'p-test-success-2',
            TestReconciliationState.KnownSuccess,
            [],
            [8, 20]
          ),
        ];
        const sut = newProviderWithData([makeData([testBlock, testBlock2], assertions, filePath)]);
        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 4 assertions match to the same test block
        expect(actual).toHaveLength(2);

        const pResult = actual[1];
        expect(pResult.name).toEqual('p-test-success-1');
        expect(pResult.multiResults).toHaveLength(1);
        expect(pResult.multiResults!.map((a) => a.name)).toEqual(['p-test-success-2']);
      });
    });
    describe('parameterized describes', () => {
      const tBlock = helper.makeItBlock('p-test-$count', [8, 0, 20, 20], { lastProperty: 'each' });
      const dBlock = helper.makeDescribeBlock('p-describe-scount', [tBlock], {
        lastProperty: 'each',
      });
      it('test from different parameter block can still be grouped', () => {
        const assertions = [
          helper.makeAssertion(
            'p-test-1',
            TestReconciliationState.KnownSuccess,
            ['p-describe-1'],
            [8, 20]
          ),
          helper.makeAssertion(
            'p-test-2',
            TestReconciliationState.KnownFail,
            ['p-describe-1'],
            [8, 20]
          ),
          helper.makeAssertion(
            'p-test-1',
            TestReconciliationState.KnownSuccess,
            ['p-describe-2'],
            [8, 20]
          ),
          helper.makeAssertion(
            'p-test-2',
            TestReconciliationState.KnownSuccess,
            ['p-describe-2'],
            [8, 20]
          ),
        ];
        const sut = newProviderWithData([makeData([dBlock], assertions, filePath)]);
        const actual = sut.getResults(filePath);

        expect(actual).toHaveLength(1);

        const pResult = actual[0];
        expect([pResult.name, pResult.status]).toEqual([
          'p-describe-1 p-test-2',
          TestReconciliationState.KnownFail,
        ]);
        expect(pResult.multiResults).toHaveLength(3);
        expect(pResult.multiResults!.map((a) => a.name)).toEqual([
          'p-describe-1 p-test-1',
          'p-describe-2 p-test-1',
          'p-describe-2 p-test-2',
        ]);
      });
    });
    describe('when no assertions returned', () => {
      let sut: TestResultProvider;
      const tBlock = helper.makeItBlock('a test', [8, 0, 20, 20]);
      beforeEach(() => {
        sut = new TestResultProvider(eventsMock);
        setupMockParse([tBlock]);
      });
      it.each([[[]], [undefined]])(
        'all tests are marked unknown, assertions = %s',
        (assertions) => {
          mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
          const actual = sut.getResults(filePath);
          expect(actual).toHaveLength(1);
          const { name, status, sourceHistory } = actual[0];
          expect(name).toEqual(tBlock.name);
          expect(status).toEqual('Unknown');
          expect(sourceHistory).toEqual(['match-failed']);
        }
      );
    });
    describe('error handling', () => {
      let itBlocks, assertions;
      beforeEach(() => {
        [itBlocks, assertions] = createDataSet();
      });

      const setupForNonTest = (sut: any) => {
        sut.updateTestFileList(['test-file']);
        itBlocks = [];
      };
      it.each`
        desc                         | setup              | itBlockOverride | expectedResults | statsChange
        ${'parse failed'}            | ${forceParseError} | ${undefined}    | ${[]}           | ${'fail'}
        ${'match failed'}            | ${forceMatchError} | ${undefined}    | ${'Unknown'}    | ${'fail'}
        ${'file is not a test file'} | ${setupForNonTest} | ${[]}           | ${undefined}    | ${'no change'}
      `(
        'when $desc => returns $expectedResults, stats changed: $statsChange',
        ({ setup, itBlockOverride, expectedResults, statsChange }) => {
          const sut = newProviderWithData([
            makeData(itBlockOverride ?? itBlocks, assertions, 'whatever'),
          ]);
          setup(sut);

          const stats = sut.getTestSuiteStats();
          if (expectedResults === 'Unknown') {
            expect(
              sut.getResults('whatever').every((r) => r.status === expectedResults)
            ).toBeTruthy();
          } else {
            expect(sut.getResults('whatever')).toEqual(expectedResults);
          }
          if (statsChange === 'fail') {
            expect(sut.getTestSuiteStats()).toEqual({ ...stats, fail: stats.fail + 1, unknown: 0 });
          } else if (statsChange === 'unknown') {
            expect(sut.getTestSuiteStats()).toEqual({ ...stats, unknown: 1 });
          } else {
            expect(sut.getTestSuiteStats()).toEqual(stats);
          }
        }
      );
      it('parse error will output log only in verbose mode', () => {
        let sut = newProviderWithData([makeData(itBlocks, assertions, 'whatever')], {
          verbose: false,
        });
        sut.getResults('whatever');
        forceParseError();
        expect(console.log).not.toHaveBeenCalled();

        sut = newProviderWithData([makeData(itBlocks, assertions, 'whatever')], { verbose: true });
        forceParseError();
        sut.getResults('whatever');
        expect(console.log).toHaveBeenCalled();
      });
    });
  });

  describe('getSortedResults()', () => {
    const filePath = 'file.js';
    const emptyResult = {
      fail: [],
      skip: [],
      success: [],
      unknown: [],
    };
    let sut;
    beforeEach(() => {
      const [itBlocks, assertions] = createDataSet();
      sut = newProviderWithData([makeData(itBlocks, assertions, filePath)]);
    });

    it('should return cached results if possible', () => {
      const getResultSpy = jest.spyOn(sut, 'getResults');
      const expected = sut.getSortedResults(filePath);
      expect(getResultSpy).toHaveBeenCalledTimes(1);

      expect(sut.getSortedResults(filePath)).toBe(expected);
      expect(getResultSpy).toHaveBeenCalledTimes(1);
    });

    it('should sort the test results', () => {
      const sorted = sut.getSortedResults(filePath);
      expect(sorted.fail.map((t) => t.name)).toEqual(['test 2']);
      expect(sorted.success.map((t) => t.name)).toEqual(['test 1', 'test 5']);
      expect(sorted.skip.map((t) => t.name)).toEqual(['test 3']);
      expect(sorted.unknown.map((t) => t.name)).toEqual(['test 4']);
    });
    it('returns undefined for non-test file', () => {
      sut.updateTestFileList(['test-file']);
      expect(sut.getSortedResults('source file')).toBeUndefined();
    });
    it('returns undefined if no result for the file yet', () => {
      const getResultSpy = jest.spyOn(sut, 'getResults');
      getResultSpy.mockImplementation(() => {
        return undefined;
      });
      sut.updateTestFileList(['test-file']);
      expect(sut.getSortedResults('test-file')).toBeUndefined();
    });
    it('internal error cause empty result', () => {
      forceParseError();
      expect(sut.getSortedResults(filePath)).toEqual(emptyResult);
    });
  });

  describe('updateTestResults()', () => {
    it('should only reset the cache for files in result', () => {
      const [itBlocks, assertions] = createDataSet();
      const sut = newProviderWithData([
        makeData(itBlocks, assertions, 'file 1'),
        makeData(itBlocks, assertions, 'file 2'),
      ]);
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(0);

      // warm up the cache
      const results1 = sut.getResults('file 1');
      const results2 = sut.getResults('file 2');
      expect(results1).toHaveLength(5);
      expect(results2).toHaveLength(5);
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(2);

      // now let's update "file 1"
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce([
        { file: 'file 1', status: 'KnownSuccess' },
      ]);
      sut.updateTestResults({} as any, {} as any);

      mockReconciler.assertionsForTestFile.mockClear();

      // to get result from "file 1" should trigger mockReconciler.assertionsForTestFile
      const r1 = sut.getResults('file 1');
      expect(r1).toEqual(results1);
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(1);
      mockReconciler.assertionsForTestFile.mockClear();

      // but get result from "file 2" should just return the cached value, i.e. not trigger mockReconciler.assertionsForTestFile
      const r2 = sut.getResults('file 2');
      expect(r2).toEqual(results2);
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(0);
    });

    it('should update the jest-editor-support cached file status', () => {
      const expected: any = [];
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(expected);

      const sut = new TestResultProvider(eventsMock);
      const results: any = {};

      expect(sut.updateTestResults(results, {} as any)).toBe(expected);
      expect(mockReconciler.updateFileWithJestStatus).toHaveBeenCalledWith(results);
    });
    it('should updated the stats', () => {
      const results: any = [
        { file: 'a', status: 'KnownSuccess' },
        { file: 'b', status: 'KnownFail' },
      ];
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(results);

      const sut = new TestResultProvider(eventsMock);
      sut.updateTestResults({} as any, {} as any);
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({ success: 1, fail: 1, unknown: 0 });
    });
    it('should fire testSuiteChanged event', () => {
      const results: any = [
        { file: 'a', status: 'KnownSuccess' },
        { file: 'b', status: 'KnownFail' },
      ];
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(results);

      const sut = new TestResultProvider(eventsMock);
      const process: any = { id: 'a-process' };
      sut.updateTestResults({} as any, process);
      expect(sut.events.testSuiteChanged.fire).toHaveBeenCalledWith({
        type: 'assertions-updated',
        files: ['a', 'b'],
        process,
      });
    });
  });

  it('removeCachedResults', () => {
    setupMockParse([]);
    mockReconciler.assertionsForTestFile.mockReturnValue([]);

    const sut = new TestResultProvider(eventsMock);

    sut.getResults('whatever');
    expect(mockParse).toHaveBeenCalledTimes(1);

    // 2nd time would use the cache value, no need to parse again
    sut.getResults('whatever');
    expect(mockParse).toHaveBeenCalledTimes(1);

    //if we remove the cache then it will need to parse again
    sut.removeCachedResults('whatever');
    sut.getResults('whatever');
    expect(mockParse).toHaveBeenCalledTimes(2);
  });
  describe('testFile list', () => {
    it('when available, can optimize to only parse file in the list', () => {
      const sut = newProviderWithData([makeData([], [], 'file1')]);
      sut.updateTestFileList(['file1']);
      sut.getResults('whatever');
      expect(mockParse).not.toHaveBeenCalled();
      sut.getResults('file1');
      expect(mockParse).toHaveBeenCalled();
    });
    it('fire testListUpdated event', () => {
      const sut = newProviderWithData([makeData([], [], 'file1')]);
      sut.updateTestFileList(['file1']);
      expect(sut.events.testListUpdated.fire).toHaveBeenCalledWith(['file1']);
    });
    it('if not available, revert to the legacy behavior: parse any file requested', () => {
      setupMockParse([]);
      mockReconciler.assertionsForTestFile.mockReturnValue([]);
      const sut = new TestResultProvider(eventsMock);
      sut.updateTestFileList(['file1']);
      sut.getResults('whatever');
      expect(mockParse).not.toHaveBeenCalled();

      sut.updateTestFileList(undefined);
      sut.getResults('whatever');
      expect(mockParse).toHaveBeenCalled();
    });
    describe('getTestList', () => {
      it('returns testFiles if available', () => {
        const sut = new TestResultProvider(eventsMock);
        expect(sut.getTestList()).toEqual([]);

        sut.updateTestFileList(['file1']);
        expect(sut.getTestList()).toEqual(['file1']);

        mockReconciler.updateFileWithJestStatus.mockReturnValueOnce([{ file: 'file2' }]);
        sut.updateTestResults({} as any, {} as any);
        expect(sut.getTestList()).toEqual(['file1']);

        sut.updateTestFileList([]);
        expect(sut.getTestList()).toEqual([]);
      });
      it('otherwise returns cached result file list', () => {
        const sut = new TestResultProvider(eventsMock);
        expect(sut.getTestList()).toEqual([]);

        mockReconciler.updateFileWithJestStatus.mockReturnValueOnce([{ file: 'file2' }]);
        sut.updateTestResults({} as any, {} as any);
        expect(sut.getTestList()).toEqual(['file2']);
      });
    });
  });
  describe('events', () => {
    describe('listen to session events', () => {
      it('when session start, cache and reconciler will be reset', () => {
        const sut = newProviderWithData([makeData([], [], 'whatever')]);
        expect(eventsMock.onTestSessionStarted.event).toHaveBeenCalled();
        expect(mockTestReconciler).toHaveBeenCalledTimes(1);

        sut.getResults('whatever');
        sut.getResults('whatever');
        expect(mockParse).toHaveBeenCalledTimes(1);

        const sessionStartListener = eventsMock.onTestSessionStarted.event.mock.calls[0][0];
        sessionStartListener({} as any);

        expect(mockTestReconciler).toHaveBeenCalledTimes(2);
      });
    });
    it('will dispose result events', () => {
      const sut = new TestResultProvider(eventsMock);
      sut.dispose();
      expect(sut.events.testListUpdated.dispose).toHaveBeenCalled();
      expect(sut.events.testSuiteChanged.dispose).toHaveBeenCalled();
    });
  });
  describe('invalidateTestResults', () => {
    it('remove cached results means getResult() will returns nothing', () => {
      const [iteBlocks, assertions] = createDataSet();
      const sut = newProviderWithData([
        makeData(iteBlocks, assertions, 'file 1', 'KnownSuccess'),
        makeData(iteBlocks, assertions, 'file 2', 'KnownFail'),
      ]);

      expect(sut.getTestSuiteResult('file 1')).not.toBeUndefined();
      expect(sut.getTestSuiteResult('file 2')).not.toBeUndefined();

      //invalidate "file 1"
      sut.invalidateTestResults('file 1');

      // reconciler's test should be removed
      expect(mockReconciler.removeTestFile).toHaveBeenCalled();
      //internal cache for "file 1" should also be removed
      expect(sut.getTestSuiteResult('file 1')).toBeUndefined();

      // should not impact "file 2"
      expect(sut.getTestSuiteResult('file 2')).not.toBeUndefined();
    });
  });
  describe('getTestSuiteStats', () => {
    let sut;
    const testFiles = ['file 1', 'file 2', 'file 3', 'file 4', 'file 5'];
    beforeEach(() => {
      const [itBlocks, assertions] = createDataSet();
      sut = newProviderWithData([
        makeData(itBlocks, assertions, 'file 1', 'KnownSuccess'),
        makeData(itBlocks, assertions, 'file 2', 'KnownFail'),
        makeData(itBlocks, assertions, 'file 3', 'KnownSuccess'),
        makeData(itBlocks, assertions, 'file 4', 'KnownSkip'),
        makeData(itBlocks, assertions, 'file 5', 'Unknown'),
      ]);
    });
    it('calculate stats based on the cached results', () => {
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({
        success: 2,
        fail: 1,
        unknown: 2,
      });
    });
    it('if there are tests not in the cache, they will be marked as "unknown"', () => {
      // cache will be cleared
      sut.updateTestFileList(testFiles);
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({
        success: 0,
        fail: 0,
        unknown: 5,
      });
    });
  });
  describe('updateTestFileList', () => {
    it('will reset file cache', () => {
      const [itBlocks, assertions] = createDataSet();
      const sut = newProviderWithData([makeData(itBlocks, assertions, 'file 1')]);
      expect(sut.getTestSuiteResult('file 1')).not.toBeUndefined();

      sut.updateTestFileList(['file 1', 'file 2']);
      expect(sut.getTestSuiteResult('file 1')).toBeUndefined();
    });
  });
  describe('isTestFile', () => {
    const target = 'file-1';
    beforeEach(() => {
      mockReconciler.updateFileWithJestStatus.mockClear();
    });
    it.each`
      testFiles               | testResults   | expected
      ${undefined}            | ${undefined}  | ${'maybe'}
      ${undefined}            | ${['file-2']} | ${'maybe'}
      ${[]}                   | ${[]}         | ${'no'}
      ${[]}                   | ${['file-1']} | ${'yes'}
      ${[]}                   | ${['file-2']} | ${'no'}
      ${['file-1']}           | ${undefined}  | ${'yes'}
      ${['file-2']}           | ${undefined}  | ${'no'}
      ${['file-1', 'file-2']} | ${undefined}  | ${'yes'}
      ${['file-1']}           | ${['file-1']} | ${'yes'}
      ${['file-2']}           | ${['file-1']} | ${'yes'}
      ${['file-2']}           | ${['file-2']} | ${'no'}
    `('$testFiles, $testResults => $expected', ({ testFiles, testResults, expected }) => {
      const sut = new TestResultProvider(eventsMock);
      if (testFiles) {
        sut.updateTestFileList(testFiles);
      }
      if (testResults) {
        const mockResults = testResults.map((file) => ({ file, status: 'KnownSuccess' }));
        mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(mockResults);
        sut.updateTestResults({} as any, {} as any);
      }

      expect(sut.isTestFile(target)).toEqual(expected);
    });
  });
  describe('snapshot', () => {
    const testPath = 'test-file';
    let itBlocks, assertions, snapshotBlocks;
    beforeEach(() => {
      [itBlocks, assertions, snapshotBlocks] = createDataSet();
      const dBlock0 = helper.makeDescribeBlock('describe-test-1', [itBlocks[0]], {
        start: itBlocks[0].start,
        end: itBlocks[0].end,
      });
      const dBlock4 = helper.makeDescribeBlock('describe-test-5', [itBlocks[4]], {
        start: itBlocks[4].start,
        end: itBlocks[4].end,
      });
      itBlocks[0] = dBlock0;
      itBlocks[4] = dBlock4;
      assertions[0].ancestorTitles = ['describe-test-1'];
      assertions[4].ancestorTitles = ['describe-test-5'];

      mockSnapshotProvider.parse.mockImplementation((testPath: string) => ({
        testPath,
        blocks: snapshotBlocks,
      }));
    });
    it('matched result should contain snapshot info', () => {
      const sut = newProviderWithData([makeData(itBlocks, assertions, testPath)]);
      sut.getResults(testPath);
      const call = (sut.events.testSuiteChanged.fire as jest.Mocked<any>).mock.calls.find(
        (call) => call[0].type === 'result-matched'
      );
      expect(call).not.toBeUndefined();
      const container = sut.getTestSuiteResult(testPath)?.assertionContainer;
      expect(container).not.toBeUndefined();

      let matchCount = 0;
      [...container.childContainers.flatMap((c) => c.childData), ...container.childData].forEach(
        (child) => {
          const sBlock = snapshotBlocks.find((block) => block.marker === child.name);
          if (sBlock) {
            expect(child.attrs.snapshot).toEqual(sBlock.isInline ? 'inline' : 'external');
            matchCount += 1;
          } else {
            expect(child.attrs.snapshot).toBeUndefined();
          }
        }
      );
      expect(matchCount).toEqual(2);
    });
    it('forward previewSnapshot to the snapshot provider', async () => {
      const sut = newProviderWithData([makeData([], [], '')]);
      await sut.previewSnapshot('whatever', 'full test name');
      expect(mockSnapshotProvider.previewSnapshot).toHaveBeenCalledWith(
        'whatever',
        'full test name'
      );
    });
  });
  describe('allow parserOptions', () => {
    const testPath = 'whatever.ts';
    let sut, parserOptions;
    beforeEach(() => {
      const [itBlocks, assertions] = createDataSet();
      parserOptions = { plugins: { decorators: 'legacy' } };
      sut = newProviderWithData([makeData(itBlocks, assertions, testPath)], {
        parserOptions: { plugins: { decorators: 'legacy' } },
      });
    });
    it('always parse with the latest option', () => {
      sut.getResults(testPath);
      expect(mockParse).toHaveBeenCalledWith(testPath, undefined, parserOptions);
      expect(mockSnapshotProvider.parse).toHaveBeenCalledWith(testPath, { parserOptions });

      const newParserOptions = { plugins: { decorators: { allowCallParenthesized: true } } };
      sut.options = {
        parserOptions: newParserOptions,
      };
      sut.getResults(testPath);
      expect(mockParse).toHaveBeenCalledWith(testPath, undefined, newParserOptions);
      expect(mockSnapshotProvider.parse).toHaveBeenCalledWith(testPath, {
        parserOptions: newParserOptions,
      });
    });
  });
});
