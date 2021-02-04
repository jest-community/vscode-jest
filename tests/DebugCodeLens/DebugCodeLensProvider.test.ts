jest.unmock('../../src/DebugCodeLens/DebugCodeLensProvider');
jest.unmock('../../src/DebugCodeLens/DebugCodeLens');
jest.unmock('../../src/helpers');
jest.unmock('../test-helper');
jest.mock('path');

// tslint:disable max-classes-per-file
const rangeConstructor = jest.fn();
jest.mock('vscode', () => {
  class CodeLens {
    range: any;

    constructor(range) {
      this.range = range;
    }
  }

  class EventEmitter {
    fire() {}
  }

  class Position {
    lineNumber: string;
    character: string;

    constructor(lineNumber, character) {
      this.lineNumber = lineNumber;
      this.character = character;
    }
  }

  class Range {
    start: Position;
    end: Position;

    constructor(start, end) {
      rangeConstructor();
      this.start = start;
      this.end = end;
    }
  }

  return {
    CodeLens,
    EventEmitter,
    Position,
    Range,
  };
});

import { DebugCodeLensProvider } from '../../src/DebugCodeLens/DebugCodeLensProvider';
import { TestResultProvider, TestResult, TestReconciliationState } from '../../src/TestResults';
import { DebugCodeLens } from '../../src/DebugCodeLens/DebugCodeLens';
import { extensionName } from '../../src/appGlobals';
import { basename } from 'path';
import * as vscode from 'vscode';
import { TestState } from '../../src/DebugCodeLens';
import * as helper from '../test-helper';

