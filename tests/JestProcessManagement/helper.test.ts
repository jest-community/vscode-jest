import { isRequestEqual, isDup } from '../../src/JestProcessManagement/helper';

jest.unmock('../../src/JestProcessManagement/helper');

describe('isRequestEqual', () => {
  it.each`
    r1                                                                              | r2                                                                              | isEqual
    ${{ type: 'all-tests' }}                                                        | ${{ type: 'all-tests' }}                                                        | ${true}
    ${{ type: 'all-tests' }}                                                        | ${{ type: 'watch-tests' }}                                                      | ${false}
    ${{ type: 'watch-tests' }}                                                      | ${{ type: 'watch-all-tests' }}                                                  | ${false}
    ${{ type: 'by-file', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file', testFileNamePattern: 'abc' }}                              | ${true}
    ${{ type: 'by-file', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file', testFileNamePattern: 'abc', extra: 'whatever' }}           | ${true}
    ${{ type: 'by-file', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file', testFileNamePattern: 'def' }}                              | ${false}
    ${{ type: 'by-file', testFileNamePattern: undefined }}                          | ${{ type: 'by-file', testFileNamePattern: null }}                               | ${false}
    ${{ type: 'by-file', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file' }}                                                          | ${false}
    ${{ type: 'by-file-test', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${{ type: 'by-file-test', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${true}
    ${{ type: 'by-file-test', testFileNamePattern: 'abc' }}                         | ${{ type: 'by-file-test', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${false}
    ${{ type: 'by-file-test', testFileNamePattern: 'abc' }}                         | ${{ type: 'by-file-test', testFileNamePattern: 'abc' }}                         | ${true}
    ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                   | ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                   | ${true}
    ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                   | ${{ type: 'not-test', args: ['abc'] }}                                          | ${false}
    ${{ type: 'not-test', args: [] }}                                               | ${{ type: 'not-test', args: ['abc'] }}                                          | ${false}
  `('$r1 ?== $r2 ? $isEqual', ({ r1, r2, isEqual }) => {
    expect(isRequestEqual(r1, r2)).toEqual(isEqual);
  });
});
describe('isDup', () => {
  it('not dup if no check is specified', () => {
    const task: any = {
      data: { request: { type: 'watch-tests' } },
      status: 'pending',
    };
    const request1: any = { type: 'watch-tests', schedule: {} };
    expect(isDup(task, request1)).toBeFalsy();
  });
  it('can check by request type', () => {
    const task: any = {
      data: { request: { type: 'watch-tests' } },
      status: 'pending',
    };
    const request1: any = { type: 'watch-tests', schedule: { dedup: {} } };
    const request2: any = { type: 'all-tests', schedule: { dedup: {} } };
    expect(isDup(task, request1)).toBeTruthy();
    expect(isDup(task, request2)).toBeFalsy();
  });
  it.each`
    type                 | status                    | expected
    ${'watch-tests'}     | ${['running']}            | ${false}
    ${'watch-tests'}     | ${['pending']}            | ${true}
    ${'watch-tests'}     | ${['running', 'pending']} | ${true}
    ${'watch-all-tests'} | ${['pending']}            | ${false}
  `('can check by request $type and $status, isDup = $expected', ({ type, status, expected }) => {
    const task: any = {
      data: { request: { type: 'watch-tests' } },
      status: 'pending',
    };
    const request: any = {
      type,
      schedule: { dedup: { filterByStatus: status } },
    };

    expect(isDup(task, request)).toEqual(expected);
  });
  it.each`
    type                 | status         | testFileNamePattern | expected
    ${'by-file'}         | ${['running']} | ${'abc'}            | ${false}
    ${'by-file'}         | ${['pending']} | ${'abc'}            | ${true}
    ${'by-file'}         | ${['pending']} | ${'def'}            | ${false}
    ${'by-file'}         | ${['pending']} | ${undefined}        | ${false}
    ${'by-file'}         | ${undefined}   | ${'abc'}            | ${true}
    ${'watch-all-tests'} | ${['pending']} | ${'abc'}            | ${false}
  `(
    'can check by $type, $status, filterByContent=$filterByContent, isDup = $expected',
    ({ type, status, testFileNamePattern, expected }) => {
      const task: any = {
        data: { request: { type: 'by-file', testFileNamePattern: 'abc' } },
        status: 'pending',
      };
      const request: any = {
        type,
        testFileNamePattern,
        schedule: { dedup: { filterByStatus: status, filterByContent: true } },
      };

      expect(isDup(task, request)).toEqual(expected);
    }
  );
});
