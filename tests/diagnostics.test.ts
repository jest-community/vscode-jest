jest.unmock('../src/diagnostics');
jest.unmock('./test-helper');
import {
  updateDiagnostics,
  updateCurrentDiagnostics,
  resetDiagnostics,
  failedSuiteCount,
} from '../src/diagnostics';
import * as vscode from 'vscode';
import {
  TestFileAssertionStatus,
  TestReconcilationState,
  TestAssertionStatus,
} from 'jest-editor-support';
import { TestResult, TestReconciliationState } from '../src/TestResults';
import * as helper from './test-helper';

class MockDiagnosticCollection implements vscode.DiagnosticCollection {
  name = 'test';
  set = jest.fn();
  delete = jest.fn();
  clear = jest.fn();
  forEach = jest.fn();
  get = jest.fn();
  has = jest.fn();
  dispose = jest.fn();
}

vscode.window.visibleTextEditors = [];

// tslint:disable no-console
describe('test diagnostics', () => {
  describe('resetDiagnostics', () => {
    it('will clear given diagnostics', () => {
      const mockDiagnostics = new MockDiagnosticCollection();
      resetDiagnostics(mockDiagnostics);
      expect(mockDiagnostics.clear).toBeCalled();
    });
  });

  // vscode component validation helper
  function validateRange(args: any[], startLine: number, startCharacter: number) {
    expect(args[0]).toEqual(startLine);
    expect(args[1]).toEqual(startCharacter);
  }

  describe('updateDiagnostics', () => {
    const consoleWarn = console.warn;
    let lineNumber = 17;

    function createAssertion(title: string, status: TestReconcilationState): TestAssertionStatus {
      return helper.makeAssertion(title, status, undefined, undefined, {
        message: `${title} ${status}`,
        line: lineNumber++,
      });
    }
    function createTestResult(
      file: string,
      assertions: TestAssertionStatus[],
      status: TestReconcilationState = TestReconciliationState.KnownFail
    ): TestFileAssertionStatus {
      return { file, message: `${file}:${status}`, status, assertions };
    }

    function validateDiagnostic(args: any[], message: string, severity: vscode.DiagnosticSeverity) {
      expect(args[1]).toEqual(message);
      expect(args[2]).toEqual(severity);
    }
    beforeEach(() => {
      jest.resetAllMocks();
      console.warn = consoleWarn;
    });

    it('can handle when all tests passed', () => {
      const mockDiagnostics = new MockDiagnosticCollection();

      updateDiagnostics([], mockDiagnostics);
      expect(mockDiagnostics.clear).not.toBeCalled();
      expect(mockDiagnostics.set).not.toBeCalled();
    });

    it('ensures non-negative line number in diagnostic message', () => {
      const mockDiagnostics = new MockDiagnosticCollection();

      console.warn = jest.fn();
      const testResult = createTestResult('mocked-test-file.js', [
        helper.makeAssertion('should be valid', TestReconciliationState.KnownFail, [], undefined, {
          message: 'failing reason',
          line: -100,
        }),
      ]);
      updateDiagnostics([testResult], mockDiagnostics);
      expect(vscode.Range).toHaveBeenCalledWith(0, 0, 0, Number.MAX_SAFE_INTEGER);
    });

    it('uses shortMessage format to display error details', () => {
      const mockDiagnostics = new MockDiagnosticCollection();

      const testResult = createTestResult('mocked-test-file.js', [
        helper.makeAssertion(
          'should be valid',
          TestReconciliationState.KnownFail,
          undefined,
          undefined,
          {
            message: `expect(received).toBe(expected) // Object.is equality

        Expected: 2
        Received: 1

        at Object.toBe (src/pages/Home.test.tsx:6:13)`,
            shortMessage: `expect(received).toBe(expected) // Object.is equality

        Expected: 2
        Received: 1`,
            terseMessage: `Expected: 2, Received: 1`,
            line: 123,
          }
        ),
      ]);
      updateDiagnostics([testResult], mockDiagnostics);
      expect(vscode.Diagnostic).toHaveBeenCalledTimes(1);
      expect(vscode.Diagnostic).toHaveBeenCalledWith(
        expect.anything(),
        `expect(received).toBe(expected) // Object.is equality

        Expected: 2
        Received: 1`,
        expect.anything()
      );
    });

    it('can update diagnostics from mixed test results', () => {
      const allTests = [
        createTestResult('f1', [
          createAssertion('a1', 'KnownFail'),
          createAssertion('a2', 'KnownFail'),
        ]),
        createTestResult('f2', [
          createAssertion('a3', 'KnownFail'),
          createAssertion('a4', 'KnownSuccess'),
          createAssertion('a5', 'KnownFail'),
        ]),
        createTestResult('f3', []),
        createTestResult('s4', [createAssertion('a6', 'KnownSuccess')], 'KnownSuccess'),
        createTestResult('s5', [], 'Unknown'),
      ];
      const failedTestSuiteCount = allTests.reduce(
        (sum, t) => sum + (t.status === 'KnownFail' ? 1 : 0),
        0
      );
      const notFailedTestSuiteCount = allTests.reduce(
        (sum, t) => sum + (t.status !== 'KnownFail' ? 1 : 0),
        0
      );
      const failedAssertionCount = allTests
        .filter((t) => t.status === 'KnownFail')
        .map((f) => f.assertions.filter((a) => (a.status = 'KnownFail')))
        .reduce((sum, assertions) => sum + assertions.length, 0);

      const failedTestWithoutAssertionCount = allTests.reduce(
        (sum, t) => sum + (t.status === 'KnownFail' && t.assertions.length === 0 ? 1 : 0),
        0
      );
      const mockDiagnostics = new MockDiagnosticCollection();
      updateDiagnostics(allTests, mockDiagnostics);

      // verified diagnostics are added for all failed tests including files failed to run
      expect(mockDiagnostics.set).toHaveBeenCalledTimes(failedTestSuiteCount);
      expect(vscode.Range).toHaveBeenCalledTimes(
        failedAssertionCount + failedTestWithoutAssertionCount
      );
      expect(vscode.Diagnostic).toHaveBeenCalledTimes(
        failedAssertionCount + failedTestWithoutAssertionCount
      );

      // verify correctly reported error content
      const setCalls = mockDiagnostics.set.mock.calls;
      const rangeCalls = (vscode.Range as jest.Mock<any>).mock.calls;
      const diagCalls = (vscode.Diagnostic as jest.Mock<any>).mock.calls;

      // validate the diagnosis produced
      let assertion = 0;
      for (let i = 0; i < allTests.length; i++) {
        const f = allTests[i];
        if (f.status !== 'KnownFail') {
          continue;
        }

        expect(setCalls[i][0].indexOf(f.file)).toBeGreaterThanOrEqual(0);

        if (f.assertions.length <= 0) {
          const rCall = rangeCalls[assertion];
          const dCall = diagCalls[assertion];
          validateDiagnostic(dCall, f.message, vscode.DiagnosticSeverity.Error);
          validateRange(rCall, 0, 0);
          assertion++;
        } else {
          f.assertions.forEach((a) => {
            const rCall = rangeCalls[assertion];
            const dCall = diagCalls[assertion];

            validateDiagnostic(dCall, a.message, vscode.DiagnosticSeverity.Error);
            validateRange(rCall, a.line - 1, 0);
            assertion++;
          });
        }
      }
      // verify: removed passed tests
      expect(mockDiagnostics.delete).toHaveBeenCalledTimes(notFailedTestSuiteCount);
    });

    it('knows how many failed suite from diagnostics', () => {
      const mockDiagnostics = new MockDiagnosticCollection();
      const invokeCount = 7;
      mockDiagnostics.forEach.mockImplementation((f) => {
        for (let i = 0; i < invokeCount; i++) {
          f({});
        }
      });

      expect(failedSuiteCount(mockDiagnostics)).toEqual(invokeCount);
    });

    it('should not produce negative diagnostic range', () => {
      const mockDiagnostics = new MockDiagnosticCollection();
      const assertion = createAssertion('a', 'KnownFail');
      const invalidLine = [0, -1, undefined, null, NaN];
      console.warn = jest.fn();

      invalidLine.forEach((line) => {
        jest.clearAllMocks();

        assertion.line = line;
        const tests = [createTestResult('f', [assertion])];
        updateDiagnostics(tests, mockDiagnostics);

        const rangeCalls = (vscode.Range as jest.Mock<any>).mock.calls;
        expect(rangeCalls.length).toEqual(1);
        validateRange(rangeCalls[0], 0, 0);
      });
    });
  });

  describe('updateCurrentDiagnostics', () => {
    const mockLineAt = jest.fn();
    const range = new vscode.Range(3, 0, 3, 15);
    let mockEditor;

    beforeEach(() => {
      jest.resetAllMocks();

      mockLineAt.mockReturnValueOnce({ range });
      mockEditor = {
        document: {
          uri: { fsPath: `file://a/b/c.ts` },
          lineAt: mockLineAt,
        },
      };
      console.warn = jest.fn();
    });

    it('will remove diagnosis if no failed test', () => {
      const mockDiagnostics = new MockDiagnosticCollection();
      updateCurrentDiagnostics([], mockDiagnostics, mockEditor as any);
      expect(mockDiagnostics.set).not.toHaveBeenCalled();
      expect(mockDiagnostics.delete).toHaveBeenCalled();
    });

    it('can display diagnosis based on the current editor itBlock info', () => {
      const mockDiagnostics = new MockDiagnosticCollection();
      const msg = 'a short error message';
      const testBlock: TestResult = {
        name: 'a',
        start: { line: 2, column: 3 },
        end: { line: 4, column: 5 },
        lineNumberOfError: 3,
        shortMessage: msg,
        status: TestReconciliationState.KnownFail,
      };

      updateCurrentDiagnostics([testBlock], mockDiagnostics, mockEditor as any);

      expect(mockDiagnostics.set).toHaveBeenCalledTimes(1);
      expect(vscode.Diagnostic).toHaveBeenCalledTimes(1);
      expect(vscode.Diagnostic).toHaveBeenCalledWith(range, msg, vscode.DiagnosticSeverity.Error);
    });
  });
});
