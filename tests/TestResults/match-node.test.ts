jest.unmock('../../src/TestResults/match-node');
jest.unmock('../test-helper');

import { BaseNode } from '../../src/TestResults/match-node';
// import * as helper from '../test-helper';

describe('BaseNode', () => {
  describe('match', () => {
    it.each`
      attrs1                                    | attrs2                                        | options                                                      | shouldMatch | addGroup
      ${{ fullName: 'x n1' }}                   | ${{ fullName: 'x n1' }}                       | ${undefined}                                                 | ${true}     | ${false}
      ${{ fullName: 'x n1' }}                   | ${{ fullName: 'y n1' }}                       | ${undefined}                                                 | ${false}    | ${false}
      ${{ fullName: 'x n1', isGroup: 'maybe' }} | ${{ fullName: 'x n1', nonLiteralName: true }} | ${undefined}                                                 | ${true}     | ${false}
      ${{ fullName: 'x n1', isGroup: 'maybe' }} | ${{ fullName: 'y n1', nonLiteralName: true }} | ${undefined}                                                 | ${false}    | ${false}
      ${{ fullName: 'x n1', isGroup: 'maybe' }} | ${{ fullName: 'y n1', nonLiteralName: true }} | ${{ ignoreNonLiteralNameDiff: true }}                        | ${true}     | ${false}
      ${{ fullName: 'x n1', isGroup: 'maybe' }} | ${{ fullName: 'y n1' }}                       | ${{ ignoreNonLiteralNameDiff: true }}                        | ${false}    | ${false}
      ${{ fullName: 'x n1' }}                   | ${{ fullName: 'y n1', nonLiteralName: true }} | ${{ ignoreNonLiteralNameDiff: true }}                        | ${false}    | ${false}
      ${{ fullName: 'x n1' }}                   | ${{ fullName: 'y n1', nonLiteralName: true }} | ${{ ignoreNonLiteralNameDiff: true }}                        | ${false}    | ${true}
      ${{ fullName: 'x n1' }}                   | ${{ fullName: 'y n1', nonLiteralName: true }} | ${{ ignoreNonLiteralNameDiff: true, ignoreGroupDiff: true }} | ${true}     | ${true}
    `(
      'checks names and groups: $attrs1 and $attrs2 $addGroup => $shouldMatch',
      ({ attrs1, attrs2, options, shouldMatch, addGroup }) => {
        const n1 = new BaseNode('n1', 10, attrs1);
        const n2 = new BaseNode('n2', 20, attrs2);
        if (addGroup) {
          n1.addGroupMember(new BaseNode('n3', 10));
        }
        expect(n1.match(n2, options)).toEqual(shouldMatch);
      }
    );
    it.each`
      loc1         | loc2         | options                    | shouldMatch
      ${[10, 10]}  | ${[0, 1]}    | ${undefined}               | ${true}
      ${[10, 10]}  | ${[0, 1]}    | ${{ checkIsWithin: true }} | ${false}
      ${[10, 10]}  | ${[0, 100]}  | ${undefined}               | ${true}
      ${[10, 10]}  | ${[0, 100]}  | ${{ checkIsWithin: true }} | ${true}
      ${undefined} | ${undefined} | ${undefined}               | ${true}
      ${undefined} | ${undefined} | ${{ checkIsWithin: true }} | ${false}
      ${undefined} | ${[0, 100]}  | ${{ checkIsWithin: true }} | ${false}
      ${[10, 10]}  | ${undefined} | ${{ checkIsWithin: true }} | ${false}
      ${[10, 10]}  | ${[10, 10]}  | ${{ checkIsWithin: true }} | ${true}
      ${[1, 100]}  | ${[1, 1]}    | ${{ checkIsWithin: true }} | ${false}
    `(
      'check location: $loc1 isWithin $loc2? $shouldMatch',
      ({ loc1, loc2, options, shouldMatch }) => {
        const range1 = loc1 && {
          start: { line: loc1[0], column: 0 },
          end: { line: loc1[1], column: 0 },
        };
        const range2 = loc2 && {
          start: { line: loc2[0], column: 0 },
          end: { line: loc2[1], column: 0 },
        };
        const n1 = new BaseNode('n1', 10, {
          fullName: 'n1',
          range: range1,
        });
        const n2 = new BaseNode('n1', 20, {
          fullName: 'n1',
          range: range2,
        });
        expect(n1.match(n2, options)).toEqual(shouldMatch);
      }
    );
  });
});
