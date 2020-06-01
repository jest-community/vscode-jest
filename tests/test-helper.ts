/* istanbul ignore file */
import { Location, LocationRange, TestResult } from '../src/TestResults/TestResult';
import { TestReconciliationState } from '../src/TestResults';
import { ItBlock, TestAssertionStatus } from 'jest-editor-support';

export const EmptyLocation = {
  line: 0,
  column: 0,
};
export const EmptyLocationRange = {
  start: EmptyLocation,
  end: EmptyLocation,
};
export const makeLocation = (pos: [number, number]): Location => ({
  line: pos[0],
  column: pos[1],
});
export const makePositionRange = (pos: [number, number, number, number]) => ({
  start: makeLocation([pos[0], pos[1]]),
  end: makeLocation([pos[2], pos[3]]),
});
export const isSameLocation = (p1: Location, p2: Location): boolean =>
  p1.line === p2.line && p1.column === p2.column;
export const isSameLocationRange = (r1: LocationRange, r2: LocationRange): boolean =>
  isSameLocation(r1.start, r2.start) && isSameLocation(r1.end, r2.end);

export const makeZeroBased = (r: LocationRange): LocationRange => ({
  start: { line: r.start.line - 1, column: r.start.column - 1 },
  end: { line: r.end.line - 1, column: r.end.column - 1 },
});
export const findResultForTest = (results: TestResult[], itBlock: ItBlock): TestResult[] => {
  const zeroBasedRange = makeZeroBased(itBlock);
  return results.filter((r) => r.name === itBlock.name && isSameLocationRange(r, zeroBasedRange));
};

// factory method
export const makeItBlock = (name?: string, pos?: [number, number, number, number]): any => {
  const loc = pos ? makePositionRange(pos) : EmptyLocationRange;
  return {
    type: 'it',
    name,
    ...loc,
  };
};
export const makeDescribeBlock = (name: string, itBlocks: any[]): any => ({
  type: 'describe',
  name,
  children: itBlocks,
});
export const makeRoot = (children: any[]): any => ({
  type: 'root',
  children,
});
export const makeAssertion = (
  title: string,
  status: TestReconciliationState,
  ancestorTitles: string[] = [],
  location?: [number, number],
  override?: Partial<TestAssertionStatus>
): TestAssertionStatus =>
  ({
    title,
    ancestorTitles,
    fullName: [...ancestorTitles, title].join(' '),
    status,
    location: location ? makeLocation(location) : EmptyLocation,
    ...(override || {}),
  } as TestAssertionStatus);
