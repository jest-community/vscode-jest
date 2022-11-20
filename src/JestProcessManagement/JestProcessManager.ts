import { JestProcess } from './JestProcess';
import { TaskArrayFunctions, JestProcessRequest, QueueType, Task, JestProcessInfo } from './types';
import { Logging } from '../logging';
import { createTaskQueue, TaskQueue } from './task-queue';
import { isDup, requestString } from './helper';
import { JestExtContext } from '../JestExt';

export class JestProcessManager implements TaskArrayFunctions<JestProcess> {
  private extContext: JestExtContext;
  private queues: Map<QueueType, TaskQueue<JestProcess>>;
  private logging: Logging;

  constructor(extContext: JestExtContext) {
    this.extContext = extContext;
    this.logging = extContext.loggingFactory.create('JestProcessManager');
    this.queues = new Map([
      ['blocking', createTaskQueue('blocking-queue', 1)],
      ['blocking-2', createTaskQueue('blocking-queue-2', 1)],
      ['non-blocking', createTaskQueue('non-blocking-queue', 3)],
    ]);
  }

  private getQueue(type: QueueType): TaskQueue<JestProcess> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.queues.get(type)!;
  }

  private foundDup(request: JestProcessRequest): boolean {
    if (!request.schedule.dedup) {
      return false;
    }
    const queue = this.getQueue(request.schedule.queue);
    const dupTasks = queue.filter((p) => isDup(p, request));
    if (dupTasks.length > 0) {
      this.logging(
        'debug',
        `found ${dupTasks.length} duplicate processes, will not schedule request:`,
        request
      );
      return true;
    }
    return false;
  }
  /**
   * schedule a jest process and handle duplication process if dedup is requested.
   * @param request
   * @returns a jest process id if successfully scheduled, otherwise undefined
   */
  public scheduleJestProcess(request: JestProcessRequest): JestProcessInfo | undefined {
    if (this.foundDup(request)) {
      this.logging(
        'debug',
        `duplicate request found, process is not scheduled: ${requestString(request)}`
      );
      return;
    }

    const queue = this.getQueue(request.schedule.queue);
    const process = new JestProcess(this.extContext, request);
    queue.add(process);
    this.run(queue);
    return process;
  }

  // run the first process in the queue
  private async run(queue: TaskQueue<JestProcess>): Promise<void> {
    const task = queue.getRunnableTask();
    if (!task) {
      return;
    }
    const process = task.data;

    try {
      await process.start();
    } catch (e) {
      this.logging('error', `${queue.name}: process failed:`, process, e);
    } finally {
      queue.remove(task);
    }
    return this.run(queue);
  }

  /** stop and remove all process matching the queue type, if no queue type specified, stop all queues */
  public async stopAll(queueType?: QueueType): Promise<void> {
    let promises: Promise<void>[];
    if (!queueType) {
      promises = Array.from(this.queues.keys()).map((q) => this.stopAll(q));
    } else {
      const queue = this.getQueue(queueType);
      promises = queue.map((t) => t.data.stop());
      queue.reset();
    }
    await Promise.allSettled(promises);
    return;
  }

  public numberOfProcesses(queueType?: QueueType): number {
    if (queueType) {
      return this.getQueue(queueType).size();
    }
    return Array.from(this.queues.values()).reduce((pCount, q) => {
      pCount += q.size();
      return pCount;
    }, 0);
  }

  // task array functions
  private getQueues(queueType?: QueueType): TaskQueue<JestProcess>[] {
    return queueType ? [this.getQueue(queueType)] : Array.from(this.queues.values());
  }
  public map<M>(f: (task: Task<JestProcess>) => M, queueType?: QueueType): M[] {
    const queues = this.getQueues(queueType);
    return queues.reduce((list, q) => {
      list.push(...q.map(f));
      return list;
    }, [] as M[]);
  }
  public filter(
    f: (task: Task<JestProcess>) => boolean,
    queueType?: QueueType
  ): Task<JestProcess>[] {
    const queues = this.getQueues(queueType);
    return queues.reduce((list, q) => {
      list.push(...q.filter(f));
      return list;
    }, [] as Task<JestProcess>[]);
  }
  public find(
    f: (task: Task<JestProcess>) => boolean,
    queueType?: QueueType
  ): Task<JestProcess> | undefined {
    const queues = this.getQueues(queueType);
    for (const q of queues) {
      const t = q.find(f);
      if (t) {
        return t;
      }
    }
  }
}
