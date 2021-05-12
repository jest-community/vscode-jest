import {
  JestProcessManager,
  JestProcessRequest,
  JestProcessRequestBase,
  ScheduleStrategy,
  requestString,
  QueueType,
} from '../JestProcessManagement';
import { JestTestProcessType } from '../Settings';
import { RunTestListener, ListTestFileListener } from './process-listeners';
import { JestExtProcessContext } from './types';

type InternalProcessType = 'list-test-files' | 'update-snapshot';
export type OnListTestFilesResult = (fileNames?: string[], error?: string | Error) => void;
export type InternalRequestBase =
  | {
      type: Extract<InternalProcessType, 'list-test-files'>;
      onResult: OnListTestFilesResult;
    }
  | {
      type: Extract<InternalProcessType, 'update-snapshot'>;
      baseRequest: JestProcessRequest;
    };

type JestExtRequestType = JestProcessRequestBase | InternalRequestBase;

const ProcessScheduleStrategy: Record<JestTestProcessType, ScheduleStrategy> = {
  // abort if there is already an pending request
  'all-tests': { queue: 'blocking', dedup: { filterByStatus: ['pending'] } },
  'watch-tests': { queue: 'blocking', dedup: { filterByStatus: ['pending'] } },
  'watch-all-tests': {
    queue: 'blocking',
    dedup: { filterByStatus: ['pending'] },
  },

  // abort if there is already identical pending request
  'by-file': {
    queue: 'blocking',
    dedup: { filterByStatus: ['pending'] },
  },
  'by-file-test': {
    queue: 'blocking',
    dedup: { filterByStatus: ['pending'], filterByContent: true },
  },
  'not-test': {
    queue: 'non-blocking',
    dedup: { filterByStatus: ['pending'] },
  },
};

export interface ProcessSession {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  scheduleProcess: (request: JestExtRequestType) => boolean;
}
export interface ListenerSession {
  context: JestExtProcessContext;
  scheduleProcess: (request: JestExtRequestType) => boolean;
}

export const createProcessSession = (context: JestExtProcessContext): ProcessSession => {
  const jestProcessManager = new JestProcessManager(context);
  const logging = context.loggingFactory.create('ProcessSessionManager');

  /**
   *
   * @param type
   * @param stoppRunning if true, will stop and remove processes with the same type, default is false
   */
  const scheduleProcess = (request: JestExtRequestType): boolean => {
    context.output.appendLine(`scheduling jest process: ${request.type}`);
    try {
      const pRequest = createProcessRequest(request);

      const success = jestProcessManager.scheduleJestProcess(pRequest);
      if (!success) {
        logging('warn', `request schedule failed: ${requestString(pRequest)}`);
      }
      return success;
    } catch (e) {
      logging('warn', '[scheduleProcess] failed to create/schedule process for ', request);
      return false;
    }
  };
  const listenerSession: ListenerSession = { context, scheduleProcess };

  /**
   * returns an update-snapshot process-request base on the current process
   * @param process
   * @returns undefined if the process already is updating snapshot
   */
  const createSnapshotRequest = (baseRequest: JestProcessRequest): JestProcessRequestBase => {
    switch (baseRequest.type) {
      case 'watch-tests':
      case 'watch-all-tests':
        return { type: 'all-tests', updateSnapshot: true };
      case 'all-tests':
      case 'by-file':
        if (baseRequest.updateSnapshot) {
          throw new Error(
            'schedule a update-snapshot run within an update-snapshot run is not supported'
          );
        }
        return { ...baseRequest, updateSnapshot: true };
      default:
        throw new Error(`unexpeted baseRequest type for snapshot run: ${baseRequest.toString()}`);
    }
  };

  const createProcessRequest = (request: JestExtRequestType): JestProcessRequest => {
    switch (request.type) {
      case 'all-tests':
      case 'watch-all-tests':
      case 'watch-tests':
      case 'by-file': {
        const schedule = ProcessScheduleStrategy[request.type];
        return {
          ...request,
          listener: new RunTestListener(listenerSession),
          schedule,
        };
      }
      case 'update-snapshot': {
        const snapshotRequest = createSnapshotRequest(request.baseRequest);
        const schedule = {
          ...ProcessScheduleStrategy[snapshotRequest.type],
          queue: 'non-blocking' as QueueType,
        };

        return {
          ...snapshotRequest,
          listener: new RunTestListener(listenerSession),
          schedule,
        };
      }
      case 'list-test-files': {
        const schedule = ProcessScheduleStrategy['not-test'];
        return {
          ...request,
          type: 'not-test',
          args: ['--listTests', '--json'],
          listener: new ListTestFileListener(listenerSession, request.onResult),
          schedule,
        };
      }
    }
    throw new Error(`Unexpected process type ${request.type}`);
  };

  /**
   * start JestExt process session from clean state, find all test files and launch the "run.onSessionStart" processes
   */
  const start = async (): Promise<void> => {
    if (jestProcessManager.numberOfProcesses() > 0) {
      context.output.appendLine(`${jestProcessManager.numberOfProcesses} queued, stoping all...`);
      await stop();
    }

    if (context.autoRun.onStartup) {
      context.autoRun.onStartup.forEach((type) => scheduleProcess({ type }));
    }
    if (context.autoRun.isWatch) {
      scheduleProcess({ type: 'watch-tests' });
    }
  };

  /**
   * stop JestExt process session and remove all processes.
   */
  const stop = async (): Promise<void> => {
    return jestProcessManager.stopAll();
  };

  return {
    start,
    stop,
    scheduleProcess,
  };
};