describe('DebugCodeLensProvider', () => {
  const testResultProvider = new TestResultProvider();
  const provideJestExt: any = () => ({ testResultProvider });
  const allTestStates = [
    TestState.Fail,
    TestState.Pass,
    TestState.Skip,
    TestState.Unknown,
    TestState.Todo,
  ];

  describe('constructor()', () => {
    it('should set the jest extension provider', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);

      expect((sut as any).getJestExt().testResultProvider).toBe(testResultProvider);
    });

    it('should set which test states to show the CodeLens above', () => {
      expect(new DebugCodeLensProvider(provideJestExt, allTestStates).showWhenTestStateIn).toBe(
        allTestStates
      );

      const none = [];
      expect(new DebugCodeLensProvider(provideJestExt, none).showWhenTestStateIn).toBe(none);
    });

    it('should initialize the onChange event emitter', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);

      expect(sut.onDidChange).toBeInstanceOf(vscode.EventEmitter);
    });
  });

  describe('showWhenTestStateIn', () => {
    describe('get', () => {
      it('should return which test states to show the CodeLens above', () => {
        for (const states of [[], allTestStates]) {
          const sut = new DebugCodeLensProvider(provideJestExt, states);
          expect(sut.showWhenTestStateIn).toBe(states);
        }
      });
    });

    describe('set', () => {
      it('should set which test states to show the CodeLens above', () => {
        const sut = new DebugCodeLensProvider(provideJestExt, []);
        sut.showWhenTestStateIn = allTestStates;

        expect(sut.showWhenTestStateIn).toBe(allTestStates);
      });

      it('should fire an onDidChange event', () => {
        const sut = new DebugCodeLensProvider(provideJestExt, []);
        sut.onDidChange.fire = jest.fn();
        sut.showWhenTestStateIn = allTestStates;

        expect(sut.onDidChange.fire).toBeCalled();
      });
    });
  });

  describe('onDidChangeCodeLenses', () => {
    it('should return the onDidChange event', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      const expected = {} as any;
      sut.onDidChange.event = expected;

      expect(sut.onDidChangeCodeLenses).toBe(expected);
    });
  });

  describe('provideCodeLenses()', () => {
    const document = { fileName: 'file.js' } as any;
    const token = {} as any;
    const getResults = (testResultProvider.getResults as unknown) as jest.Mock<{}>;
    const testResults = [
      ({
        name: 'should fail',
        identifier: {
          title: 'should fail',
          ancestorTitles: [],
        },
        start: {
          line: 1,
          column: 2,
        },
        end: {
          line: 3,
          column: 4,
        },
        status: TestReconciliationState.KnownFail,
      } as any) as TestResult,
    ];

    it('should return an empty array when the provider is disabled', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, []);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });

    it('should return an empty array when the document is untitled', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      const untitled = { isUntitled: true } as any;

      expect(sut.provideCodeLenses(untitled, token)).toEqual([]);
    });

    it('should get the test results for the current document', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      getResults.mockReturnValueOnce([]);
      sut.provideCodeLenses(document, token);

      expect(testResultProvider.getResults).toBeCalledWith(document.fileName);
    });

    it('should not show the CodeLens above failing tests unless configured', () => {
      const testStates = allTestStates.filter((s) => s !== TestState.Fail);
      const status = TestReconciliationState.KnownFail;
      const sut = new DebugCodeLensProvider(provideJestExt, testStates);
      getResults.mockReturnValueOnce([{ status }]);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });

    it('should not show the CodeLens above passing tests unless configured', () => {
      const testStates = allTestStates.filter((s) => s !== TestState.Pass);
      const status = TestReconciliationState.KnownSuccess;
      const sut = new DebugCodeLensProvider(provideJestExt, testStates);
      getResults.mockReturnValueOnce([{ status }]);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });
    it('should not show the CodeLens above skipped tests unless configured', () => {
      const testStates = allTestStates.filter((s) => s !== TestState.Skip);
      const status = TestReconciliationState.KnownSkip;
      const sut = new DebugCodeLensProvider(provideJestExt, testStates);
      getResults.mockReturnValueOnce([{ status }]);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });
    it('should not show the CodeLens above unknown tests unless configured', () => {
      const testStates = allTestStates.filter((s) => s !== TestState.Unknown);
      const status = TestReconciliationState.Unknown;
      const sut = new DebugCodeLensProvider(provideJestExt, testStates);
      getResults.mockReturnValueOnce([{ status }]);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });

    it('should not show the CodeLens above todo tests unless configured (which would be silly)', () => {
      const testStates = allTestStates.filter((s) => s !== TestState.Todo);
      const status = TestReconciliationState.KnownTodo;
      const sut = new DebugCodeLensProvider(provideJestExt, testStates);
      getResults.mockReturnValueOnce([{ status }]);

      expect(sut.provideCodeLenses(document, token)).toEqual([]);
    });

    it('should create the CodeLens at the start of the `test`/`it` block', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      getResults.mockReturnValueOnce(testResults);
      const actual = sut.provideCodeLenses(document, token);

      expect(actual).toHaveLength(1);
      expect(actual[0].range.start).toEqual({
        lineNumber: 1,
        character: 2,
      });
      expect(actual[0].range.end).toEqual({
        lineNumber: 3,
        character: 2 + 5,
      });
    });

    it('should create the CodeLens specifying the document filename', () => {
      const expected = 'expected';
      ((basename as unknown) as jest.Mock<{}>).mockReturnValueOnce(expected);
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      getResults.mockReturnValueOnce(testResults);
      const actual = sut.provideCodeLenses(document, token);

      expect(actual).toHaveLength(1);
      expect((actual[0] as DebugCodeLens).fileName).toBe(expected);
    });

    it('should create the CodeLens specifying the test name', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      getResults.mockReturnValueOnce(testResults);
      const actual = sut.provideCodeLenses(document, token);

      expect(actual).toHaveLength(1);
      expect((actual[0] as DebugCodeLens).testIds).toEqual([testResults[0].identifier]);
    });

    describe('parameterized tests', () => {
      const tr1 = helper.makeTestResult('test-1', TestReconciliationState.KnownSuccess, []);
      const tr2 = helper.makeTestResult('test-2', TestReconciliationState.KnownSuccess, []);
      const tr3 = helper.makeTestResult('test-3', TestReconciliationState.KnownFail, []);
      const tr4 = helper.makeTestResult('test-4', TestReconciliationState.KnownFail, []);
      tr3.multiResults = [tr4, tr1, tr2];
      beforeEach(() => {
        jest.clearAllMocks();
        getResults.mockReturnValueOnce([tr3]);
      });

      it.each`
        showTestStates                      | expected
        ${[TestState.Fail]}                 | ${[tr3.identifier, tr4.identifier]}
        ${[TestState.Fail, TestState.Pass]} | ${[tr3.identifier, tr4.identifier, tr1.identifier, tr2.identifier]}
        ${[TestState.Pass]}                 | ${[tr1.identifier, tr2.identifier]}
      `('pass qualified test results: $showTestStates', ({ showTestStates, expected }) => {
        const sut = new DebugCodeLensProvider(provideJestExt, showTestStates);
        const list = sut.provideCodeLenses(document, token);
        expect(list).toHaveLength(1);
        expect(list[0].testIds).toEqual(expected);
      });
    });
  });

  describe('resolveCodeLenses()', () => {
    it('should add the command to a DebugCodeLenses', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
      const document = {} as any;
      const range = {} as any;
      const fileName = 'fileName';
      const testName = 'testName';
      const codeLens = new DebugCodeLens(document, range, fileName, testName);
      const token = {} as any;
      sut.resolveCodeLens(codeLens, token);

      expect(codeLens.command).toEqual({
        arguments: [document, fileName, testName],
        command: `${extensionName}.run-test`,
        title: 'Debug',
      });
    });

    it('should leave other CodeLenses unchanged', () => {
      const sut = new DebugCodeLensProvider(provideJestExt, []);
      const codeLens = {} as any;
      const token = {} as any;
      sut.resolveCodeLens(codeLens, token);

      expect(codeLens.command).toBeUndefined();
    });
  });

  it('didChange()', () => {
    const sut = new DebugCodeLensProvider(provideJestExt, allTestStates);
    sut.onDidChange.fire = jest.fn();
    sut.didChange();

    expect(sut.onDidChange.fire).toBeCalled();
  });
});
