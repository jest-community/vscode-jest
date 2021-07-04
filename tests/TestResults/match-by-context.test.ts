jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');

import * as helper from '../test-helper';
import * as match from '../../src/TestResults/match-by-context';
import { TestReconciliationStateType, TestResult } from '../../src/TestResults';
import { TestAssertionStatus, ParsedNode } from 'jest-editor-support';
import { toTestResultRecord } from '../test-helper';

const reason = (m: TestResult) => m.sourceHistory[m.sourceHistory.length - 1];

describe('buildAssertionContainer', () => {
  it('can build and sort assertions without ancestors', () => {
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
    const a2 = helper.makeAssertion('test-2', 'KnownSuccess', [], [2, 0]);
    const a3 = helper.makeAssertion('test-3', 'KnownSuccess', [], [3, 0]);
    const root = match.buildAssertionContainer([a1, a3, a2]);
    expect(root.childContainers).toHaveLength(0);
    expect(root.childData).toHaveLength(3);
    expect(root.childData.map((n) => n.zeroBasedLine)).toEqual([1, 2, 3]);
  });
  it('can build and sort assertions with ancestors', () => {
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
    const a2 = helper.makeAssertion('test-2', 'KnownSuccess', ['d-1'], [2, 0]);
    const a3 = helper.makeAssertion('test-3', 'KnownSuccess', ['d-1', 'd-1-1'], [3, 0]);
    const a4 = helper.makeAssertion('test-4', 'KnownSuccess', ['d-1'], [4, 0]);
    const a5 = helper.makeAssertion('test-4', 'KnownFail', ['d-2'], [5, 0]);
    const a6 = helper.makeAssertion('test-4', 'KnownFail', ['d-2'], [8, 0]);

    // ensure the assertion hierarchical integrity before building the container
    expect(
      [a1, a5, a3, a2, a4, a6].every((a) => a.fullName === a.title || a.ancestorTitles.length > 0)
    ).toBe(true);

    const root = match.buildAssertionContainer([a1, a5, a3, a2, a4, a6]);
    expect(root.childContainers).toHaveLength(2);
    expect(root.childData).toHaveLength(1);
    expect(root.childContainers.map((n) => [n.name, n.zeroBasedLine])).toEqual([
      ['d-1', 2],
      ['d-2', 5],
    ]);
    expect(root.childData.map((n) => [n.name, n.zeroBasedLine])).toEqual([['test-1', 1]]);
    // the original assertion integrity should not be changed
    expect(
      [a1, a5, a3, a2, a4, a6].every((a) => a.fullName === a.title || a.ancestorTitles.length > 0)
    ).toBe(true);
  });
  it('can group assertions with the same line', () => {
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [2, 0]);
    const a2 = helper.makeAssertion('test-2', 'KnownSuccess', [], [2, 0]);
    const a3 = helper.makeAssertion('test-3', 'KnownSuccess', [], [2, 0]);
    const a4 = helper.makeAssertion('test-4', 'KnownSuccess', [], [5, 0]);
    const root = match.buildAssertionContainer([a1, a3, a4, a2]);
    expect(root.childContainers).toHaveLength(0);
    expect(root.childData).toHaveLength(2);
    expect(root.childData.map((n) => n.zeroBasedLine)).toEqual([2, 5]);
    const groupNode = root.childData[0];
    expect(groupNode.getAll().map((n) => n.data.title)).toEqual(['test-1', 'test-3', 'test-2']);
  });
  it('can group describe blocks with the same line', () => {
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1'], [2, 0]);
    const a2 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-2'], [2, 0]);
    const a3 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-3'], [2, 0]);
    const a4 = helper.makeAssertion('test-2', 'KnownSuccess', [], [5, 0]);
    const root = match.buildAssertionContainer([a1, a2, a3, a4]);
    expect(root.childContainers).toHaveLength(1);
    expect(root.childData).toHaveLength(1);
    expect(root.childData[0]).toMatchObject({ zeroBasedLine: 5, name: 'test-2' });

    const describeNode = root.childContainers[0];
    expect(describeNode).toMatchObject({ zeroBasedLine: 2, name: 'd-1' });
    expect(describeNode.group?.map((n) => n.name)).toEqual(['d-2', 'd-3']);
  });

  it('create a container based on assertion ancestorTitles structure', () => {
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
    const a2 = helper.makeAssertion('test-2', 'KnownSuccess', ['d-1'], [10, 0]);
    const a3 = helper.makeAssertion('test-3', 'KnownSuccess', ['d-1', 'd-2'], [15, 0]);
    const a4 = helper.makeAssertion('test-4', 'KnownFail', ['d-1'], [20, 0]);
    const root = match.buildAssertionContainer([a4, a3, a1, a2]);
    expect(root.childData.map((n) => (n as any).name)).toEqual(['test-1']);
    expect(root.childContainers).toHaveLength(1);
    const d1 = root.findContainer(['d-1']);
    expect(d1.childContainers).toHaveLength(1);
    expect(d1.childData.map((n) => (n as any).name)).toEqual(['test-2', 'test-4']);
    const d2 = d1.findContainer(['d-2']);
    expect(d2.childContainers).toHaveLength(0);
    expect(d2.childData.map((n) => (n as any).name)).toEqual(['test-3']);
  });
});
describe('buildSourceContainer', () => {
  it('can build and sort source container without ancestors', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]);
    const t3 = helper.makeItBlock('test-3', [8, 0, 10, 0]);
    const sourceRoot = helper.makeRoot([t2, t1, t3]);
    const root = match.buildSourceContainer(sourceRoot);
    expect(root.childContainers).toHaveLength(0);
    expect(root.childData.map((n) => (n as any).name)).toEqual(['test-1', 'test-2', 'test-3']);
  });
  it('can build and sort source container with ancestors', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]);
    const t3 = helper.makeItBlock('test-3', [8, 0, 10, 0]);
    const d1 = helper.makeDescribeBlock('d-1', [t2]);
    const d2 = helper.makeDescribeBlock('d-2', [t3]);
    const sourceRoot = helper.makeRoot([t1, d1, d2]);
    const root = match.buildSourceContainer(sourceRoot);
    expect(root.childContainers).toHaveLength(2);
    expect(root.childData).toHaveLength(1);
    expect(root.childData.map((n) => (n as any).name)).toEqual([t1.name]);

    const d1Container = root.findContainer(['d-1']);
    expect(d1Container?.childData).toHaveLength(1);
    expect(d1Container?.childContainers).toHaveLength(0);

    const d2Container = root.findContainer(['d-2']);
    expect(d2Container?.childData).toHaveLength(1);
    expect(d2Container?.childContainers).toHaveLength(0);
  });
  it('lines will be converted to zeroBased', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]);
    const sourceRoot = helper.makeRoot([t2, t1]);
    const root = match.buildSourceContainer(sourceRoot);
    expect(root.childContainers).toHaveLength(0);
    expect(root.childData.map((n) => n.zeroBasedLine)).toEqual([0, 5]);
  });
  it('can build and sort container from describe and it blocks', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]);
    const t3 = helper.makeItBlock('test-3', [8, 0, 10, 0]);
    const d1 = helper.makeDescribeBlock('d-1', [t1, t2]);
    const sourceRoot = helper.makeRoot([t3, d1]);
    const root = match.buildSourceContainer(sourceRoot);
    expect(root.childData.map((n) => (n as any).name)).toEqual(['test-3']);
    expect(root.childContainers).toHaveLength(1);
    const container = root.childContainers[0];
    expect(container.childContainers).toHaveLength(0);
    expect(container.childData.map((n) => (n as any).name)).toEqual(['test-1', 'test-2']);
  });
  it('does not group itBlocks even if they have the same start line (wrongly)', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2', [1, 0, 7, 0]);
    const sourceRoot = helper.makeRoot([t1, t2]);
    const root = match.buildSourceContainer(sourceRoot);
    expect(root.childData.map((n) => (n as any).name)).toEqual(['test-1', 'test-2']);
    expect(root.childContainers).toHaveLength(0);
  });
});
describe('matchTestAssertions', () => {
  const mockError = jest.fn();
  const mockWarn = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    console.error = mockError;
    console.warn = mockWarn;
  });
  it('tests are matched by context position regardless name and line', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2-${num}', [6, 0, 7, 0], { nameType: 'TemplateLiteral' });
    const sourceRoot = helper.makeRoot([t2, t1]);

    const a1 = helper.makeAssertion('test-1', 'KnownFail', [], [0, 0]);
    const a2 = helper.makeAssertion('test-2-100', 'KnownSuccess', [], [7, 0]);
    const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

    expect(matched).toHaveLength(2);
    expect(matched.map((m) => m.name)).toEqual(['test-1', 'test-2-100']);
    expect(matched.map((m) => m.identifier.title)).toEqual(['test-1', 'test-2-100']);
    expect(matched.map((m) => m.identifier.ancestorTitles)).toEqual([[], []]);
    expect(matched.map((m) => m.status)).toEqual(['KnownFail', 'KnownSuccess']);
  });
  it('can match tests with the same name but in different describe blocks', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-1', [6, 0, 7, 0]);
    const d1 = helper.makeDescribeBlock('d-1', [t2]);
    const sourceRoot = helper.makeRoot([t1, d1]);

    const a1 = helper.makeAssertion('test-1', 'KnownFail', [], [0, 0]);
    const a2 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1'], [5, 0]);
    const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);
    expect(matched.map((m) => m.name)).toEqual(['test-1', 'd-1 test-1']);
    expect(matched.map((m) => m.identifier.title)).toEqual(['test-1', 'test-1']);
    expect(matched.map((m) => m.identifier.ancestorTitles)).toEqual([[], ['d-1']]);
    expect(matched.map((m) => m.status)).toEqual(['KnownFail', 'KnownSuccess']);
    expect(matched.map((m) => m.start.line)).toEqual([0, 5]);
    expect(matched.map((m) => m.end.line)).toEqual([4, 6]);
  });
  describe(`context do not align`, () => {
    it('when test block is missing assertion in the same container', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
      const sourceRoot = helper.makeRoot([t1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, []);
      expect(matched.map((m) => m.name)).toEqual(['test-1']);
      expect(matched.map((m) => m.status)).toEqual(['Unknown']);
      expect(matched.map((m) => m.start.line)).toEqual([0]);
      expect(matched.map((m) => m.end.line)).toEqual([4]);
    });
    it('can still resolve by fallback to simple name match', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
      const t2 = helper.makeItBlock('test-2', [10, 0, 15, 0]);
      const sourceRoot = helper.makeRoot([t1, t2]);

      const a1 = helper.makeAssertion('test-1', 'KnownFail', [], [0, 0]);

      const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);
      expect(matched.map((m) => [m.name, m.status])).toEqual(
        expect.arrayContaining([
          ['test-1', 'KnownFail'],
          ['test-2', 'Unknown'],
        ])
      );
    });
    it('will continue match the child containers', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]); // under root
      const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]); // under d-1
      const t3 = helper.makeItBlock('test-3', [8, 0, 9, 0]); // under d-1
      const t4 = helper.makeItBlock('test-4', [10, 0, 12, 0]); // under d-1-1
      const d11 = helper.makeDescribeBlock('d-1-1', [t4]);
      const d1 = helper.makeDescribeBlock('d-1', [t2, t3, d11]);
      const sourceRoot = helper.makeRoot([t1, d1]);

      // assertion missing for 'd-1': t3
      const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [6, 0]);
      const a2 = helper.makeAssertion('test-2', 'KnownFail', ['d-1'], [6, 0]);
      const a4 = helper.makeAssertion('test-4', 'KnownSuccess', ['d-1', 'd-1-1'], [9, 0]);

      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a4]);

      const expected = [
        ['test-1', 'KnownSuccess', 'match-by-context'],
        ['d-1 test-2', 'KnownFail', 'match-by-name'],
        ['d-1 test-3', 'Unknown', 'match-failed'],
        ['d-1 d-1-1 test-4', 'KnownSuccess', 'match-by-context'],
      ];
      expect(matched).toHaveLength(expected.length);
      expect(matched.map((m) => [m.name, m.status, reason(m)])).toEqual(
        expect.arrayContaining(expected)
      );
    });
    it('describe block will fail if context mismatch and name lookup failed', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]); // under root
      const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]); // under d-1
      const d1 = helper.makeDescribeBlock('d-1', [t2]);
      const sourceRoot = helper.makeRoot([t1, d1]);

      // assertion missing for t3
      const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [6, 0]);

      const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);
      expect(matched.map((m) => [m.name, m.status])).toEqual([
        ['test-1', 'KnownSuccess'],
        ['d-1 test-2', 'Unknown'],
      ]);
    });
    it('empty desecribe block', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]); // under root
      const d11 = helper.makeDescribeBlock('d-1-1', []);
      const d1 = helper.makeDescribeBlock('d-1', [d11]);
      const sourceRoot = helper.makeRoot([d1, t1]);
      const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [6, 0]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);
      expect(matched).toHaveLength(1);
      expect(matched.map((m) => [m.name, m.status])).toEqual([['test-1', 'KnownSuccess']]);
    });
  });
  describe('1-many (jest.each) match', () => {
    const createTestData = (
      statusList: (TestReconciliationStateType | [TestReconciliationStateType, number])[]
    ): [ParsedNode, TestAssertionStatus[]] => {
      const t1 = helper.makeItBlock('', [12, 1, 20, 1], {
        nameType: 'TemplateLiteral',
        lastProperty: 'each',
      });
      const sourceRoot = helper.makeRoot([t1]);

      // this match jest.each with 2 assertions
      const assertions = statusList.map((s, idx) => {
        let state: TestReconciliationStateType;
        let override: Partial<TestAssertionStatus>;
        if (typeof s === 'string') {
          state = s;
          override = {};
        } else {
          state = s[0];
          override = { line: s[1] };
        }
        return helper.makeAssertion(`test-${idx}`, state, [], [11, 0], override);
      });
      return [sourceRoot, assertions];
    };
    it('all assertions will be returned', () => {
      const [root, assertions] = createTestData([
        'KnownSuccess',
        ['KnownFail', 13],
        'KnownSuccess',
      ]);
      const matched = match.matchTestAssertions('a file', root, assertions);
      expect(matched).toHaveLength(3);
      expect(matched.map((m) => m.status)).toEqual(['KnownSuccess', 'KnownFail', 'KnownSuccess']);
      expect(matched[1].status).toEqual('KnownFail');
      expect(matched[1].start).toEqual({ line: 11, column: 0 });
      expect(matched[1].end).toEqual({ line: 19, column: 0 });
      expect(matched[1].lineNumberOfError).toEqual(12);
    });
    describe('describe.each use case', () => {
      describe('1 test in describe.each', () => {
        it.each`
          t1Info                                     | d1Info               | a1Info                        | a2Info
          ${['test-1']}                              | ${['d-1.each $var']} | ${['test-1', ['d-1.each 1']]} | ${['test-1', ['d-1.each 2']]}
          ${['test-1']}                              | ${['d-1.each']}      | ${['test-1', ['d-1.each']]}   | ${['test-1', ['d-1.each']]}
          ${['test-${k}', { hasDynamicName: true }]} | ${['d-1.each']}      | ${['test-1', ['d-1.each']]}   | ${['test-1', ['d-1.each']]}
          ${['test-${k}', { hasDynamicName: true }]} | ${['d-1.each $var']} | ${['test-1', ['d-1.each 1']]} | ${['test-1', ['d-1.each 2']]}
        `('$t1Info in $d1Info', ({ t1Info, d1Info, a1Info, a2Info }) => {
          let [tName, override] = t1Info;
          const t1 = helper.makeItBlock(tName, [1, 0, 5, 0], { ...(override ?? {}) });
          [tName, override] = d1Info;
          const d1 = helper.makeDescribeBlock(tName, [t1], {
            lastProperty: 'each',
            ...(override ?? {}),
          });

          let [aName, ancestor] = a1Info;
          const a1 = helper.makeAssertion(aName, 'KnownSuccess', ancestor, [1, 0]);
          [aName, ancestor] = a2Info;
          const a2 = helper.makeAssertion(aName, 'KnownFail', ancestor, [1, 0]);

          const sourceRoot = helper.makeRoot([d1]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

          expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
            [a1.fullName, t1.start.line - 1, a1.status, ['match-by-context']],
            [a2.fullName, t1.start.line - 1, a2.status, ['match-by-context']],
          ]);

          // expect(matched.map((m) => extractResult(m))).toEqual(
          //   expect.arrayContaining([
          //     [a1.fullName, t1.start.line - 1, a1.status, ['match-by-context']],
          //     [a2.fullName, t1.start.line - 1, a2.status, ['match-by-context']],
          //   ])
          // );
        });
      });

      describe('nested each tests in describe.each', () => {
        const t1 = helper.makeItBlock('test-1.each $count', [1, 0, 5, 0], { lastProperty: 'each' });
        const d1 = helper.makeDescribeBlock('d-1.each $var', [t1], { lastProperty: 'each' });
        const a1 = helper.makeAssertion('test-1.each 1', 'KnownSuccess', ['d-1.each 1'], [1, 0]);
        const a2 = helper.makeAssertion('test-1.each 2', 'KnownFail', ['d-1.each 1'], [1, 0]);
        const a3 = helper.makeAssertion('test-1.each 2', 'KnownSuccess', ['d-1.each 2'], [1, 0]);

        it('single nested each tests in describe.each', () => {
          const sourceRoot = helper.makeRoot([d1]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3]);
          expect(matched).toHaveLength(3);
          expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
            expect.arrayContaining([
              [a1.fullName, t1.start.line - 1, a1.status, 'match-by-context'],
              [a2.fullName, t1.start.line - 1, a2.status, 'match-by-context'],
              [a3.fullName, t1.start.line - 1, a3.status, 'match-by-context'],
            ])
          );
        });
        it('multiple tests in the describe.each block', () => {
          const t2 = helper.makeItBlock('test-2', [10, 0, 5, 0]);
          const t3 = helper.makeItBlock('test-3-${k}', [20, 0, 5, 0], {
            nameType: 'TemplateLiteral',
          });
          const dd1 = helper.makeDescribeBlock('d-1.each $var', [t1, t2, t3], {
            lastProperty: 'each',
          });

          const a4 = helper.makeAssertion('test-2', 'KnownSuccess', ['d-1.each 1'], [11, 0]);
          const a5 = helper.makeAssertion('test-2', 'KnownSuccess', ['d-1.each 2'], [11, 0]);
          const a6 = helper.makeAssertion('test-3-a', 'KnownSuccess', ['d-1.each 1'], [33, 0]);
          const a7 = helper.makeAssertion('test-3-b', 'KnownFail', ['d-1.each 2'], [33, 0]);

          const sourceRoot = helper.makeRoot([dd1]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [
            a1,
            a2,
            a3,
            a4,
            a5,
            a6,
            a7,
          ]);
          expect(matched).toHaveLength(7);
          expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
            expect.arrayContaining([
              [a1.fullName, t1.start.line - 1, a1.status, 'match-by-context'],
              [a2.fullName, t1.start.line - 1, a2.status, 'match-by-context'],
              [a3.fullName, t1.start.line - 1, a3.status, 'match-by-context'],
              [a4.fullName, t2.start.line - 1, a4.status, 'match-by-context'],
              [a5.fullName, t2.start.line - 1, a5.status, 'match-by-context'],
              [a6.fullName, t3.start.line - 1, a6.status, 'match-by-context'],
              [a7.fullName, t3.start.line - 1, a7.status, 'match-by-context'],
            ])
          );
        });
      });
      it('1 simple test in describe.each with the same name', () => {
        const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
        const d1 = helper.makeDescribeBlock('d-1.each', [t1], { lastProperty: 'each' });
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1.each'], [1, 0]);
        const a2 = helper.makeAssertion('test-1', 'KnownFail', ['d-1.each'], [1, 0]);

        const sourceRoot = helper.makeRoot([d1]);
        const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);
        expect(matched).toHaveLength(2);
        expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
          expect.arrayContaining([
            [a1.fullName, t1.start.line - 1, a1.status, 'match-by-context'],
            [a2.fullName, t1.start.line - 1, a2.status, 'match-by-context'],
          ])
        );
      });
      it('1 dynamically named test.each in describe.each', () => {
        const t1 = helper.makeItBlock('test-1-${x}', [1, 0, 5, 0], { nameType: 'TemplateLiteral' });
        const d1 = helper.makeDescribeBlock('d-1.each $var', [t1], { lastProperty: 'each' });
        const a1 = helper.makeAssertion('`test-1-x`', 'KnownSuccess', ['d-1.each 1'], [1, 0]);
        const a2 = helper.makeAssertion('test-1-y', 'KnownFail', ['d-1.each 2'], [1, 0]);

        const sourceRoot = helper.makeRoot([d1]);
        const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);
        expect(matched).toHaveLength(2);
        expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
          expect.arrayContaining([
            [a1.fullName, t1.start.line - 1, a1.status, 'match-by-context'],
            [a2.fullName, t1.start.line - 1, a2.status, 'match-by-context'],
          ])
        );
      });
      it('it.each within describe.each', () => {
        const t1 = helper.makeItBlock('test.each $x', [1, 0, 5, 0], { lastProperty: 'each' });
        const d1 = helper.makeDescribeBlock('d-1.each $var', [t1], { lastProperty: 'each' });
        const a1 = helper.makeAssertion('`test.each a`', 'KnownSuccess', ['d-1.each 1'], [1, 0]);
        const a2 = helper.makeAssertion('test.each b', 'KnownFail', ['d-1.each 1'], [1, 0]);
        const a3 = helper.makeAssertion('test.each a', 'KnownSuccess', ['d-1.each 2'], [1, 0]);
        const a4 = helper.makeAssertion('test.each b', 'KnownSuccess', ['d-1.each 2'], [1, 0]);

        const sourceRoot = helper.makeRoot([d1]);
        const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3, a4]);
        expect(matched).toHaveLength(4);
        expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
          expect.arrayContaining([
            [a1.fullName, t1.start.line - 1, a1.status, 'match-by-context'],
            [a2.fullName, t1.start.line - 1, a2.status, 'match-by-context'],
            [a3.fullName, t1.start.line - 1, a3.status, 'match-by-context'],
            [a4.fullName, t1.start.line - 1, a4.status, 'match-by-context'],
          ])
        );
      });
      it('deeper it.each within describe.each', () => {
        const t1 = helper.makeItBlock('test.each $x', [1, 0, 5, 0], { lastProperty: 'each' });
        const d1 = helper.makeDescribeBlock('d-1.each $var', [t1], { lastProperty: 'each' });
        const d2 = helper.makeDescribeBlock('d-2', [d1]);
        const t2 = helper.makeItBlock('empty test', [6, 0, 7, 0]);

        const a1 = helper.makeAssertion('`test.each a`', 'KnownSuccess', ['d-1.each 1'], [1, 0]);
        const a2 = helper.makeAssertion('test.each b', 'KnownFail', ['d-1.each 1'], [1, 0]);
        const a3 = helper.makeAssertion('test.each a', 'KnownSuccess', ['d-1.each 2'], [1, 0]);
        const a4 = helper.makeAssertion('test.each b', 'KnownSuccess', ['d-1.each 2'], [1, 0]);

        const sourceRoot = helper.makeRoot([d2, t2]);
        const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3, a4]);
        // expect(matched).toHaveLength(5);
        expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
          expect.arrayContaining([
            [a1.fullName, t1.start.line - 1, a1.status, 'match-by-location'],
            [a2.fullName, t1.start.line - 1, a2.status, 'match-by-location'],
            [a3.fullName, t1.start.line - 1, a3.status, 'match-by-location'],
            [a4.fullName, t1.start.line - 1, a4.status, 'match-by-location'],
            [t2.name, t2.start.line - 1, 'Unknown', 'match-failed'],
          ])
        );
      });
    });
  });
  it('test name precedence: assertion.fullName > assertion.title > testSource.name', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2-${num}', [6, 0, 7, 0], { nameType: 'TemplateLiteral' });
    const t3 = helper.makeItBlock('test-3-no-assertion', [8, 0, 10, 0]);
    const d1 = helper.makeDescribeBlock('d-1', [t1, t2]);
    const sourceRoot = helper.makeRoot([d1, t3]);

    const a1 = helper.makeAssertion('test-1', 'KnownFail', ['d-1'], [0, 0]);
    a1.fullName = undefined;
    const a2 = helper.makeAssertion('test-2-100', 'KnownSuccess', ['d-1'], [7, 0]);
    const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

    const expected = ['test-3-no-assertion', 'test-1', 'd-1 test-2-100'];
    expect(matched).toHaveLength(expected.length);
    expect(matched.map((m) => m.name)).toEqual(expect.arrayContaining(expected));

    expect(matched.map((m) => m.status)).toEqual(
      expect.arrayContaining(['Unknown', 'KnownFail', 'KnownSuccess'])
    );
  });
  it('duplicate name in the same block would generate error if only we can not match by context', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-1', [6, 0, 7, 0]);
    const sourceRoot = helper.makeRoot([t1, t2]);
    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', undefined, [2, 0]);
    const a2 = helper.makeAssertion('test-1', 'KnownFail', undefined, [7, 0]);

    // when we can match by context
    let matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

    expect(matched).toHaveLength(2);
    expect(matched.map((m) => [m.name, m.status, m.start.line, m.sourceHistory])).toEqual([
      [a1.fullName, a1.status, t1.start.line - 1, expect.arrayContaining(['match-by-context'])],
      [a2.fullName, a2.status, t2.start.line - 1, expect.arrayContaining(['match-by-context'])],
    ]);
    // when we can not match by context
    matched = match.matchTestAssertions('a file', sourceRoot, [a1]);

    expect(matched).toHaveLength(2);
    expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
      [a1.fullName, t1.start.line - 1, a1.status, ['duplicate-name', 'match-by-location']],
      ['test-1', t2.start.line - 1, 'Unknown', ['duplicate-name', 'match-failed']],
    ]);
  });
  describe('duplicate name in the describe blocks', () => {
    it('would be ok as long as we can match the tests within', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
      const t2 = helper.makeItBlock('test-2', [6, 0, 7, 0]);
      const d1 = helper.makeDescribeBlock('d-1', [t1]);
      const d2 = helper.makeDescribeBlock('d-1', [t2]);
      const sourceRoot = helper.makeRoot([d1, d2]);
      const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1'], [2, 0]);
      const a2 = helper.makeAssertion('test-2', 'KnownFail', ['d-1'], [7, 0]);

      // when the test within the describe have different name: we should be able to match just fine
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

      expect(matched).toHaveLength(2);
      expect(matched.map((m) => [m.name, m.status, m.start.line, m.sourceHistory])).toEqual([
        [a1.fullName, a1.status, t1.start.line - 1, expect.arrayContaining(['match-by-name'])],
        [a2.fullName, a2.status, t2.start.line - 1, expect.arrayContaining(['match-by-name'])],
      ]);
    });
    it('would fail the match if test within can not be resolved deterministically', () => {
      const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
      const t2 = helper.makeItBlock('test-1', [6, 0, 9, 0]);
      const d1 = helper.makeDescribeBlock('d-1', [t1]);
      const d2 = helper.makeDescribeBlock('d-1', [t2]);
      const sourceRoot = helper.makeRoot([d1, d2]);
      const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1'], [22, 0]);
      const a2 = helper.makeAssertion('test-1', 'KnownFail', ['d-1'], [27, 0]);

      // when the test within the describe have different name: we should be able to match just fine
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

      expect(matched).toHaveLength(2);
      // when test within have the same name, then it will report error
      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [`d-1 ${t1.name}`, t1.start.line - 1, 'Unknown', ['duplicate-name', 'match-failed']],
        [`d-1 ${t2.name}`, t2.start.line - 1, 'Unknown', ['duplicate-name', 'match-failed']],
      ]);
    });
  });

  // test.todo will generate null for location that could confuses the context matching
  describe('unknown location and test result reason', () => {
    const t1 = helper.makeItBlock('test-${i}', [1, 0, 5, 0], { nameType: 'TemplateLiteral' }); // under d-1
    const t2 = helper.makeItBlock('test.todo 1', [6, 0, 7, 0]); // under d-1
    const t3 = helper.makeItBlock('test.todo 2', [9, 0, 10, 0]); // under d-1
    const t4 = helper.makeItBlock('test-2', [12, 0, 20, 0]); // under d-1
    const t5 = helper.makeItBlock('some weird test', [22, 0, 22, 100]); // under d-2
    const d1 = helper.makeDescribeBlock('d-1', [t1, t2, t3, t4]);
    const d2 = helper.makeDescribeBlock('d-2', [t5]);

    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['d-1'], [1, 0]);
    const a2 = helper.makeAssertion('test.todo 1', 'Unknown', ['d-1'], undefined, {
      location: null,
    });
    const a3 = helper.makeAssertion('test.todo 2', 'Unknown', ['d-1'], undefined, {
      location: null,
    });
    const a4 = helper.makeAssertion('test-2', 'KnownFail', ['d-1'], [12, 0]);
    const a5 = helper.makeAssertion('some weird test', 'KnownFail', ['d-2'], undefined, {
      location: null,
    });

    it('nodes with unknown locations can still be merged by name', () => {
      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3, a4]);
      expect(matched).toHaveLength(4);
      expect(matched.map((m) => [m.name, m.status, reason(m)])).toEqual(
        expect.arrayContaining([
          [a1.fullName, a1.status, 'match-by-context'],
          [a2.fullName, a2.status, 'match-by-name'],
          [a3.fullName, a3.status, 'match-by-name'],
          [a4.fullName, a4.status, 'match-by-context'],
        ])
      );
      // no merge
      expect(matched.every((m) => !m.multiResults)).toBeTruthy();
    });
    it('block with only unknown location tests can still be matched by name', () => {
      const sourceRoot = helper.makeRoot([d1, d2]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3, a4, a5]);
      expect(matched).toHaveLength(5);
      expect(matched.map((m) => [m.name, m.status, reason(m)])).toEqual(
        expect.arrayContaining([
          [a1.fullName, a1.status, 'match-by-context'],
          [a2.fullName, a2.status, 'match-by-name'],
          [a3.fullName, a3.status, 'match-by-name'],
          [a4.fullName, a4.status, 'match-by-context'],
          [a5.fullName, a5.status, 'match-by-name'],
        ])
      );
    });
    it('if unknown location test failed to match by name, they will show up as unknown and may impacted other test matching', () => {
      const a3Unmatched = helper.makeAssertion(
        'test.todo 2 unmatched',
        'KnownSuccess',
        ['d-1'],
        undefined,
        {
          location: null,
        }
      );
      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a4, a3Unmatched]);
      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a2.fullName, t2.start.line - 1, a2.status, ['match-by-name']],
        [a4.fullName, t4.start.line - 1, a4.status, ['match-by-name']],
        [a1.fullName, t1.start.line - 1, a1.status, ['match-by-location']],
        [`d-1 ${t3.name}`, t3.start.line - 1, 'Unknown', ['match-failed']],
      ]);
    });
    it('match result reason can pass through the hierarchy', () => {
      const deep2 = helper.makeDescribeBlock('layer-2', [t1]);
      const deep1 = helper.makeDescribeBlock('layer-1', [deep2]);
      const matched = match.matchTestAssertions('a file', helper.makeRoot([deep1]), []);
      expect(matched).toHaveLength(1);
      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [`layer-1 layer-2 ${t1.name}`, t1.start.line - 1, 'Unknown', ['match-failed']],
      ]);
    });
  });
  describe('invalid grouping: do no worse than match-by-name', () => {
    const t0 = helper.makeItBlock('first test', [1, 0, 6, 0]);
    const d0 = helper.makeDescribeBlock('desc-1', [t0]);
    const t1 = helper.makeItBlock('test.each $a', [7, 0, 5, 0], { lastProperty: 'each' });
    const d1 = helper.makeDescribeBlock('wrapper-1', [t1]);
    const t2 = helper.makeItBlock('test.each again $a', [10, 0, 15, 0], { lastProperty: 'each' });
    // const d2 = helper.makeDescribeBlock('wrapper-2', [t2]);
    const t3 = helper.makeItBlock('last test', [15, 0, 27, 0]);
    const tTodo = helper.makeItBlock('a todo test', [30, 0, 30, 0]);
    const d3 = helper.makeDescribeBlock('wrapper-3', [t3, tTodo]);

    describe('when all tests have the same loation: i.e. they will be grouped incorrectly', () => {
      const a0 = helper.makeAssertion('first test', 'KnownSuccess', undefined, [1, 0]);
      const a1 = helper.makeAssertion('test.each 1', 'KnownSuccess', undefined, [1, 0]);
      const a2 = helper.makeAssertion('test.each 2', 'KnownFail', undefined, [1, 0]);
      // const a3 = helper.makeAssertion('test.each again 3', 'KnownSuccess', undefined, [1, 0]);
      const a4 = helper.makeAssertion('last test', 'KnownSuccess', undefined, [1, 0]);
      const a5 = helper.makeAssertion('a todo test', 'KnownTodo', undefined, undefined, {
        location: null,
      });

      it('can match by name for static test names', () => {
        const sourceRoot = helper.makeRoot([t0, t3, tTodo]);
        const matched = match.matchTestAssertions('a file', sourceRoot, [a4, a0, a5]);
        expect(matched).toHaveLength(3);

        expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
          [a0.fullName, t0.start.line - 1, a0.status, ['match-by-name']],
          [a4.fullName, t3.start.line - 1, a4.status, ['match-by-name']],
          [a5.fullName, tTodo.start.line - 1, a5.status, ['match-by-name', 'invalid-location']],
        ]);
      });
      describe('can skip dynamic named tests while still matching the static named ones', () => {
        it('simple case: no describe', () => {
          const sourceRoot = helper.makeRoot([t0, t1, t3, tTodo]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a4, a0, a5]);
          expect(matched).toHaveLength(4);
          expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
            expect.arrayContaining([
              [a0.fullName, t0.start.line - 1, a0.status, 'match-by-name'],
              [t1.name, t1.start.line - 1, 'Unknown', 'match-failed'],
              [a4.fullName, t3.start.line - 1, a4.status, 'match-by-name'],
              [a5.fullName, tTodo.start.line - 1, a5.status, 'match-by-name'],
            ])
          );
        });
        it('a more complex case: with desc blocks', () => {
          const sourceRoot = helper.makeRoot([d0, t1, t3, tTodo]);
          const a0d = helper.makeAssertion('first test', 'KnownSuccess', ['desc-1'], [1, 0]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a4, a0d, a5]);
          expect(matched).toHaveLength(4);
          expect(matched.map((m) => [m.name, m.start.line, m.status, reason(m)])).toEqual(
            expect.arrayContaining([
              [a0d.fullName, t0.start.line - 1, a0d.status, 'match-by-context'],
              [t1.name, t1.start.line - 1, 'Unknown', 'match-failed'],
              [a4.fullName, t3.start.line - 1, a4.status, 'match-by-name'],
              [a5.fullName, tTodo.start.line - 1, a5.status, 'match-by-name'],
            ])
          );
        });
        it('a more complex case2: with deep desc blocks and multiple tests within', () => {
          const dComplex = helper.makeDescribeBlock('desc-deep', [d1, t2]);
          const a1d = helper.makeAssertion(
            'test.each 1',
            'KnownSuccess',
            ['desc-deep', 'wrapper-1'],
            [1, 0]
          );
          const a2d = helper.makeAssertion(
            'test.each 2',
            'KnownFail',
            ['desc-deep', 'wrapper-1'],
            [1, 0]
          );
          const a3d = helper.makeAssertion(
            'test.each again 3',
            'KnownSuccess',
            ['desc-deep'],
            [1, 0]
          );
          const a4d = helper.makeAssertion('last test', 'KnownSuccess', ['wrapper-3'], [1, 0]);
          const a5d = helper.makeAssertion('a todo test', 'KnownTodo', ['wrapper-3'], undefined, {
            location: null,
          });

          const sourceRoot = helper.makeRoot([t0, dComplex, d3]);
          const matched = match.matchTestAssertions('a file', sourceRoot, [
            a1d,
            a2d,
            a3d,
            a4d,
            a0,
            a5d,
          ]);
          expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
            [a0.fullName, t0.start.line - 1, a0.status, ['match-by-context']],
            [a1d.fullName, t1.start.line - 1, a1d.status, ['match-by-context']],
            [a2d.fullName, t1.start.line - 1, a2d.status, ['match-by-context']],
            [a3d.fullName, t2.start.line - 1, a3d.status, ['match-by-context']],
            [a4d.fullName, t3.start.line - 1, a4d.status, ['match-by-context']],
            [a5d.fullName, tTodo.start.line - 1, a5d.status, ['match-by-name']],
          ]);
        });
      });
    });
  });
  describe('can handle missing ancestorTitles (#715)', () => {
    const t1 = helper.makeItBlock('test me', [1, 0, 6, 0]);
    const d1 = helper.makeDescribeBlock('desc-1', [t1]);

    const t2 = helper.makeItBlock('test me', [10, 0, 15, 0]);
    const d2 = helper.makeDescribeBlock('desc-2', [t2]);

    it('simple 1 test in describe block', () => {
      const a1 = helper.makeAssertion('test me', 'KnownSuccess', undefined, [1, 0], {
        fullName: 'desc-1 test me',
      });
      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);
      expect(matched).toHaveLength(1);
      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a1.fullName, t1.start.line - 1, a1.status, ['match-by-name']],
      ]);
    });
    it('2 test block with the same name but different describe blocks', () => {
      const a1 = helper.makeAssertion('test me', 'KnownSuccess', undefined, [1, 0], {
        fullName: 'desc-1 test me',
      });
      const a2 = helper.makeAssertion('test me', 'KnownFail', undefined, [10, 0], {
        fullName: 'desc-2 test me',
      });
      const sourceRoot = helper.makeRoot([d1, d2]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);
      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a1.fullName, t1.start.line - 1, a1.status, ['missing-ancestor-info', 'match-by-name']],
        [a2.fullName, t2.start.line - 1, a2.status, ['missing-ancestor-info', 'match-by-name']],
      ]);
    });
    it('when test.each matched multiple assertions by full-name', () => {
      const t1 = helper.makeItBlock('a each test', [1, 0, 6, 0], { lastProperty: 'each' });
      const d1 = helper.makeDescribeBlock('desc-1', [t1]);

      const a1 = helper.makeAssertion('a each test', 'KnownSuccess', undefined, [1, 0], {
        fullName: 'desc-1 a each test',
      });
      const a2 = helper.makeAssertion('a each test', 'KnownFail', undefined, [1, 0], {
        fullName: 'desc-1 a each test',
      });
      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a1.fullName, t1.start.line - 1, a1.status, ['missing-ancestor-info', 'match-by-name']],
        [a2.fullName, t1.start.line - 1, a2.status, ['missing-ancestor-info', 'match-by-name']],
      ]);
    });
    it('can still detect duplicate test names and match by location', () => {
      const t1 = helper.makeItBlock('a test', [1, 0, 6, 0]);
      const t2 = helper.makeItBlock('a test', [10, 0, 16, 0]);
      const d1 = helper.makeDescribeBlock('desc-1', [t1, t2]);

      const a1 = helper.makeAssertion('a test', 'KnownSuccess', undefined, [1, 0], {
        fullName: 'desc-1 a test',
      });
      const a2 = helper.makeAssertion('a test', 'KnownFail', undefined, [10, 0], {
        fullName: 'desc-1 a test',
      });
      mockError.mockClear();

      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a1.fullName, t1.start.line - 1, a1.status, ['duplicate-name', 'match-by-location']],
        [a2.fullName, t2.start.line - 1, a2.status, ['duplicate-name', 'match-by-location']],
      ]);
    });
  });

  describe('console output', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 6, 0]);
    const t2 = helper.makeItBlock('test-2', [10, 0, 16, 0]);
    const d1 = helper.makeDescribeBlock('desc-1', [t1, t2]);

    const a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['desc-1'], [1, 0]);
    const a3 = helper.makeAssertion('test-3', 'KnownSuccess', undefined, [15, 0]);

    it.each([true, false])('mismatch message is shown when verbose = %p', (verbose) => {
      const sourceRoot = helper.makeRoot([d1]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a3], verbose);
      expect(matched).toHaveLength(2);
      expect(matched.map((m) => [m.name, m.sourceHistory])).toEqual(
        expect.arrayContaining([['desc-1 test-2', expect.arrayContaining(['match-failed'])]])
      );
      expect(mockWarn).toBeCalledTimes(1);

      const info = mockWarn.mock.calls[0][1];
      expect(info.type).toEqual('report-unmatched');
      expect(info.unmatchedItBlocks).toHaveLength(1);
      expect(info.unmatchedItBlocks).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'test-2' })])
      );
      expect(info.unmatchedAssertions).toHaveLength(1);
      expect(info.unmatchedAssertions).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'test-3' })])
      );
    });
  });
  describe('edge cases', () => {
    it('when location order is wrong but context matched', () => {
      // angular produces fixed wrong location that caused the order of the tests are also wrong
      // even though the context matched!
      const t1 = helper.makeItBlock('a test', [1, 0, 6, 0]);
      const t2 = helper.makeItBlock('a test.each %i', [10, 0, 16, 0], { lastProperty: 'each' });

      const a1 = helper.makeAssertion('a test', 'KnownSuccess', undefined, [100, 0]);
      const a2 = helper.makeAssertion('a test.each 1 ', 'KnownFail', undefined, [10, 0]);
      const a3 = helper.makeAssertion('a test.each 2', 'KnownSuccess', undefined, [10, 0]);

      const sourceRoot = helper.makeRoot([t1, t2]);
      const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2, a3]);

      expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
        [a1.fullName, t1.start.line - 1, a1.status, ['match-by-name']],
        [a2.fullName, t2.start.line - 1, a2.status, ['match-by-location']],
        [a3.fullName, t2.start.line - 1, a3.status, ['match-by-location']],
      ]);
    });
  });
  it('matched assertions would be updated with source range', () => {
    const getRange = (t) => ({
      start: { line: t.start.line - 1, column: t.start.column - 1 },
      end: { line: t.end.line - 1, column: t.end.column - 1 },
    });
    const t1 = helper.makeItBlock('a test $seq', [2, 5, 6, 51], { lastProperty: 'each' });
    const d1 = helper.makeDescribeBlock('desc-1', [t1], {
      start: { line: 1, column: 3 },
      end: { line: 7, column: 3 },
    });

    const a1 = helper.makeAssertion('a test 1', 'KnownSuccess', ['desc-1'], [3, 0]);
    const a2 = helper.makeAssertion('a test 2 ', 'KnownFail', ['desc-1'], [3, 0]);

    const sourceRoot = helper.makeRoot([d1]);
    const assertionRoot = match.buildAssertionContainer([a1, a2]);
    const matched = match.matchTestAssertions('a file', sourceRoot, assertionRoot);

    expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
      [a1.fullName, t1.start.line - 1, a1.status, ['match-by-context']],
      [a2.fullName, t1.start.line - 1, a2.status, ['match-by-context']],
    ]);
    const assertionDescribe = assertionRoot.childContainers[0];
    expect(assertionDescribe.attrs.range).toEqual(getRange(d1));
    expect(assertionDescribe.attrs.range).toEqual(getRange(d1));
    assertionDescribe.childData.forEach((c) => expect(c.attrs.range).toEqual(getRange(t1)));
  });

  // see https://github.com/jest-community/vscode-jest/issues/608#issuecomment-849770258
  it('dynamic named describe block should work for match-by-context', () => {
    const t1 = helper.makeItBlock('simple test', [1, 0, 6, 0]);
    const d1 = helper.makeDescribeBlock('`with ${TemplateLiteral}`', [t1]);

    const a1 = helper.makeAssertion('simple test', 'KnownSuccess', ['with whatever'], [1, 0]);
    const sourceRoot = helper.makeRoot([d1]);
    const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);

    expect(matched.map((m) => toTestResultRecord(m))).toMatchTestResults([
      [a1.fullName, t1.start.line - 1, a1.status, ['match-by-context']],
    ]);
  });
});
