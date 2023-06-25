import { RunnerEvent } from 'jest-editor-support';
import { JestTestProcessType } from '../Settings';
import { JestProcess } from './JestProcess';

export type JestProcessEvent = RunnerEvent | 'processStarting';
export interface JestProcessListener {
  onEvent: (process: JestProcess, event: JestProcessEvent, ...args: unknown[]) => unknown;
}
export type JestProcessStatus = 'pending' | 'running' | 'stopping' | 'stopped';
export interface JestProcessInfo {
  readonly id: string;
  readonly request: JestProcessRequest;
}

export type TaskStatus = 'running' | 'pending';
export interface Task<T> {
  data: T;
  status: TaskStatus;
}

export type QueueType = 'blocking' | 'blocking-2' | 'non-blocking';

/**
 * predicate to match task
 * @param filterByStatus filter by task status, if omit then any status will be matched. If omit, default is matching any status
 * @param filterByContent if to match by all property of the process request. If omit, default is true
 */
export interface TaskPredicate {
  filterByStatus?: TaskStatus[];
  filterByContent?: boolean;
}
/**
 * define the eligibility for process scheduling
 * @param queue the type of the queue
 * @param dedupe a predicate to match the task in queue.
 */
export interface ScheduleStrategy {
  queue: QueueType;
  dedupe?: TaskPredicate;
}

interface JestProcessRequestCommon {
  schedule: ScheduleStrategy;
  listener: JestProcessListener;
}

export type JestProcessRequestSimple =
  | {
      type: Extract<JestTestProcessType, 'watch-tests' | 'watch-all-tests'>;
    }
  | {
      type: Extract<JestTestProcessType, 'all-tests'>;
      updateSnapshot?: boolean;
    }
  | {
      type: Extract<JestTestProcessType, 'by-file'>;
      testFileName: string;
      updateSnapshot?: boolean;
      notTestFile?: boolean;
    }
  | {
      type: Extract<JestTestProcessType, 'by-file-test'>;
      testFileName: string;
      testNamePattern: string;
      updateSnapshot?: boolean;
    }
  | {
      type: Extract<JestTestProcessType, 'by-file-pattern'>;
      testFileNamePattern: string;
      updateSnapshot?: boolean;
    }
  | {
      type: Extract<JestTestProcessType, 'by-file-test-pattern'>;
      testFileNamePattern: string;
      testNamePattern: string;
      updateSnapshot?: boolean;
    }
  | {
      type: Extract<JestTestProcessType, 'not-test'>;
      args: string[];
    };

export type JestProcessRequestTransform = (request: JestProcessRequest) => JestProcessRequest;

export type JestProcessRequestBase = JestProcessRequestSimple & {
  transform?: JestProcessRequestTransform;
};
export type JestProcessRequest = JestProcessRequestBase & JestProcessRequestCommon;

export interface TaskArrayFunctions<T> {
  map: <M>(f: (task: Task<T>) => M) => M[];
  filter: (f: (task: Task<T>) => boolean) => Task<T>[];
  find: (f: (task: Task<T>) => boolean) => Task<T> | undefined;
}
