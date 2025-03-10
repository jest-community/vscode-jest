import {
  JestProcessManager,
  JestProcessRequest,
  JestProcessRequestBase,
  ScheduleStrategy,
  requestString,
  JestProcessInfo,
  JestProcessRequestTransform,
  UserDataType,
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

const getScheduleStrategy = (requestType: JestTestProcessType): ScheduleStrategy => {
  switch (requestType) {
    // abort if there is already an pending request
    case 'all-tests':
      return { queue: 'blocking', dedupe: { filterByStatus: ['pending'] } };
    case 'watch-tests':
      return { queue: 'blocking', dedupe: { filterByStatus: ['pending'] } };
    case 'watch-all-tests':
      return {
        queue: 'blocking',
        dedupe: { filterByStatus: ['pending'] },
      };
    case 'by-file':
      return {
        queue: 'blocking-2',
        dedupe: { filterByStatus: ['pending'] },
      };
    case 'by-file-test':
      return {
        queue: 'blocking-2',
        dedupe: { filterByStatus: ['pending'], filterByContent: true },
      };
    case 'by-file-pattern':
      return {
        queue: 'blocking-2',
        dedupe: { filterByStatus: ['pending'] },
      };
    case 'by-file-test-pattern':
      return {
        queue: 'blocking-2',
        dedupe: { filterByStatus: ['pending'], filterByContent: true },
      };
    case 'not-test':
      return {
        queue: 'non-blocking',
        dedupe: { filterByStatus: ['pending'] },
      };
  }
};

export interface ProcessSession {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  scheduleProcess: <T extends JestExtRequestType = JestExtRequestType>(
    request: T,
    userData?: UserDataType
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
   * @param stopRunning if true, will stop and remove processes with the same type, default is false
   */
  const scheduleProcess = <T extends JestExtRequestType = JestExtRequestType>(
    request: T,
    userData?: UserDataType
  ): JestProcessInfo | undefined => {
    logging('debug', `scheduling jest process: ${request.type}`);
    try {
      const pRequest = createProcessRequest(request);

      const process = jestProcessManager.scheduleJestProcess(pRequest, userData);
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
      case 'all-tests': {
        const schedule = getScheduleStrategy(request.type);
        if (request.nonBlocking) {
          schedule.queue = 'blocking-2';
        }
        return transform({
          ...request,
          listener: new RunTestListener(lSession),
          schedule,
        });
      }
      case 'watch-all-tests':
      case 'watch-tests':
      case 'by-file':
      case 'by-file-pattern':
      case 'by-file-test':
      case 'by-file-test-pattern': {
        const schedule = getScheduleStrategy(request.type);
        return transform({
          ...request,
          listener: new RunTestListener(lSession),
          schedule,
        });
      }
      case 'list-test-files': {
        const schedule = getScheduleStrategy('not-test');
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
      logging('debug', `${jestProcessManager.numberOfProcesses} queued, stopping all...`);
      await stop();
    }

    if (context.settings.runMode.config.runAllTestsOnStartup) {
      // on startup, run all tests in blocking mode always
      scheduleProcess({ type: 'all-tests', nonBlocking: false });
    }
    if (context.settings.runMode.config.type === 'watch') {
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
