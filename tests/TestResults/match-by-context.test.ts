jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');

import * as helper from '../test-helper';
import * as match from '../../src/TestResults/match-by-context';
import { TestReconciliationStateType } from '../../src/TestResults';
import { TestAssertionStatus, ParsedNode } from 'jest-editor-support';

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
    expect(groupNode.data).toHaveLength(3);
    expect(groupNode.data.map((n) => n.title)).toEqual(['test-1', 'test-3', 'test-2']);
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
  const mockWarn = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    console.warn = mockWarn;
  });
  it('tests are matched by context position regardless name and line', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2-${num}', [6, 0, 7, 0]);
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
      const t2 = helper.makeItBlock('test-2', [1, 0, 5, 0]);
      const sourceRoot = helper.makeRoot([t1, t2]);

      const a1 = helper.makeAssertion('test-1', 'KnownFail', [], [0, 0]);

      const matched = match.matchTestAssertions('a file', sourceRoot, [a1]);
      expect(matched.map((m) => [m.name, m.status])).toEqual([
        ['test-1', 'KnownFail'],
        ['test-2', 'Unknown'],
      ]);
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
      expect(matched.map((m) => [m.name, m.status])).toEqual([
        ['test-1', 'KnownSuccess'],
        ['d-1 test-2', 'KnownFail'],
        ['test-3', 'Unknown'],
        ['d-1 d-1-1 test-4', 'KnownSuccess'],
      ]);
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
        ['test-2', 'Unknown'],
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
      const t1 = helper.makeItBlock('', [12, 1, 20, 1]);
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
  });
  it('test name precedence: assertion.fullName > assertion.title > testSource.name', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-2-${num}', [6, 0, 7, 0]);
    const t3 = helper.makeItBlock('test-3-no-assertion', [8, 0, 10, 0]);
    const d1 = helper.makeDescribeBlock('d-1', [t1, t2]);
    const sourceRoot = helper.makeRoot([d1, t3]);

    const a1 = helper.makeAssertion('test-1-a', 'KnownFail', ['d-1'], [0, 0]);
    a1.fullName = undefined;
    const a2 = helper.makeAssertion('test-2-100', 'KnownSuccess', ['d-1'], [7, 0]);
    const matched = match.matchTestAssertions('a file', sourceRoot, [a1, a2]);

    expect(matched).toHaveLength(3);
    expect(matched.map((m) => m.name)).toEqual([
      'test-3-no-assertion',
      'test-1-a',
      'd-1 test-2-100',
    ]);
    expect(matched.map((m) => m.status)).toEqual(['Unknown', 'KnownFail', 'KnownSuccess']);
  });
  it('duplicate name in the same block should generate warning', () => {
    const t1 = helper.makeItBlock('test-1', [1, 0, 5, 0]);
    const t2 = helper.makeItBlock('test-1', [6, 0, 7, 0]);
    const sourceRoot = helper.makeRoot([t1, t2]);

    const matched = match.matchTestAssertions('a file', sourceRoot, []);

    expect(matched).toHaveLength(2);
    expect(matched.map((m) => m.name)).toEqual(['test-1', 'test-1']);
    expect(matched.map((m) => m.status)).toEqual(['Unknown', 'Unknown']);
    expect(
      mockWarn.mock.calls.find((call) => call[0].includes('duplicate names'))
    ).not.toBeUndefined();
  });
});
