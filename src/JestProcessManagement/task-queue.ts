import { TaskArrayFunctions, Task } from './types';

export interface TaskQueue<T> extends TaskArrayFunctions<T> {
  name: string;
  getRunnableTask: () => Task<T> | undefined;
  add: (...tasks: T[]) => void;
  /** remove specific task or the first task is undefined */
  remove: (...tasks: Task<T>[]) => void;
  /** empty the queue */
  reset: () => void;
  size: () => number;
}

/**
 * A first-in-first-out queue
 * @param name
 * @param maxWorker
 */
export const createTaskQueue = <T>(name: string, maxWorker: number): TaskQueue<T> => {
  if (maxWorker <= 0) {
    throw new Error('invalid maxWorker, should be > 0');
  }
  let queue: Task<T>[] = [];

  const toQueueTask = (data: T): Task<T> => ({ data, status: 'pending' });

  const add = (...data: T[]): void => {
    queue.push(...data.map(toQueueTask));
  };

  const getRunnableTask = () => {
    const readyTaskIdx = queue.findIndex((t) => t.status === 'pending');
    if (readyTaskIdx < 0 || readyTaskIdx >= maxWorker) {
      return;
    }
    queue[readyTaskIdx].status = 'running';
    return queue[readyTaskIdx];
  };
  const remove = (...tasks: Task<T>[]) => {
    if (tasks.length) {
      queue = queue.filter((t) => !tasks.includes(t));
    } else {
      queue = queue.slice(1);
    }
  };
  const map = <M>(f: (task: Task<T>) => M) => queue.map((t) => f(t));
  const filter = (f: (task: Task<T>) => boolean) => queue.filter((t) => f(t));
  const find = (f: (task: Task<T>) => boolean) => queue.find((t) => f(t));

  return {
    name,
    add,
    remove,
    getRunnableTask,
    reset: () => (queue.length = 0),
    size: (): number => queue.length,
    map,
    filter,
    find,
  };
};
