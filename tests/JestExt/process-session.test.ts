jest.unmock('../../src/JestExt/process-session');
jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/JestExt/run-mode');
jest.unmock('../test-helper');

import { createProcessSession } from '../../src/JestExt/process-session';
import * as listeners from '../../src/JestExt/process-listeners';
import { JestProcessManager } from '../../src/JestProcessManagement';
import { RunMode } from '../../src/JestExt/run-mode';
import { mockJestProcessContext } from '../test-helper';

const mockProcessManager = JestProcessManager as jest.Mocked<any>;

let SEQ = 1;
describe('ProcessSession', () => {
  let context;
  let processManagerMock;

  beforeEach(() => {
    jest.resetAllMocks();
    processManagerMock = {
      scheduleJestProcess: jest.fn().mockImplementation(() => ({
        id: SEQ++,
      })),
      numberOfProcesses: jest.fn(),
      stopAll: jest.fn(),
    };
    mockProcessManager.mockReturnValue(processManagerMock);
    context = mockJestProcessContext();
  });
  describe('scheduleProcess', () => {
    const transform = (rRequest) => {
      rRequest.schedule.queue = 'blocking-2';
      return rRequest;
    };
    it('will fire event for successful schedule', () => {
      const sm = createProcessSession(context);

      processManagerMock.scheduleJestProcess.mockReturnValueOnce(undefined);
      let process = sm.scheduleProcess({ type: 'all-tests' });
      expect(process).toBeUndefined();
      expect(context.onRunEvent.fire).not.toHaveBeenCalled();

      const p = { id: 'whatever' };
      processManagerMock.scheduleJestProcess.mockReturnValueOnce(p);
      process = sm.scheduleProcess({ type: 'all-tests' });
      expect(process).toEqual(p);
      expect(context.onRunEvent.fire).toHaveBeenCalledWith({ type: 'scheduled', process });
    });
    it.each`
      type                      | inputProperty                                                | expectedSchedule                                                                           | expectedExtraProperty
      ${'all-tests'}            | ${undefined}                                                 | ${{ queue: 'blocking', dedupe: { filterByStatus: ['pending'] } }}                          | ${undefined}
      ${'all-tests'}            | ${{ transform }}                                             | ${{ queue: 'blocking-2', dedupe: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'watch-tests'}          | ${undefined}                                                 | ${{ queue: 'blocking', dedupe: { filterByStatus: ['pending'] } }}                          | ${undefined}
      ${'watch-all-tests'}      | ${undefined}                                                 | ${{ queue: 'blocking', dedupe: { filterByStatus: ['pending'] } }}                          | ${undefined}
      ${'by-file'}              | ${{ testFileName: 'abc' }}                                   | ${{ queue: 'blocking-2', dedupe: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'by-file-test'}         | ${{ testFileName: 'abc', testNamePattern: 'a test' }}        | ${{ queue: 'blocking-2', dedupe: { filterByStatus: ['pending'], filterByContent: true } }} | ${undefined}
      ${'by-file-pattern'}      | ${{ testFileNamePattern: 'abc' }}                            | ${{ queue: 'blocking-2', dedupe: { filterByStatus: ['pending'] } }}                        | ${undefined}
      ${'by-file-test-pattern'} | ${{ testFileNamePattern: 'abc', testNamePattern: 'a test' }} | ${{ queue: 'blocking-2', dedupe: { filterByStatus: ['pending'], filterByContent: true } }} | ${undefined}
      ${'list-test-files'}      | ${undefined}                                                 | ${{ queue: 'non-blocking', dedupe: { filterByStatus: ['pending'] } }}                      | ${{ type: 'not-test', args: ['--listTests', '--json', '--watchAll=false'] }}
    `(
      "can schedule '$type' request with ProcessManager",
      ({ type, inputProperty, expectedSchedule, expectedExtraProperty }) => {
        expect.hasAssertions();
        const sm = createProcessSession(context);
        expect(mockProcessManager).toHaveBeenCalledTimes(1);

        const process = sm.scheduleProcess({ type, ...(inputProperty ?? {}) });
        expect(process).not.toBeUndefined();
        expect(processManagerMock.scheduleJestProcess).toHaveBeenCalledTimes(1);
        const request = processManagerMock.scheduleJestProcess.mock.calls[0][0];
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
    it.each([['not-test']])('currently does not support "%s" request scheduling', (type) => {
      expect.hasAssertions();
      const sm = createProcessSession(context);
      expect(mockProcessManager).toHaveBeenCalledTimes(1);

      const requestType = type as any;
      sm.scheduleProcess({ type: requestType });
      expect(processManagerMock.scheduleJestProcess).not.toHaveBeenCalled();
    });
    describe.each`
      type                 | inputProperty                     | defaultListener
      ${'all-tests'}       | ${undefined}                      | ${listeners.RunTestListener}
      ${'watch-tests'}     | ${undefined}                      | ${listeners.RunTestListener}
      ${'watch-all-tests'} | ${undefined}                      | ${listeners.RunTestListener}
      ${'by-file'}         | ${{ testFileNamePattern: 'abc' }} | ${listeners.RunTestListener}
      ${'list-test-files'} | ${undefined}                      | ${listeners.ListTestFileListener}
    `('schedule $type', ({ type, inputProperty, defaultListener }) => {
      it('with default listener', () => {
        expect.hasAssertions();
        const sm = createProcessSession(context);

        sm.scheduleProcess({ type, ...(inputProperty ?? {}) });
        expect(processManagerMock.scheduleJestProcess).toHaveBeenCalledTimes(1);
        const request = processManagerMock.scheduleJestProcess.mock.calls[0][0];
        expect(request.listener).not.toBeUndefined();
        expect(defaultListener).toHaveBeenCalledTimes(1);
      });
    });
    it('can pass custom request', () => {
      const sm = createProcessSession(context);
      expect(mockProcessManager).toHaveBeenCalledTimes(1);
      const extraInfo: any = 'whatever';
      sm.scheduleProcess({ type: 'all-tests' }, extraInfo);
      expect(processManagerMock.scheduleJestProcess).toHaveBeenCalled();
      expect(processManagerMock.scheduleJestProcess).toHaveBeenCalledWith(
        expect.anything(),
        extraInfo
      );
    });
  });

  describe('start', () => {
    it.each`
      runMode                                                           | expectedRequests
      ${new RunMode('on-demand')}                                       | ${[]}
      ${new RunMode({ type: 'watch', runAllTestsOnStartup: true })}     | ${['all-tests', 'watch-tests']}
      ${new RunMode('watch')}                                           | ${['watch-tests']}
      ${new RunMode({ type: 'on-demand', runAllTestsOnStartup: true })} | ${['all-tests']}
    `(
      'will execute the onStartup processes with runMode=$runMode',
      async ({ runMode, expectedRequests }) => {
        expect.hasAssertions();
        context.settings = { runMode };
        processManagerMock.numberOfProcesses.mockReturnValue(0);
        const session = createProcessSession(context);
        await session.start();

        const requestTypes = processManagerMock.scheduleJestProcess.mock.calls.map(
          (c) => c[0].type
        );
        expect(requestTypes).toEqual(expectedRequests);
      }
    );
    it('will clear all process before starting new ones', async () => {
      expect.hasAssertions();
      context.settings = { runMode: new RunMode() };
      processManagerMock.numberOfProcesses.mockReturnValue(1);
      const session = createProcessSession(context);
      await session.start();
      expect(processManagerMock.stopAll).toHaveBeenCalledTimes(1);
      expect(processManagerMock.scheduleJestProcess).toHaveBeenCalledTimes(1);
    });
  });
  describe('stop', () => {
    it('will stop all processes in the queues', async () => {
      expect.hasAssertions();
      processManagerMock.numberOfProcesses.mockReturnValue(1);
      const session = createProcessSession(context);
      await session.stop();
      expect(processManagerMock.stopAll).toHaveBeenCalledTimes(1);
    });
  });
});
