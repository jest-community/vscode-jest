jest.unmock('../../src/TestResults/TestResultProvider');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');

const updateFileWithJestStatus = jest.fn();
const assertionsForTestFile = jest.fn();
jest.mock('jest-editor-support', () => {
  class TestReconciler {
    assertionsForTestFile: jest.Mock;
    updateFileWithJestStatus: jest.Mock;

    constructor() {
      this.assertionsForTestFile = assertionsForTestFile;
      this.updateFileWithJestStatus = updateFileWithJestStatus;
    }
  }
  const parse = jest.fn();

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
import { parseTest } from '../../src/TestParser';
import * as helper from '../test-helper';
import { ItBlock } from 'jest-editor-support';

const mockParseTest = (itBlocks: ItBlock[]) => {
  ((parseTest as unknown) as jest.Mock<{}>).mockReturnValueOnce({
    root: helper.makeRoot(itBlocks),
    itBlocks,
  });
};

describe('TestResultProvider', () => {
  describe('getResults()', () => {
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

    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should return the cached results if possible', () => {
      const sut = new TestResultProvider();
      mockParseTest([]);
      assertionsForTestFile.mockReturnValueOnce([]);
      const expected = sut.getResults(filePath);

      expect(sut.getResults(filePath)).toBe(expected);
    });

    it('should re-index the line and column number to zero-based', () => {
      const sut = new TestResultProvider();
      mockParseTest([testBlock]);
      assertionsForTestFile.mockReturnValueOnce([assertion]);
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
      mockParseTest([testBlock]);
      const assertionC = { ...assertion };
      assertionC.title = 'xxx';
      assertionsForTestFile.mockReturnValueOnce([assertionC]);
      const actual = sut.getResults(filePath);
      expect(actual).toHaveLength(1);
      expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
    });

    it('should look up the test result by test name', () => {
      const sut = new TestResultProvider();
      mockParseTest([testBlock]);
      const assertionC = { ...assertion };
      assertionC.line = undefined;
      assertionsForTestFile.mockReturnValueOnce([assertionC]);
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
      mockParseTest([testBlock]);
      assertionsForTestFile.mockReturnValueOnce([]);
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
        mockParseTest([testBlock, testBlock2]);

        const sut = new TestResultProvider();
        assertionsForTestFile.mockReturnValueOnce([
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 0]),
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownSuccess, [], [10, 0]),
        ]);
        const actual = sut.getResults(filePath);

        expect(actual).toHaveLength(2);
        expect(actual[0].status).toBe(TestReconciliationState.KnownFail);
        expect(actual[1].status).toBe(TestReconciliationState.KnownSuccess);
      });
      it('however when context structures are different, duplicate names within the same layer can not be resolved.', () => {
        mockParseTest([testBlock, testBlock2]);

        const sut = new TestResultProvider();
        // note: these 2 assertions have the same line number, therefore will be merge
        // into a group-node, which made the context difference: source: 2 nodes, assertion: 1 node.
        // but since the 2 assertions' name matched the testBlock, it will still be considered as 1-to-many match
        assertionsForTestFile.mockReturnValueOnce([
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
      mockParseTest([testBlock, testBlock2]);
      assertionsForTestFile.mockReturnValueOnce([
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

      mockParseTest([testBlock, testBlock3, testBlock2]);
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
      assertionsForTestFile.mockReturnValueOnce(assertions);
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
      beforeEach(() => {
        jest.resetAllMocks();
      });
      describe('when contexts does not align', () => {
        beforeEach(() => {
          mockParseTest([testBlock]);
          assertionsForTestFile.mockReturnValueOnce([
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
        mockParseTest([testBlock]);
        assertionsForTestFile.mockReturnValueOnce([
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
        mockParseTest([testBlock]);
        assertionsForTestFile.mockReturnValueOnce([
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
        mockParseTest([testBlock]);
        assertionsForTestFile.mockReturnValueOnce([
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
        mockParseTest([testBlock]);
        assertionsForTestFile.mockReturnValueOnce([
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
        mockParseTest([testBlock, testBlock2]);
      });
      it('test results shared the same range will be grouped', () => {
        const assertions = [
          helper.makeAssertion(testBlock.name, TestReconciliationState.KnownFail, [], [1, 12]),
          helper.makeAssertion('p-test-success', TestReconciliationState.KnownSuccess, [], [8, 20]),
          helper.makeAssertion('p-test-fail-1', TestReconciliationState.KnownFail, [], [8, 20]),
          helper.makeAssertion('p-test-fail-2', TestReconciliationState.KnownFail, [], [8, 20]),
        ];
        assertionsForTestFile.mockReturnValueOnce(assertions);
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
        assertionsForTestFile.mockReturnValueOnce(assertions);
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
        assertionsForTestFile.mockReturnValueOnce(assertions);
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
        assertionsForTestFile.mockReturnValueOnce(assertions);
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
        mockParseTest([dBlock]);
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
        assertionsForTestFile.mockReturnValueOnce(assertions);
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
        sut = new TestResultProvider();
        mockParseTest([tBlock]);
      });
      it.each([[[]], [undefined]])(
        'all source test block should be marked unknown if assertions = %s',
        (assertions) => {
          assertionsForTestFile.mockReturnValueOnce(assertions);
          const actual = sut.getResults(filePath);
          expect(actual).toHaveLength(1);
          const { name, status, reason } = actual[0];
          expect(name).toEqual(tBlock.name);
          expect(status).toEqual('Unknown');
          expect(reason).toEqual('no-matched-assertion');
        }
      );
    });
  });

  describe('getSortedResults()', () => {
    const filePath = 'file.js';

    it('should return cached results if possible', () => {
      const sut = new TestResultProvider();
      sut.getResults = jest.fn().mockReturnValueOnce([]);
      const expected = sut.getSortedResults(filePath);

      expect(sut.getSortedResults(filePath)).toBe(expected);
    });

    it('should return the sorted test results', () => {
      const sut = new TestResultProvider();
      sut.getResults = jest
        .fn()
        .mockReturnValueOnce([
          { status: TestReconciliationState.KnownFail },
          { status: TestReconciliationState.KnownSkip },
          { status: TestReconciliationState.KnownSuccess },
          { status: TestReconciliationState.Unknown },
        ]);
      expect(sut.getSortedResults(filePath)).toEqual({
        fail: [{ status: TestReconciliationState.KnownFail }],
        skip: [{ status: TestReconciliationState.KnownSkip }],
        success: [{ status: TestReconciliationState.KnownSuccess }],
        unknown: [{ status: TestReconciliationState.Unknown }],
      });
    });
  });

  describe('updateTestResults()', () => {
    it('should reset the cache', () => {
      const sut = new TestResultProvider();
      const results: any = {};
      sut.resetCache = jest.fn();
      sut.updateTestResults(results);

      expect(sut.resetCache).toBeCalled();
    });

    it('should update the cached file status', () => {
      const expected: any = {};
      updateFileWithJestStatus.mockReturnValueOnce(expected);

      const sut = new TestResultProvider();
      const results: any = {};

      expect(sut.updateTestResults(results)).toBe(expected);
      expect(updateFileWithJestStatus).toBeCalledWith(results);
    });
  });
  it('match exception should just returns empty array and not cause the whole system to crash', () => {
    const sut = new TestResultProvider();
    mockParseTest([]);
    assertionsForTestFile.mockImplementation(() => {
      throw new Error('whatever');
    });

    const actual = sut.getResults('whatever');
    expect(actual).toEqual([]);
  });
  it('removeCachedResults', () => {
    jest.resetAllMocks();

    mockParseTest([]);
    assertionsForTestFile.mockReturnValue([]);

    const sut = new TestResultProvider();

    sut.getResults('whatever');
    expect(parseTest).toHaveBeenCalledTimes(1);
    // 2nd time would use the cache value, no need to parse again
    sut.getResults('whatever');
    expect(parseTest).toHaveBeenCalledTimes(1);

    //if we remove the cache then it will need to parse again
    sut.removeCachedResults('whatever');
    sut.getResults('whatever');
    expect(parseTest).toHaveBeenCalledTimes(2);
  });
});
