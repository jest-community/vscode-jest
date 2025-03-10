import { isRequestEqual, isDupe } from '../../src/JestProcessManagement/helper';

jest.unmock('../../src/JestProcessManagement/helper');

describe('isRequestEqual', () => {
  it.each`
    r1                                                                                      | r2                                                                                      | isEqual
    ${{ type: 'all-tests' }}                                                                | ${{ type: 'all-tests' }}                                                                | ${true}
    ${{ type: 'all-tests' }}                                                                | ${{ type: 'watch-tests' }}                                                              | ${false}
    ${{ type: 'watch-tests' }}                                                              | ${{ type: 'watch-all-tests' }}                                                          | ${false}
    ${{ type: 'by-file', testFileName: 'abc' }}                                             | ${{ type: 'by-file', testFileName: 'abc' }}                                             | ${true}
    ${{ type: 'by-file', testFileName: 'abc' }}                                             | ${{ type: 'by-file', testFileName: 'abc', extra: 'whatever' }}                          | ${true}
    ${{ type: 'by-file', testFileName: 'abc' }}                                             | ${{ type: 'by-file', testFileName: 'def' }}                                             | ${false}
    ${{ type: 'by-file', testFileName: undefined }}                                         | ${{ type: 'by-file', testFileName: null }}                                              | ${false}
    ${{ type: 'by-file', testFileName: 'abc' }}                                             | ${{ type: 'by-file' }}                                                                  | ${false}
    ${{ type: 'by-file-pattern', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file-pattern', testFileNamePattern: 'abc' }}                              | ${true}
    ${{ type: 'by-file-pattern', testFileNamePattern: 'abc' }}                              | ${{ type: 'by-file-pattern', testFileNamePattern: 'Abc' }}                              | ${false}
    ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: '123' }}                | ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: '123' }}                | ${true}
    ${{ type: 'by-file-test', testFileName: 'abc' }}                                        | ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: '123' }}                | ${false}
    ${{ type: 'by-file-test', testFileName: 'abc' }}                                        | ${{ type: 'by-file-test', testFileName: 'abc' }}                                        | ${true}
    ${{ type: 'by-file-test-pattern', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${{ type: 'by-file-test-pattern', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${true}
    ${{ type: 'by-file-test-pattern', testFileNamePattern: 'abc', testNamePattern: '123' }} | ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: '123' }}                | ${false}
    ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                           | ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                           | ${true}
    ${{ type: 'not-test', args: ['abc', 'xyz'] }}                                           | ${{ type: 'not-test', args: ['abc'] }}                                                  | ${false}
    ${{ type: 'not-test', args: [] }}                                                       | ${{ type: 'not-test', args: ['abc'] }}                                                  | ${false}
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
    expect(isDupe(task, request1)).toBeFalsy();
  });
  it('can check by request type', () => {
    const task: any = {
      data: { request: { type: 'watch-tests' } },
      status: 'pending',
    };
    const request1: any = { type: 'watch-tests', schedule: { dedupe: {} } };
    const request2: any = { type: 'all-tests', schedule: { dedupe: {} } };
    expect(isDupe(task, request1)).toBeTruthy();
    expect(isDupe(task, request2)).toBeFalsy();
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
      schedule: { dedupe: { filterByStatus: status } },
    };

    expect(isDupe(task, request)).toEqual(expected);
  });
  it.each`
    type                 | status         | testFileName | expected
    ${'by-file'}         | ${['running']} | ${'abc'}     | ${false}
    ${'by-file'}         | ${['pending']} | ${'abc'}     | ${true}
    ${'by-file'}         | ${['pending']} | ${'def'}     | ${false}
    ${'by-file'}         | ${['pending']} | ${undefined} | ${false}
    ${'by-file'}         | ${undefined}   | ${'abc'}     | ${true}
    ${'watch-all-tests'} | ${['pending']} | ${'abc'}     | ${false}
  `(
    'can check by $type, $status, filterByContent=$filterByContent, isDup = $expected',
    ({ type, status, testFileName, expected }) => {
      const task: any = {
        data: { request: { type: 'by-file', testFileName: 'abc' } },
        status: 'pending',
      };
      const request: any = {
        type,
        testFileName,
        schedule: { dedupe: { filterByStatus: status, filterByContent: true } },
      };

      expect(isDupe(task, request)).toEqual(expected);
    }
  );
});
