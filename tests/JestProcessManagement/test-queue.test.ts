jest.unmock('../../src/JestProcessManagement/task-queue');

import { TaskStatus } from '../../src/JestProcessManagement';
import { createTaskQueue } from '../../src/JestProcessManagement/task-queue';

describe('task-queue', () => {
  const mockData = (status: TaskStatus) => ({
    status,
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('maxWorker > 0', () => {
    expect(() => createTaskQueue('queue-1', 0)).toThrow();
  });
  describe('getRunnableTask', () => {
    it.each`
      statusList                           | maxWorker | lastRunnableTaskIdx
      ${[]}                                | ${1}      | ${undefined}
      ${[]}                                | ${2}      | ${undefined}
      ${['pending']}                       | ${1}      | ${0}
      ${['pending', 'pending', 'pending']} | ${1}      | ${0}
      ${['running', 'pending', 'pending']} | ${1}      | ${undefined}
      ${['running', 'pending', 'pending']} | ${2}      | ${1}
      ${['running', 'running', 'pending']} | ${2}      | ${undefined}
    `(
      'task status: $statusList with maxWorker=$maxWorker',
      ({ statusList, maxWorker, lastRunnableTaskIdx }) => {
        expect.hasAssertions();
        const data = statusList.map((s) => mockData(s));
        const queue = createTaskQueue('queue-1', maxWorker);
        queue.add(...data);
        // take care of running task
        data.forEach((d) => {
          if (d.status === 'running') {
            expect(queue.getRunnableTask()).not.toBeUndefined();
          }
        });
        if (lastRunnableTaskIdx != null) {
          expect(queue.getRunnableTask().data).toEqual(data[lastRunnableTaskIdx]);
        } else {
          expect(queue.getRunnableTask()).toBeUndefined();
        }
      }
    );
  });
  describe('can add/remove tasks', () => {
    const statusList: TaskStatus[] = ['running', 'pending', 'pending'];
    const data = statusList.map((s) => mockData(s));

    it('can add tasks', () => {
      const queue = createTaskQueue('queue-1', 1);
      queue.add(...data);
      expect(queue.map((t) => t.data)).toEqual(data);
      expect(queue.size()).toEqual(data.length);
    });
    it('can remove tasks', () => {
      const queue = createTaskQueue('queue-1', 1);
      queue.add(...data);
      const tasks = queue.map((t) => t);
      queue.remove(tasks[2], tasks[1]);
      expect(queue.map((t) => t.data)).toEqual([data[0]]);
    });
    it('if no specific task passed in, remove the head of the queue', () => {
      const queue = createTaskQueue('queue-1', 1);
      queue.add(...data);
      queue.remove();
      expect(queue.map((t) => t.data)).toEqual([data[1], data[2]]);
    });
  });
  it('can perform map()', () => {
    const statusList: TaskStatus[] = ['running', 'pending', 'pending'];
    const data = statusList.map((s) => mockData(s));
    const queue = createTaskQueue('queue-1', 1);
    queue.add(...data);
    expect(queue.map((t) => t.data)).toEqual(data);
  });
  it('can perform filter()', () => {
    const statusList: TaskStatus[] = ['running', 'running', 'pending'];
    const data = statusList.map((s) => mockData(s));
    const queue = createTaskQueue('queue-1', 2);
    queue.add(...data);
    queue.getRunnableTask();
    queue.getRunnableTask();

    expect(queue.filter((t) => t.status === 'running').map((t) => t.data)).toEqual([
      data[0],
      data[1],
    ]);
    expect(queue.filter((t) => t.status === 'pending').map((t) => t.data)).toEqual([data[2]]);
  });
  it('can perform find()', () => {
    const statusList: TaskStatus[] = ['running', 'running', 'running'];
    const data = statusList.map((s) => mockData(s));
    const queue = createTaskQueue('queue-1', 3);
    queue.add(...data);
    queue.getRunnableTask();
    queue.getRunnableTask();
    queue.getRunnableTask();

    expect(queue.find((t) => t.status === 'running')?.data).toEqual(data[1]);
    expect(queue.find((t) => t.status === 'pending')?.data).toEqual(undefined);
  });
});
