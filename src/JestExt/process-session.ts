import {
  JestProcessManager,
  JestProcessRequest,
  JestProcessRequestBase,
  ScheduleStrategy,
  requestString,
  JestProcessInfo,
  JestProcessRequestTransform,
} from '../JestProcessManagement';
import { JestTestProcessType } from '../Settings';
import { RunTestListener, ListTestFileListener } from './process-listeners';
import { JestExtProcessContext } from './types';

type InternalProcessType = 'list-test-files';
export type ListTestFilesCallback = (
  fileNames?: string[],
  error?: string,
  exitCode?: number
) => void;
export type InternalRequestBase = {
  type: Extract<InternalProcessType, 'list-test-files'>;
  onResult: ListTestFilesCallback;
};

export type JestExtRequestType = JestProcessRequestBase | InternalRequestBase;
const isJestProcessRequestBase = (request: JestExtRequestType): request is JestProcessRequestBase =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (request as any).transform === 'function';
const getTransform = (request: JestExtRequestType): JestProcessRequestTransform | undefined => {
  if (isJestProcessRequestBase(request)) {
    return request.transform;
  }
};

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
    queue: 'blocking-2',
    dedup: { filterByStatus: ['pending'] },
  },
  'by-file-test': {
    queue: 'blocking-2',
    dedup: { filterByStatus: ['pending'], filterByContent: true },
  },
  'by-file-pattern': {
    queue: 'blocking-2',
    dedup: { filterByStatus: ['pending'] },
  },
  'by-file-test-pattern': {
    queue: 'blocking-2',
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
  scheduleProcess: <T extends JestExtRequestType = JestExtRequestType>(
    request: T
  ) => JestProcessInfo | undefined;
}
export interface ListenerSession {
  context: JestExtProcessContext;
  scheduleProcess: <T extends JestExtRequestType = JestExtRequestType>(
    request: T
  ) => JestProcessInfo | undefined;
}

export const createProcessSession = (context: JestExtProcessContext): ProcessSession => {
  const jestProcessManager = new JestProcessManager(context);
  const logging = context.loggingFactory.create('ProcessSessionManager');

  /**
   *
   * @param type
   * @param stoppRunning if true, will stop and remove processes with the same type, default is false
   */
  const scheduleProcess = <T extends JestExtRequestType = JestExtRequestType>(
    request: T
  ): JestProcessInfo | undefined => {
    logging('debug', `scheduling jest process: ${request.type}`);
    try {
      const pRequest = createProcessRequest(request);

      const process = jestProcessManager.scheduleJestProcess(pRequest);
      if (!process) {
        logging('warn', `request schedule failed: ${requestString(pRequest)}`);
        return;
      }

      context.onRunEvent.fire({ type: 'scheduled', process });

      return process;
    } catch (e) {
      logging(
        'warn',
        '[scheduleProcess] failed to create/schedule process for ',
        request,
        'error:',
        e
      );
      return;
    }
  };
  const listenerSession: ListenerSession = { context, scheduleProcess };

  const createProcessRequest = (request: JestExtRequestType): JestProcessRequest => {
    const transform = (pRequest: JestProcessRequest): JestProcessRequest => {
      const t = getTransform(request);
      return t ? t(pRequest) : pRequest;
    };

    const lSession = listenerSession;
    switch (request.type) {
      case 'all-tests':
      case 'watch-all-tests':
      case 'watch-tests':
      case 'by-file':
      case 'by-file-pattern':
      case 'by-file-test':
      case 'by-file-test-pattern': {
        const schedule = ProcessScheduleStrategy[request.type];
        return transform({
          ...request,
          listener: new RunTestListener(lSession),
          schedule,
        });
      }
      case 'list-test-files': {
        const schedule = ProcessScheduleStrategy['not-test'];
        return transform({
          ...request,
          type: 'not-test',
          args: ['--listTests', '--json', '--watchAll=false'],
          listener: new ListTestFileListener(lSession, request.onResult),
          schedule,
        });
      }
    }
    throw new Error(`Unexpected process type ${request.type}`);
  };

  /**
   * start JestExt process session from clean state, find all test files and launch the "run.onSessionStart" processes
   */
  const start = async (): Promise<void> => {
    if (jestProcessManager.numberOfProcesses() > 0) {
      logging('debug', `${jestProcessManager.numberOfProcesses} queued, stoping all...`);
      await stop();
    }

    if (context.settings.autoRun.onStartup) {
      context.settings.autoRun.onStartup.forEach((type) => scheduleProcess({ type }));
    }
    if (context.settings.autoRun.isWatch) {
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
