jest.unmock('../../src/JestProcessManagement/JestProcessManager');
jest.unmock('../../src/JestProcessManagement/task-queue');
jest.unmock('../../src/JestProcessManagement/helper');
jest.unmock('../test-helper');

import { JestProcessManager } from '../../src/JestProcessManagement/JestProcessManager';
import { JestProcess } from '../../src/JestProcessManagement/JestProcess';
import { mockJestProcessContext, mockProcessRequest } from '../test-helper';
import * as taskQueue from '../../src/JestProcessManagement/task-queue';
import { ScheduleStrategy } from '../../src/JestProcessManagement/types';

interface ProcessState {
  inQ?: boolean;
  started?: boolean;
  qSize?: number;
}
const getState = (pm: JestProcessManager, process: JestProcess): ProcessState => {
  const state: ProcessState = {};
  const task = pm.find((t) => t.data === process);

  state['inQ'] = (task && task.data === process) || false;
  if (task) {
    state['started'] = task.status === 'running';
  }
  state['qSize'] = pm.numberOfProcesses(process.request.schedule.queue);
  return state;
};

let SEQ = 1;
describe('JestProcessManager', () => {
  let extContext;

  const jestProcessMock = JestProcess as any as jest.Mock<any>;

  const mockJestProcess = (request?: any): any => {
    let resolve;
    let reject;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    const mockProcess = {
      id: `${request.type}-${SEQ++}`,
      request,
      start: jest.fn().mockReturnValueOnce(promise),
      stop: jest.fn().mockImplementation(() => resolve('requested to stop')),
      resolve,
      reject,
    };
    jestProcessMock.mockReturnValueOnce(mockProcess);
    return mockProcess;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    extContext = mockJestProcessContext();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when creating', () => {
    it('accepts Project Workspace as the argument', () => {
      // tslint:disable-next-line no-shadowed-variable
      const jestProcessManager = new JestProcessManager(extContext);
      expect(jestProcessManager).not.toBe(null);
    });

    it('created 2 queues for blocking and non-blocking processes', () => {
      const mockCreateTaskQueue = jest.spyOn(taskQueue, 'createTaskQueue');
      const jestProcessManager = new JestProcessManager(extContext);
      expect(jestProcessManager).not.toBe(null);
      expect(mockCreateTaskQueue).toBeCalledTimes(2);
      const maxWorkers = mockCreateTaskQueue.mock.calls.map((c) => c[1]);
      // blocking queue has 1 worker
      expect(maxWorkers.includes(1)).toBeTruthy();
      // non-blocking queue has more than 1 worker
      expect(maxWorkers.find((n) => n > 1)).not.toBeUndefined();
    });
  });
  describe('start a jest process', () => {
    describe('start the jest process by scheduling a request', () => {
      let mockProcess;
      let pm;
      let request;
      beforeEach(() => {
        request = mockProcessRequest('all-tests', { schedule: { queue: 'blocking' } });
        mockProcess = mockJestProcess(request);
        pm = new JestProcessManager(extContext);
      });

      it('can run process after scheduling', () => {
        expect.hasAssertions();

        const process = pm.scheduleJestProcess(request);
        expect(process.id).toEqual(expect.stringContaining(request.type));
        expect(jestProcessMock).toBeCalledTimes(1);
        expect(mockProcess.start).toBeCalledTimes(1);

        expect(getState(pm, mockProcess)).toEqual({ inQ: true, started: true, qSize: 1 });
      });
      it('the queue will be cleared when the process exit upon completion', async () => {
        expect.hasAssertions();

        pm.scheduleJestProcess(request);
        expect(jestProcessMock).toBeCalledTimes(1);
        expect(getState(pm, mockProcess)).toEqual({ inQ: true, started: true, qSize: 1 });

        await mockProcess.resolve();
        expect(getState(pm, mockProcess)).toEqual({ inQ: false, qSize: 0 });
      });
      it('the queue will be cleared when the process exit upon error', async () => {
        expect.hasAssertions();
        pm.scheduleJestProcess(request);
        expect(jestProcessMock).toBeCalledTimes(1);

        expect(getState(pm, mockProcess)).toEqual({ inQ: true, started: true, qSize: 1 });
        await mockProcess.reject();
        expect(getState(pm, mockProcess)).toEqual({ inQ: false, qSize: 0 });
      });
    });
    describe('can run jest process sequentially', () => {
      const schedule: ScheduleStrategy = { queue: 'blocking' };
      const requests = [
        mockProcessRequest('all-tests', { schedule }),
        mockProcessRequest('watch-tests', { schedule }),
        mockProcessRequest('watch-all-tests', { schedule }),
      ];
      it('works for scheduling all requests up front', async () => {
        expect.hasAssertions();

        const processes: any[] = requests.map((r) => mockJestProcess(r));
        const pm = new JestProcessManager(extContext);

        // submit all 3 request
        const results = requests.map((r) => pm.scheduleJestProcess(r));
        expect(results.every((r) => r)).toBeTruthy();
        expect(jestProcessMock).toBeCalledTimes(3);

        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 3 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: false, qSize: 3 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: false, qSize: 3 });

        // when process-1 completes, process 2 should then start
        await processes[0].resolve();
        expect(getState(pm, processes[0])).toEqual({ inQ: false, qSize: 2 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 2 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: false, qSize: 2 });

        // when process-2 rejects, process 3 should then start
        await processes[1].reject('forced to quit');
        expect(getState(pm, processes[1])).toEqual({ inQ: false, qSize: 1 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 1 });

        // when process-3 completes, the queue should be empty
        await processes[2].resolve();
        expect(getState(pm, processes[2])).toEqual({ inQ: false, qSize: 0 });
      });
      it('works for scheduling incrementally', async () => {
        expect.hasAssertions();

        const processes: any[] = requests.map((r) => mockJestProcess(r));
        const pm = new JestProcessManager(extContext);

        // submit first request
        let scheduled = pm.scheduleJestProcess(requests[0]);
        expect(scheduled.id).toContain(requests[0].type);
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule 2nd request while first one is still running
        scheduled = pm.scheduleJestProcess(requests[1]);
        expect(scheduled.id).toContain(requests[1].type);
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 2 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: false, qSize: 2 });

        // when first process complete, 2nd one should automatically starts
        await processes[0].resolve();
        expect(getState(pm, processes[0])).toEqual({ inQ: false, qSize: 1 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule the 3rd request
        scheduled = pm.scheduleJestProcess(requests[2]);
        expect(scheduled.id).toContain(requests[2].type);
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 2 });

        //   getState(pm, processes[1], { 'in-queue': true, started: true, 'queue-length': 1 })
        // ).toBe('pass');
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: false, qSize: 2 });
      });
    });
    describe('can run jest process in parallel', () => {
      const schedule: ScheduleStrategy = { queue: 'non-blocking' };
      const requests = [
        mockProcessRequest('by-file', { testFileName: 'file-1', schedule }),
        mockProcessRequest('not-test', { args: ['--listFiles'], schedule }),
        mockProcessRequest('by-file', { testFileName: 'file-2', schedule }),
        mockProcessRequest('not-test', { args: ['--listFiles'], schedule }),
      ];
      it('works for scheduling all requests up front', async () => {
        expect.hasAssertions();

        const processes: any[] = requests.map((r) => mockJestProcess(r));
        const pm = new JestProcessManager(extContext);

        const results = requests.map((r) => pm.scheduleJestProcess(r));
        expect(results.every((r) => r)).toBeTruthy();
        expect(jestProcessMock).toBeCalledTimes(requests.length);

        // maxWorker is 3, so we should at most have 3 processes running at any given time
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[3])).toEqual({ inQ: true, started: false, qSize: 4 });

        // when process[1] reject, process 3 can run now
        await processes[1].reject('whatever');
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 3 });
        expect(getState(pm, processes[1])).toEqual({ inQ: false, qSize: 3 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 3 });
        expect(getState(pm, processes[3])).toEqual({ inQ: true, started: true, qSize: 3 });

        // when process[0] and process[3] resolve, only process[2] remained
        await processes[0].resolve();
        await processes[3].resolve();
        expect(getState(pm, processes[0])).toEqual({ inQ: false, qSize: 1 });
        expect(getState(pm, processes[1])).toEqual({ inQ: false, qSize: 1 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 1 });
        expect(getState(pm, processes[3])).toEqual({ inQ: false, qSize: 1 });
      });
      it('works for scheduling incrementally', async () => {
        expect.hasAssertions();

        const processes: any[] = requests.map((r) => mockJestProcess(r));
        const pm = new JestProcessManager(extContext);

        // submit first request
        let scheduled = pm.scheduleJestProcess(requests[0]);
        expect(scheduled.id).toContain(requests[0].type);
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule 2nd request while first one is still running
        scheduled = pm.scheduleJestProcess(requests[1]);
        expect(scheduled.id).toContain(requests[1].type);
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 2 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 2 });

        // schedule 3rd and 4th requests
        scheduled = pm.scheduleJestProcess(requests[2]);
        expect(scheduled.id).toContain(requests[2].type);
        scheduled = pm.scheduleJestProcess(requests[3]);
        expect(scheduled.id).toContain(requests[3].type);
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[1])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 4 });
        expect(getState(pm, processes[3])).toEqual({ inQ: true, started: false, qSize: 4 });

        // when any running one complete, the last process get to run
        await processes[1].resolve();
        expect(getState(pm, processes[0])).toEqual({ inQ: true, started: true, qSize: 3 });
        expect(getState(pm, processes[1])).toEqual({ inQ: false, qSize: 3 });
        expect(getState(pm, processes[2])).toEqual({ inQ: true, started: true, qSize: 3 });
        expect(getState(pm, processes[3])).toEqual({ inQ: true, started: true, qSize: 3 });
      });
    });
    describe('dedup', () => {
      it('will not schedule if process is already running', () => {
        expect.hasAssertions();
        const schedule: ScheduleStrategy = {
          queue: 'blocking',
          dedup: { filterByStatus: ['running'] },
        };
        const request = mockProcessRequest('watch-tests', { schedule });
        const process = mockJestProcess(request);

        const pm = new JestProcessManager(extContext);

        // schedule the first process
        let scheduled = pm.scheduleJestProcess(request);
        // the process is running
        expect(scheduled).toEqual(process);
        expect(getState(pm, process)).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule the 2nd process which should failed because the process is already running
        const process2 = mockJestProcess(request);
        scheduled = pm.scheduleJestProcess(request);
        expect(scheduled).toBeUndefined();
        expect(getState(pm, process2)).toEqual({ inQ: false, qSize: 1 });
      });
      it('will not schedule if there is pending process', () => {
        expect.hasAssertions();
        const schedule: ScheduleStrategy = {
          queue: 'blocking',
          dedup: { filterByStatus: ['pending'] },
        };
        const request = mockProcessRequest('watch-tests', { schedule });
        const process = mockJestProcess(request);

        const pm = new JestProcessManager(extContext);

        // schedule the first process
        let scheduled = pm.scheduleJestProcess(request);
        // the process is running
        expect(getState(pm, process)).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule the 2nd process which should succeed because there is no pending process
        const process2 = mockJestProcess(request);
        scheduled = pm.scheduleJestProcess(request);
        expect(scheduled.id).toContain(request.type);
        expect(getState(pm, process2)).toEqual({ inQ: true, started: false, qSize: 2 });

        // but the 3rd one would fail because the 2nd process is pending and thus can not add any more
        const process3 = mockJestProcess(request);
        scheduled = pm.scheduleJestProcess(request);
        expect(scheduled).toBeUndefined();
        expect(getState(pm, process)).toEqual({ inQ: true, started: true, qSize: 2 });
        expect(getState(pm, process2)).toEqual({ inQ: true, started: false, qSize: 2 });
        expect(getState(pm, process3)).toEqual({ inQ: false, qSize: 2 });
      });
      it('will not schedule if there is pending process with the same content', async () => {
        expect.hasAssertions();
        const schedule: ScheduleStrategy = {
          queue: 'blocking',
          dedup: { filterByStatus: ['pending'], filterByContent: true },
        };
        const request1 = mockProcessRequest('by-file', {
          testFileName: '/file/1',
          schedule,
        });
        const request2 = mockProcessRequest('by-file', {
          testFileName: '/file/2',
          schedule,
        });

        const pm = new JestProcessManager(extContext);

        // schedule the first process: no problem
        const process1 = mockJestProcess(request1);
        let scheduled = await pm.scheduleJestProcess(request1);
        expect(scheduled.id).toContain(request1.type);
        expect(getState(pm, process1)).toEqual({ inQ: true, started: true, qSize: 1 });

        // schedule the 2nd process with request1, fine because process1 is running, not pending
        const process2 = mockJestProcess(request1);
        scheduled = await pm.scheduleJestProcess(request1);
        expect(scheduled.id).toContain(request1.type);
        expect(getState(pm, process2)).toEqual({ inQ: true, started: false, qSize: 2 });

        // schedule the 3rd one with different request2, should be fine, no dup
        const process3 = mockJestProcess(request2);
        scheduled = await pm.scheduleJestProcess(request2);
        expect(scheduled.id).toContain(request2.type);
        expect(getState(pm, process3)).toEqual({ inQ: true, started: false, qSize: 3 });

        // schedule the 4th one with request1, should be rejected as there is already one request pending
        const process4 = mockJestProcess(request1);
        scheduled = await pm.scheduleJestProcess(request1);
        expect(scheduled).toBeUndefined();
        expect(getState(pm, process4)).toEqual({ inQ: false, qSize: 3 });
      });
    });
  });

  describe('stop processes', () => {
    const blockingSchedule: ScheduleStrategy = { queue: 'blocking' };
    const nonBlockingSchedule: ScheduleStrategy = { queue: 'non-blocking' };
    const blockingRequests = [
      mockProcessRequest('all-tests', { schedule: blockingSchedule }),
      mockProcessRequest('watch-tests', { schedule: blockingSchedule }),
    ];
    const nonBlockingRequests = [mockProcessRequest('not-test', { schedule: nonBlockingSchedule })];
    let pm;
    let blockingP;
    let nonBlockingP;
    beforeEach(() => {
      pm = new JestProcessManager(extContext);
      blockingP = blockingRequests.map((r) => mockJestProcess(r));
      nonBlockingP = nonBlockingRequests.map((r) => mockJestProcess(r));
      blockingRequests.forEach((r) => pm.scheduleJestProcess(r));
      nonBlockingRequests.forEach((r) => pm.scheduleJestProcess(r));
    });
    it.each([['blocking'], ['non-blocking'], [undefined]])(
      'can stop all processes from queue: %s',
      async (queueType) => {
        // before stopping
        expect(getState(pm, blockingP[0])).toEqual({ inQ: true, started: true, qSize: 2 });
        expect(getState(pm, blockingP[1])).toEqual({ inQ: true, started: false, qSize: 2 });
        expect(getState(pm, nonBlockingP[0])).toEqual({ inQ: true, started: true, qSize: 1 });

        await pm.stopAll(queueType);

        //after stopping
        if (queueType === 'blocking') {
          expect(getState(pm, blockingP[0])).toEqual({ inQ: false, qSize: 0 });
          expect(getState(pm, blockingP[1])).toEqual({ inQ: false, qSize: 0 });
          expect(getState(pm, nonBlockingP[0])).toEqual({ inQ: true, started: true, qSize: 1 });
        } else if (queueType === 'non-blocking') {
          expect(getState(pm, blockingP[0])).toEqual({ inQ: true, started: true, qSize: 2 });
          expect(getState(pm, blockingP[1])).toEqual({ inQ: true, started: false, qSize: 2 });
          expect(getState(pm, nonBlockingP[0])).toEqual({ inQ: false, qSize: 0 });
        } else {
          expect(getState(pm, blockingP[0])).toEqual({ inQ: false, qSize: 0 });
          expect(getState(pm, blockingP[1])).toEqual({ inQ: false, qSize: 0 });
          expect(getState(pm, nonBlockingP[0])).toEqual({ inQ: false, qSize: 0 });
        }
      }
    );
  });
  describe('supports TaskArrayFunctions', () => {
    const blockingSchedule: ScheduleStrategy = { queue: 'blocking' };
    const nonBlockingSchedule: ScheduleStrategy = { queue: 'non-blocking' };
    const blockingRequests = [
      mockProcessRequest('all-tests', { schedule: blockingSchedule }),
      mockProcessRequest('watch-tests', { schedule: blockingSchedule }),
      mockProcessRequest('all-tests', { schedule: blockingSchedule }),
    ];
    const nonBlockingRequests = [mockProcessRequest('not-test', { schedule: nonBlockingSchedule })];
    let pm;
    let blockingP;
    let nonBlockingP;
    beforeEach(() => {
      pm = new JestProcessManager(extContext);
      blockingP = blockingRequests.map((r) => {
        const p = mockJestProcess(r);
        pm.scheduleJestProcess(r);
        return p;
      });
      nonBlockingP = nonBlockingRequests.map((r) => {
        const p = mockJestProcess(r);
        pm.scheduleJestProcess(r);
        return p;
      });
    });
    it('can map tasks', async () => {
      let processes = pm.map((t) => t.data, 'blocking');
      expect(processes).toHaveLength(3);
      expect(processes).toEqual(blockingP);
      processes = pm.map((t) => t.data);
      expect(processes).toHaveLength(4);
    });
    it('can filter tasks', async () => {
      let processes = pm.filter((t) => t.status === 'running', 'non-blocking');
      expect(processes).toHaveLength(1);
      expect(processes[0].data).toEqual(nonBlockingP[0]);
      processes = pm.filter((t) => t.status === 'running');
      expect(processes).toHaveLength(2);
    });
    it('can find task', async () => {
      let found = pm.find((t) => t.data.request.type === 'not-test', 'blocking');
      expect(found).toBeUndefined();

      found = pm.find((t) => t.data.request.type === 'not-test', 'non-blocking');
      expect(found.data).toEqual(nonBlockingP[0]);

      found = pm.find((t) => t.data.request.type === 'not-test');
      expect(found.data).toEqual(nonBlockingP[0]);
    });
  });
});
