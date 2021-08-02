jest.unmock('../../src/JestExt/process-session');
jest.unmock('../../src/JestExt/helper');
jest.unmock('../test-helper');

import { createProcessSession } from '../../src/JestExt/process-session';
import * as listeners from '../../src/JestExt/process-listeners';
import { JestProcessManager } from '../../src/JestProcessManagement';
import { AutoRun } from '../../src/JestExt/helper';
import { mockJestProcessContext } from '../test-helper';

const mockProcessManager = JestProcessManager as jest.Mocked<any>;

let SEQ = 1;
describe('ProcessSession', () => {
  let context;
  const mockScheduleJestProcess = jest.fn();
  const mockNumberOfProcesses = jest.fn();
  const mockStopAll = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockScheduleJestProcess.mockImplementation(() => SEQ++);
    mockProcessManager.mockReturnValue({
      scheduleJestProcess: mockScheduleJestProcess,
      numberOfProcesses: mockNumberOfProcesses,
      stopAll: mockStopAll,
    });
    context = mockJestProcessContext();
  });
  describe('scheduleProcess', () => {
    it.each`
      type                      | inputProperty                                                | expectedSchedule                                                                        | expectedExtraProperty
      ${'all-tests'}            | ${undefined}                                                 | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'watch-tests'}          | ${undefined}                                                 | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'watch-all-tests'}      | ${undefined}                                                 | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'by-file'}              | ${{ testFileName: 'abc' }}                                   | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'by-file-test'}         | ${{ testFileName: 'abc', testNamePattern: 'a test' }}        | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'], filterByContent: true } }} | ${undefined}
      ${'by-file-pattern'}      | ${{ testFileNamePattern: 'abc' }}                            | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'by-file-test-pattern'} | ${{ testFileNamePattern: 'abc', testNamePattern: 'a test' }} | ${{ queue: 'blocking', dedup: { filterByStatus: ['pending'], filterByContent: true } }} | ${undefined}
      ${'list-test-files'}      | ${undefined}                                                 | ${{ queue: 'non-blocking', dedup: { filterByStatus: ['pending'] } }}                    | ${{ type: 'not-test', args: ['--listTests', '--json', '--watchAll=false'] }}
    `(
      'can schedule "$type" request with ProcessManager',
      ({ type, inputProperty, expectedSchedule, expectedExtraProperty }) => {
        expect.hasAssertions();
        const sm = createProcessSession(context);
        expect(mockProcessManager).toHaveBeenCalledTimes(1);

        const pid = sm.scheduleProcess({ type, ...(inputProperty ?? {}) });
        expect(pid).not.toBeUndefined();
        expect(mockScheduleJestProcess).toHaveBeenCalledTimes(1);
        const request = mockScheduleJestProcess.mock.calls[0][0];
        expect(request.schedule).toEqual(expectedSchedule);
        if (inputProperty) {
          expect(request).toMatchObject(inputProperty);
        }
        if (expectedExtraProperty) {
          expect(request).toMatchObject(expectedExtraProperty);
        } else {
          expect(request.type).toEqual(type);
        }
      }
    );
    it.each`
      baseRequest                                                                                | snapshotRequest
      ${{ type: 'watch-tests' }}                                                                 | ${{ type: 'all-tests', updateSnapshot: true }}
      ${{ type: 'watch-all-tests' }}                                                             | ${{ type: 'all-tests', updateSnapshot: true }}
      ${{ type: 'all-tests' }}                                                                   | ${{ type: 'all-tests', updateSnapshot: true }}
      ${{ type: 'by-file', testFileName: 'abc' }}                                                | ${{ type: 'by-file', testFileName: 'abc', updateSnapshot: true }}
      ${{ type: 'by-file', testFileName: 'abc', updateSnapshot: true }}                          | ${undefined}
      ${{ type: 'by-file-pattern', testFileNamePattern: 'abc' }}                                 | ${{ type: 'by-file-pattern', testFileNamePattern: 'abc', updateSnapshot: true }}
      ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: 'a test' }}                | ${{ type: 'by-file-test', testFileName: 'abc', testNamePattern: 'a test', updateSnapshot: true }}
      ${{ type: 'by-file-test-pattern', testFileNamePattern: 'abc', testNamePattern: 'a test' }} | ${{ type: 'by-file-test-pattern', testFileNamePattern: 'abc', testNamePattern: 'a test', updateSnapshot: true }}
    `(
      'can schedule update-snapshot request: $baseRequest',
      async ({ baseRequest, snapshotRequest }) => {
        expect.hasAssertions();
        const sm = createProcessSession(context);
        expect(mockProcessManager).toHaveBeenCalledTimes(1);

        sm.scheduleProcess({ type: 'update-snapshot', baseRequest });

        if (snapshotRequest) {
          expect(mockScheduleJestProcess).toHaveBeenCalledWith(
            expect.objectContaining(snapshotRequest)
          );
        } else {
          expect(mockScheduleJestProcess).not.toHaveBeenCalled();
        }
      }
    );

    it.each([['not-test']])('currently does not support "%s" request scheduling', (type) => {
      expect.hasAssertions();
      const sm = createProcessSession(context);
      expect(mockProcessManager).toHaveBeenCalledTimes(1);

      const requestType = type as any;
      sm.scheduleProcess({ type: requestType });
      expect(mockScheduleJestProcess).not.toHaveBeenCalled();
    });
    describe.each`
      type                 | inputProperty                             | defaultListener
      ${'all-tests'}       | ${undefined}                              | ${listeners.RunTestListener}
      ${'watch-tests'}     | ${undefined}                              | ${listeners.RunTestListener}
      ${'watch-all-tests'} | ${undefined}                              | ${listeners.RunTestListener}
      ${'by-file'}         | ${{ testFileNamePattern: 'abc' }}         | ${listeners.RunTestListener}
      ${'list-test-files'} | ${undefined}                              | ${listeners.ListTestFileListener}
      ${'update-snapshot'} | ${{ baseRequest: { type: 'all-tests' } }} | ${listeners.RunTestListener}
    `('schedule $type', ({ type, inputProperty, defaultListener }) => {
      it('with default listener', () => {
        expect.hasAssertions();
        const sm = createProcessSession(context);

        sm.scheduleProcess({ type, ...(inputProperty ?? {}) });
        expect(mockScheduleJestProcess).toHaveBeenCalledTimes(1);
        const request = mockScheduleJestProcess.mock.calls[0][0];
        expect(request.listener).not.toBeUndefined();
        expect(defaultListener).toHaveBeenCalledTimes(1);
      });
    });
    it('can override context', () => {
      const sm = createProcessSession(context);
      expect(mockProcessManager).toHaveBeenCalledTimes(1);
      const customOutput: any = jest.fn();
      sm.scheduleProcess({ type: 'all-tests', context: { output: customOutput } });
      expect(mockScheduleJestProcess).toHaveBeenCalled();
      expect(listeners.RunTestListener).toHaveBeenCalledWith(
        expect.objectContaining({ context: expect.objectContaining({ output: customOutput }) })
      );
    });
  });

  describe('start', () => {
    it.each`
      autoRun                                       | expectedRequests
      ${'off'}                                      | ${[]}
      ${{ watch: true, onStartup: ['all-tests'] }}  | ${['all-tests', 'watch-tests']}
      ${{ watch: true }}                            | ${['watch-tests']}
      ${{ watch: false, onStartup: ['all-tests'] }} | ${['all-tests']}
    `(
      'will execute the onStartup processes with autoRun=$autoRun',
      async ({ autoRun, expectedRequests }) => {
        expect.hasAssertions();
        const settings: any = { autoRun };
        context.autoRun = AutoRun(settings);
        mockNumberOfProcesses.mockReturnValue(0);
        const session = createProcessSession(context);
        await session.start();

        const requestTypes = mockScheduleJestProcess.mock.calls.map((c) => c[0].type);
        expect(requestTypes).toEqual(expectedRequests);
      }
    );
    it('will clear all process before starting new ones', async () => {
      expect.hasAssertions();
      const settings: any = { autoRun: { watch: true } };
      context.autoRun = AutoRun(settings);
      mockNumberOfProcesses.mockReturnValue(1);
      const session = createProcessSession(context);
      await session.start();
      expect(mockStopAll).toBeCalledTimes(1);
      expect(mockScheduleJestProcess).toBeCalledTimes(1);
    });
  });
  describe('stop', () => {
    it('will stop all processes in the queues', async () => {
      expect.hasAssertions();
      context.pluginSettings = { autoEnable: true };
      mockNumberOfProcesses.mockReturnValue(1);
      const session = createProcessSession(context);
      await session.stop();
      expect(mockStopAll).toBeCalledTimes(1);
    });
  });
});
