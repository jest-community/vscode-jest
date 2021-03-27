jest.unmock('../../src/TestResults/TestResultProvider');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../../src/helpers');
jest.unmock('../test-helper');

const mockTestReconciler = jest.fn();
const mockReconciler = {
  updateFileWithJestStatus: jest.fn(),
  assertionsForTestFile: jest.fn(),
  stateForTestFile: jest.fn(),
  removeTestFile: jest.fn(),
};

const mockParse = jest.fn();
jest.mock('jest-editor-support', () => {
  const TestReconciler = mockTestReconciler;
  const parse = mockParse;

  return { TestReconciler, parse };
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

import { TestResultProvider } from '../../src/TestResults/TestResultProvider';
import { TestReconciliationState } from '../../src/TestResults';
import * as helper from '../test-helper';
import { ItBlock } from 'jest-editor-support';

const mockmockParse = (itBlocks: ItBlock[]) => {
  mockParse.mockReturnValue({
    root: helper.makeRoot(itBlocks),
    itBlocks,
  });
};

const setupJestEditorSupport = () => {
  const testBlocks = [
    helper.makeItBlock('test 1 ', [2, 3, 4, 5]),
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
  mockmockParse(testBlocks);
  mockReconciler.assertionsForTestFile.mockReturnValue(assertions);
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
  const forceMatchError = (sut: any) => {
    sut.matchResults = jest.fn(() => {
      throw new Error('forced error');
    });
  };
  beforeEach(() => {
    jest.resetAllMocks();
    mockTestReconciler.mockReturnValue(mockReconciler);
  });

  describe('getResults()', () => {
    it('should return the cached results if possible', () => {
      const sut = new TestResultProvider();
      mockmockParse([]);
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([]);
      const expected = sut.getResults(filePath);

      expect(sut.getResults(filePath)).toBe(expected);
    });

    it('should re-index the line and column number to zero-based', () => {
      const sut = new TestResultProvider();
      mockmockParse([testBlock]);
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([assertion]);
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
      const sut = new TestResultProvider();
      mockmockParse([testBlock]);
      const assertionC = { ...assertion };
      assertionC.title = 'xxx';
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([assertionC]);
      const actual = sut.getResults(filePath);
      expect(actual).toHaveLength(1);
      expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
    });

    it('should look up the test result by test name', () => {
      const sut = new TestResultProvider();
      mockmockParse([testBlock]);
      const assertionC = { ...assertion };
      assertionC.line = undefined;
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([assertionC]);
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
      const sut = new TestResultProvider();
      mockmockParse([testBlock]);
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([]);
      const actual = sut.getResults(filePath);

      expect(actual).toHaveLength(1);
      expect(actual[0].status).toBe(TestReconciliationState.Unknown);
      expect(actual[0].shortMessage).not.toBeUndefined();
      expect(actual[0].terseMessage).toBeUndefined();
    });
    describe('duplicate test names', () => {
      const testBlock2 = helper.makeItBlock(testBlock.name, [5, 3, 7, 5]);
      beforeEach(() => {});
      it('can resolve as long as they have the same context structure', () => {
        mockmockParse([testBlock, testBlock2]);

        const sut = new TestResultProvider();
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 0]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [10, 0]),
        ]);
        const actual = sut.getResults(filePath);

        expect(actual).toHaveLength(2);
        expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
        expect(actual[1].status).toBe(TestReconciliationState.KnownSuccess);
      });
      it('however when context structures are different, duplicate names within the same layer can not be resolved.', () => {
        mockmockParse([testBlock, testBlock2]);

        const sut = new TestResultProvider();
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
      const sut = new TestResultProvider();
      const testBlock2 = helper.makeItBlock('test2', [5, 3, 7, 5]);
      mockmockParse([testBlock, testBlock2]);
      mockReconciler.assertionsForTestFile.mockReturnValueOnce([
        helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 1]),
        helper.makeAssertion(testBlock2.name, TestReconciliationState.KnownFail, [], [2, 2], {
          line: 3,
        }),
      ]);
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
      const sut = new TestResultProvider();
      const testBlock2 = helper.makeItBlock('template literal I got ${str}', [6, 0, 7, 20]);
      const testBlock3 = helper.makeItBlock('template literal ${i}, ${k}: {something}', [
        10,
        5,
        20,
        5,
      ]);

      mockmockParse([testBlock, testBlock3, testBlock2]);
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
      mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
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
      const consoleWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
      describe('when contexts does not align', () => {
        beforeEach(() => {
          mockmockParse([testBlock]);
          mockReconciler.assertionsForTestFile.mockReturnValueOnce([
            helper.makeAssertion('whatever', TestReconciliationState.KnownSuccess, [], [12, 19]),
            helper.makeAssertion('whatever', TestReconciliationState.KnownSuccess, [], [20, 25]),
          ]);
        });
        it('reprots warning when verbose is true', () => {
          const sut = new TestResultProvider();
          sut.verbose = true;

          const actual = sut.getResults(filePath);
          expect(actual).toHaveLength(1);
          expect(actual[0].status).toBe(TestReconciliationState.Unknown);
          expect(actual[0].shortMessage).not.toBeUndefined();
          expect(consoleWarning).toHaveBeenCalled();
        });
        it('not warning if verbose is off', () => {
          const sut = new TestResultProvider();
          sut.verbose = false;

          const actual = sut.getResults(filePath);
          expect(actual).toHaveLength(1);
          expect(actual[0].status).toBe(TestReconciliationState.Unknown);
          expect(actual[0].shortMessage).not.toBeUndefined();
          expect(consoleWarning).not.toHaveBeenCalled();
        });
      });
      it('report warning if context match but neither name nor location matched', () => {
        const sut = new TestResultProvider();
        sut.verbose = true;
        mockmockParse([testBlock]);
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion('another name', TestReconciliationState.KnownSuccess, [], [20, 25]),
        ]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.KnownSuccess);
        expect(actual[0].shortMessage).toBeUndefined();
        expect(consoleWarning).toHaveBeenCalled();
      });
      it('report warning if match failed', () => {
        const sut = new TestResultProvider();
        sut.verbose = true;
        mockmockParse([testBlock]);
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(
            'another name',
            TestReconciliationState.KnownSuccess,
            ['d-1'],
            [20, 25]
          ),
        ]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.Unknown);
        expect(actual[0].shortMessage).not.toBeUndefined();
        expect(consoleWarning).toHaveBeenCalled();
      });
      it('1-many match (jest.each) detected', () => {
        const sut = new TestResultProvider();
        sut.verbose = true;
        mockmockParse([testBlock]);
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [1, 12]),
        ]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.KnownSuccess);
        expect(actual[0].shortMessage).toBeUndefined();
      });
      it('when all goes according to plan, no warning', () => {
        const sut = new TestResultProvider();
        sut.verbose = true;
        mockmockParse([testBlock]);
        mockReconciler.assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
        ]);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
        expect(actual[0].shortMessage).toBeUndefined();
        expect(consoleWarning).not.toHaveBeenCalled();
      });
    });
    describe('parameterized tests', () => {
      let sut: TestResultProvider;
      const testBlock2 = helper.makeItBlock('p-test-$status', [8, 0, 20, 20]);
      beforeEach(() => {
        sut = new TestResultProvider();
        mockmockParse([testBlock, testBlock2]);
      });
      it('test results shared the same range will be grouped', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion('p-test-success', TestReconciliationState.KnownSuccess, [], [8, 20]),
          helper.makeAssertion('p-test-fail-1', TestReconciliationState.KnownFail, [], [8, 20]),
          helper.makeAssertion('p-test-fail-2', TestReconciliationState.KnownFail, [], [8, 20]),
        ];
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 3 assertions match to the same test block
        expect(actual).toHaveLength(2);
        expect(actual.map((a) => a.name)).toEqual([testBlock.name, 'p-test-fail-1']);
        expect(actual.map((a) => a.status)).toEqual([
          TestReconciliationState.KnownFail,
          TestReconciliationState.KnownFail,
        ]);

        // the parameterized test use the first failed results as its "primary" result and
        // put the other 2 tests in "extraResults" sorted by test precedence: fail > sucess
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
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
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
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
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
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
        const actual = sut.getResults(filePath);

        // should only have 2 test results returned, as the last 4 assertions match to the same test block
        expect(actual).toHaveLength(2);

        const pResult = actual[1];
        expect(pResult.name).toEqual('p-test-success-1');
        expect(pResult.multiResults).toHaveLength(1);
        expect(pResult.multiResults!.map((a) => a.name)).toEqual(['p-test-success-2']);
      });
    });
    describe('paramertized describes', () => {
      let sut: TestResultProvider;
      const tBlock = helper.makeItBlock('p-test-$count', [8, 0, 20, 20]);
      const dBlock = helper.makeDescribeBlock('p-describe-scount', [tBlock]);
      beforeEach(() => {
        sut = new TestResultProvider();
        mockmockParse([dBlock]);
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
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
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
    describe('when no assertions returned => all tests are marked unknown', () => {
      let sut: TestResultProvider;
      const tBlock = helper.makeItBlock('a test', [8, 0, 20, 20]);
      beforeEach(() => {
        sut = new TestResultProvider();
        mockmockParse([tBlock]);
      });
      it.each([[[]], [undefined]])('for assertions = %s', (assertions) => {
        mockReconciler.assertionsForTestFile.mockReturnValueOnce(assertions);
        const actual = sut.getResults(filePath);
        expect(actual).toHaveLength(1);
        const { name, status, reason } = actual[0];
        expect(name).toEqual(tBlock.name);
        expect(status).toEqual('Unknown');
        expect(reason).toEqual('no-matched-assertion');
      });
    });
    describe('error handling', () => {
      beforeEach(() => {
        setupJestEditorSupport();
      });

      const setupForNonTest = (sut: any) => {
        sut.updateTestFileList(['test-file']);
      };
      it.each`
        desc                         | setup              | expectedResults  | isFail
        ${'parse failed'}            | ${forceParseError} | ${'throw error'} | ${true}
        ${'match failed'}            | ${forceMatchError} | ${'throw error'} | ${true}
        ${'file is not a test file'} | ${setupForNonTest} | ${undefined}     | ${false}
      `(
        'when $desc => returns $expectedResults, stats.fail = $isFail',
        ({ setup, expectedResults, isFail }) => {
          const sut = new TestResultProvider();
          setup(sut);

          const stats = sut.getTestSuiteStats();
          if (expectedResults === 'throw error') {
            expect(() => sut.getResults('whatever')).toThrow();
          } else {
            expect(sut.getResults('whatever')).toEqual(expectedResults);
          }
          if (isFail) {
            expect(sut.getTestSuiteStats()).toEqual({ ...stats, fail: stats.fail + 1 });
          } else {
            expect(sut.getTestSuiteStats()).toEqual(stats);
          }
        }
      );
    });
  });

  describe('getSortedResults()', () => {
    const filePath = 'file.js';
    beforeEach(() => {
      setupJestEditorSupport();
    });

    it('should return cached results if possible', () => {
      const sut = new TestResultProvider();
      const getResultSpy = jest.spyOn(sut, 'getResults');
      const expected = sut.getSortedResults(filePath);
      expect(getResultSpy).toBeCalledTimes(1);

      expect(sut.getSortedResults(filePath)).toBe(expected);
      expect(getResultSpy).toBeCalledTimes(1);
    });

    it('should sort the test results', () => {
      const sut = new TestResultProvider();
      const sorted = sut.getSortedResults(filePath);
      expect(sorted.fail.map((t) => t.name)).toEqual(['test 2']);
      expect(sorted.success.map((t) => t.name)).toEqual(['test 1', 'test 5']);
      expect(sorted.skip.map((t) => t.name)).toEqual(['test 3']);
      expect(sorted.unknown.map((t) => t.name)).toEqual(['test 4']);
    });
    it('returns undefined for non-test file', () => {
      const sut = new TestResultProvider();
      sut.updateTestFileList(['test-file']);
      expect(sut.getSortedResults('source file')).toBeUndefined();
    });
    it('can throw for internal error for once', () => {
      forceParseError();
      const sut = new TestResultProvider();
      expect(() => sut.getSortedResults(filePath)).toThrow();

      //2nd time will just return empty result
      expect(sut.getSortedResults(filePath)).toEqual({
        fail: [],
        skip: [],
        success: [],
        unknown: [],
      });
    });
  });

  describe('updateTestResults()', () => {
    beforeEach(() => {
      setupJestEditorSupport();
    });
    it('should only reset the cache for files in result', () => {
      const sut = new TestResultProvider();
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(0);

      // warm up the cache
      const results1 = sut.getResults('file 1');
      const results2 = sut.getResults('file 2');
      expect(results1).toHaveLength(5);
      expect(results2).toHaveLength(5);
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(2);
      mockReconciler.assertionsForTestFile.mockClear();

      // now let's update "file 1"
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce([
        { file: 'file 1', status: 'KnownSuceess' },
      ]);
      sut.updateTestResults({} as any);

      // to get result from "file 1" should trigger mockReconciler.assertionsForTestFile
      const r1 = sut.getResults('file 1');
      expect(r1).toEqual(results1);
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(1);
      mockReconciler.assertionsForTestFile.mockClear();

      // but get result from "file 2" should just return the cached value, i.e. not trigger mockReconciler.assertionsForTestFile
      const r2 = sut.getResults('file 2');
      expect(r2).toEqual(results2);
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(0);
    });

    it('should update the jest-editor-support cached file status', () => {
      const expected: any = [];
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(expected);

      const sut = new TestResultProvider();
      const results: any = {};

      expect(sut.updateTestResults(results)).toBe(expected);
      expect(mockReconciler.updateFileWithJestStatus).toBeCalledWith(results);
    });
    it('should updated the stats', () => {
      const results: any = [
        { file: 'a', status: 'KnownSuccess' },
        { file: 'b', status: 'KnownFail' },
      ];
      mockReconciler.updateFileWithJestStatus.mockReturnValueOnce(results);

      const sut = new TestResultProvider();
      sut.updateTestResults({} as any);
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({ success: 1, fail: 1, unknown: 0 });
    });
  });

  it('removeCachedResults', () => {
    mockmockParse([]);
    mockReconciler.assertionsForTestFile.mockReturnValue([]);

    const sut = new TestResultProvider();

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
    beforeEach(() => {
      jest.resetAllMocks();
    });
    it('when available, can optimize to only parse file in the list', () => {
      mockmockParse([]);
      mockReconciler.assertionsForTestFile.mockReturnValue([]);
      const sut = new TestResultProvider();
      sut.updateTestFileList(['file1']);
      sut.getResults('whatever');
      expect(mockParse).not.toHaveBeenCalled();
      sut.getResults('file1');
      expect(mockParse).toHaveBeenCalled();
    });
    it('if not available, revert to the legacy behavior: parse any file requested', () => {
      mockmockParse([]);
      mockReconciler.assertionsForTestFile.mockReturnValue([]);
      const sut = new TestResultProvider();
      sut.updateTestFileList(['file1']);
      sut.getResults('whatever');
      expect(mockParse).not.toHaveBeenCalled();

      sut.updateTestFileList(undefined);
      sut.getResults('whatever');
      expect(mockParse).toHaveBeenCalled();
    });
  });
  describe('JestExtSessionAware', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });
    it('when session start, cache and reconciler will be reset', () => {
      mockmockParse([]);
      mockReconciler.assertionsForTestFile.mockReturnValue([]);
      const sut = new TestResultProvider();
      expect(mockTestReconciler).toHaveBeenCalledTimes(1);

      const spyResetCache = jest.spyOn(sut, 'resetCache');
      sut.onSessionStart();

      expect(spyResetCache).toHaveBeenCalled();
      expect(mockTestReconciler).toHaveBeenCalledTimes(2);
    });
  });
  describe('invalidateTestResults', () => {
    it('remove cached results means getResult() will returns nothing', () => {
      setupJestEditorSupport();
      const sut = new TestResultProvider();
      // fill something in cache
      sut.getResults('file 1');
      sut.getResults('file 2');
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(2);
      mockReconciler.assertionsForTestFile.mockClear();

      //invalidate "file 1"
      sut.invalidateTestResults('file 1');

      // reconciler's test should be removed
      expect(mockReconciler.removeTestFile).toBeCalled();

      //internal cache for "file 1" should also be removed
      sut.getResults('file 1');
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(1);
      mockReconciler.assertionsForTestFile.mockClear();

      // "file 2" should still come from cache
      sut.getResults('file 2');
      expect(mockReconciler.assertionsForTestFile).toBeCalledTimes(0);
    });
  });
  describe('getTestSuiteStats', () => {
    let sut;
    const testFiles = ['file 1', 'file 2', 'file 3', 'file 4', 'file 5'];
    beforeEach(() => {
      setupJestEditorSupport();
      sut = new TestResultProvider();
      sut.updateTestFileList(testFiles);
      const fileStats = {
        ['file 1']: 'KnownSuccess',
        ['file 2']: 'KnownFail',
        ['file 3']: 'KnownSuccess',
        ['file 4']: 'KnownSkip',
        ['file 5']: 'Unknown',
      };
      mockReconciler.stateForTestFile.mockImplementation((file) => fileStats[file]);
    });
    it('calculate stats based on the cached results', () => {
      // add all test into the cache
      testFiles.forEach((file) => sut.getResults(file));
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({
        success: 2,
        fail: 1,
        unknown: 2,
      });
    });
    it('if there are tests not in the cache, they will be marked as "unknown"', () => {
      sut.getResults('file 1');
      const stats = sut.getTestSuiteStats();
      expect(stats).toEqual({
        success: 1,
        fail: 0,
        unknown: 4,
      });
    });
  });
  describe('updateTestFileList', () => {
    it('will reset file cache', () => {
      setupJestEditorSupport();
      const sut = new TestResultProvider();
      sut.getResults('file 1');
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(1);
      mockReconciler.assertionsForTestFile.mockClear();

      // subsequent call will come from cache
      sut.getResults('file 1');
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(0);
      mockReconciler.assertionsForTestFile.mockClear();

      // update test file list
      sut.updateTestFileList(['file 1', 'file 2']);

      // when we get file 1 again, cache is clean, so will ask for reconciler again
      sut.getResults('file 1');
      expect(mockReconciler.assertionsForTestFile).toHaveBeenCalledTimes(1);
    });
  });
});
