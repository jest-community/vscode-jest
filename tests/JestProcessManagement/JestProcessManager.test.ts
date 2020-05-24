jest.unmock('../../src/JestProcessManagement/JestProcessManager');

import { ProjectWorkspace } from 'jest-editor-support';
import { JestProcessManager } from '../../src/JestProcessManagement/JestProcessManager';
import { JestProcess } from '../../src/JestProcessManagement/JestProcess';
import { EventEmitter } from 'events';
import { WatchMode } from '../../src/Jest';

describe('JestProcessManager', () => {
  let jestProcessManager;
  let projectWorkspaceMock;
  let exitHandler;
  let eventEmitter;

  const jestProcessMock = (JestProcess as any) as jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    projectWorkspaceMock = new ProjectWorkspace(null, null, null, null);
    jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock });
    exitHandler = jest.fn();
    eventEmitter = new EventEmitter();
  });

  describe('when creating', () => {
    it('accepts Project Workspace as the argument', () => {
      // tslint:disable-next-line no-shadowed-variable
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock });
      expect(jestProcessManager).not.toBe(null);
    });

    it('accepts runAllTestsFirstInWatchMode argument (true if not provided)', () => {
      // tslint:disable-next-line no-shadowed-variable
      const jestProcessManager = new JestProcessManager({
        projectWorkspace: projectWorkspaceMock,
        runAllTestsFirstInWatchMode: false,
      });
      expect(jestProcessManager).not.toBe(null);
    });
  });

  describe('when starting jest process', () => {
    it('creates JestProcess', () => {
      jestProcessManager.startJestProcess();

      expect(jestProcessMock).toHaveBeenCalledTimes(1);
    });

    it('returns an instance of JestProcess', () => {
      const jestProcess = jestProcessManager.startJestProcess();

      expect(jestProcess).toBe(jestProcessMock.mock.instances[0]);
    });

    it('passes the project workspace to the JestProcess instance', () => {
      jestProcessManager.startJestProcess();

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty(
        'projectWorkspace',
        projectWorkspaceMock
      );
    });

    it('calls the onExit handler when JestProcess exits', () => {
      const mockImplementation = {
        keepAlive: false,
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
      };
      jestProcessMock.mockImplementation(() => mockImplementation);

      jestProcessManager.startJestProcess({ exitCallback: exitHandler });

      eventEmitter.emit('debuggerProcessExit', mockImplementation);

      expect(exitHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('when starting jest process in non-watch mode', () => {
    it('passes the watchMode flag set to false', () => {
      jestProcessManager.startJestProcess();

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('watchMode', WatchMode.None);
    });
  });

  describe('when starting jest process in keep-alive mode', () => {
    it('passes the keepAlive flag set to true', () => {
      jestProcessManager.startJestProcess({ keepAlive: true });

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('keepAlive', true);
    });
  });

  describe('when starting jest process in non keep-alive mode', () => {
    it('passes the keepAlive flag set to false', () => {
      jestProcessManager.startJestProcess({ keepAlive: false });

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('keepAlive', false);
    });

    it('passes the keepAlive flag set to false when no flag is specified', () => {
      jestProcessManager.startJestProcess();

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('keepAlive', false);
    });
  });

  describe('when starting jest process in watch mode', () => {
    it('will run all tests without watch mode then restart with --watch', () => {
      jestProcessManager.startJestProcess({ watchMode: WatchMode.Watch });

      eventEmitter.emit('debuggerProcessExit', { stopRequested: () => false });

      expect(jestProcessMock.mock.calls).toEqual([
        [
          {
            keepAlive: false,
            projectWorkspace: projectWorkspaceMock,
            watchMode: WatchMode.None,
          },
        ],
        [
          {
            keepAlive: false,
            projectWorkspace: projectWorkspaceMock,
            watchMode: WatchMode.Watch,
          },
        ],
      ]);
    });

    it('starts the process for non-watch mode with keep-alive flag set to false', () => {
      jestProcessManager.startJestProcess({
        keepAlive: true,
        watchMode: WatchMode.Watch,
      });

      // we need this to trigger the watch-mode process that only starts
      // after the non-watch-mode process exits
      eventEmitter.emit('debuggerProcessExit', { stopRequested: () => false });

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('keepAlive', false);
      expect(jestProcessMock.mock.calls[1][0]).toHaveProperty('keepAlive', true);
    });

    it('starts both jest processes with the same project workspace', () => {
      jestProcessManager.startJestProcess({ watchMode: WatchMode.Watch });

      eventEmitter.emit('debuggerProcessExit', { stopRequested: () => false });

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty(
        'projectWorkspace',
        projectWorkspaceMock
      );
      expect(jestProcessMock.mock.calls[1][0]).toHaveProperty(
        'projectWorkspace',
        projectWorkspaceMock
      );
    });

    it('binds the provided exit handler to the both jest processes', () => {
      const eventEmitterForWatchMode = new EventEmitter();
      const onExitMock = jest
        .fn()
        .mockImplementationOnce((callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        })
        .mockImplementationOnce((callback) => {
          eventEmitterForWatchMode.on('debuggerProcessExit', callback);
        });

      jestProcessMock.mockImplementation(() => ({
        onExit: onExitMock,
      }));

      jestProcessManager.startJestProcess({
        exitCallback: exitHandler,
        watchMode: WatchMode.Watch,
      });

      eventEmitter.emit('debuggerProcessExit', { stopRequested: () => false, watchMode: false });
      eventEmitterForWatchMode.emit('debuggerProcessExit', {
        stopRequested: () => false,
        watchMode: true,
      });

      expect(exitHandler).toHaveBeenCalledTimes(2);
      expect(exitHandler.mock.calls[0][0].watchMode).toBe(false);
      expect(exitHandler.mock.calls[1][0].watchMode).toBe(true);
    });

    it('the exit handler for the non-watch mode passes the jest process representing the watch mode as the second argument', () => {
      const eventEmitterForWatchMode = new EventEmitter();
      const onExitMock = jest
        .fn()
        .mockImplementationOnce((callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        })
        .mockImplementationOnce((callback) => {
          eventEmitterForWatchMode.on('debuggerProcessExit', callback);
        });

      const mockImplementation = {
        onExit: onExitMock,
        restart: jest.fn(),
        stopRequested: () => false,
      };

      jestProcessMock.mockImplementation(() => mockImplementation);

      jestProcessManager.startJestProcess({
        exitCallback: exitHandler,
        watchMode: WatchMode.Watch,
      });

      eventEmitter.emit('debuggerProcessExit', mockImplementation);
      eventEmitterForWatchMode.emit('debuggerProcessExit', mockImplementation);

      expect(exitHandler.mock.calls[0].length).toBe(2);
      expect(exitHandler.mock.calls[0][1]).toBe(mockImplementation);
    });
  });

  describe('when stopping jest process', () => {
    it('stops the most recent running jest process', () => {
      const stopMock = jest.fn();
      jestProcessMock.mockImplementation(() => ({
        onExit: jest.fn(),
        stop: stopMock,
      }));
      const jestProcess = jestProcessManager.startJestProcess();

      jestProcessManager.stopJestProcess(jestProcess);

      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(jestProcessManager.numberOfProcesses).toBe(0);
    });
    it('stopJestProcess can stop the process even if it is not in the process list', () => {
      const stopMock = jest.fn();
      jestProcessMock.mockImplementation(() => ({
        onExit: jest.fn(),
        stop: stopMock,
      }));
      const jestProcess = jestProcessManager.startJestProcess();
      const cloned = { ...jestProcess };

      expect(jestProcessManager.numberOfProcesses).toBe(1);
      jestProcessManager.stopJestProcess(cloned);

      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(jestProcessManager.numberOfProcesses).toBe(1);
    });

    // jest mocking does not let us test it properly because
    // jestProcessMock.instances does not work as expected
    it('can stop all process at once', () => {
      const mockImplementation = {
        onExit: jest.fn(),
        stop: jest.fn(),
      };

      jestProcessMock.mockImplementation(() => mockImplementation);

      jestProcessManager.startJestProcess();
      jestProcessManager.startJestProcess();

      const stopAll = jestProcessManager.stopAll();

      expect(stopAll).toBeInstanceOf(Promise);
      return stopAll.then(() => {
        expect(jestProcessMock).toHaveBeenCalledTimes(2);
        expect(mockImplementation.stop).toHaveBeenCalledTimes(2);
        expect(jestProcessManager.numberOfProcesses).toBe(0);
      });
    });
    describe('2-staged process: runAllTest => runWatchMode', () => {
      let startOptions = {};
      beforeEach(() => {
        jestProcessMock.mockImplementation(() => {
          let isStopped = false;
          const stop = () => (isStopped = true);
          const stopRequested = () => isStopped;
          const onExit = (callback) => {
            eventEmitter.on('debuggerProcessExit', callback);
          };
          return { onExit, stop, stopRequested };
        });
        startOptions = {
          exitCallback: exitHandler,
          watchMode: WatchMode.Watch,
        };
      });
      it('normally the watch-mode process will auto-start when first process exit', () => {
        const p = jestProcessManager.startJestProcess(startOptions);
        expect(jestProcessMock).toHaveBeenCalledTimes(1);

        eventEmitter.emit('debuggerProcessExit', p);

        expect(jestProcessMock).toHaveBeenCalledTimes(2);
      });
      it('stopAll will prevent auto start the watch mode process', async () => {
        const p = jestProcessManager.startJestProcess(startOptions);
        expect(jestProcessMock).toHaveBeenCalledTimes(1);
        expect(jestProcessManager.numberOfProcesses).toBe(1);

        await jestProcessManager.stopAll();
        expect(jestProcessManager.numberOfProcesses).toBe(0);

        eventEmitter.emit('debuggerProcessExit', p);
        expect(jestProcessManager.numberOfProcesses).toBe(0);
        expect(jestProcessMock).toHaveBeenCalledTimes(1);
      });
      it('stopJestProcess will prevent auto start the watch mode process', async () => {
        const p = jestProcessManager.startJestProcess(startOptions);
        expect(jestProcessMock).toHaveBeenCalledTimes(1);
        expect(jestProcessManager.numberOfProcesses).toBe(1);

        await jestProcessManager.stopJestProcess(p);
        expect(jestProcessManager.numberOfProcesses).toBe(0);

        eventEmitter.emit('debuggerProcessExit', p);
        expect(jestProcessManager.numberOfProcesses).toBe(0);
        expect(jestProcessMock).toHaveBeenCalledTimes(1);
      });
    });

    it('does not stop any jest process if none is running', () => {
      const mockImplementation = {
        onExit: jest.fn(),
        stop: jest.fn(),
      };

      jestProcessMock.mockImplementation(() => mockImplementation);

      const stopAll = jestProcessManager.stopAll();

      expect(stopAll).toBeInstanceOf(Promise);
      return stopAll.then(() => {
        expect(jestProcessMock).toHaveBeenCalledTimes(0);
        expect(mockImplementation.stop).not.toHaveBeenCalled();
        expect(jestProcessManager.numberOfProcesses).toBe(0);
      });
    });
  });

  describe('jest process exits with keepAlive === true', () => {
    it('removes the reference to the jest process that has been stopped', () => {
      const jestProcess = jestProcessManager.startJestProcess({ keepAlive: true });

      jestProcessManager.stopJestProcess(jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(0);
    });

    it('removes the reference to the jest process that has been stopped and the following onExit event does not do anything', () => {
      jestProcessMock.mockImplementation(() => ({
        keepAlive: true,
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
        stop: jest.fn(),
      }));

      const jestProcess = jestProcessManager.startJestProcess({ keepAlive: true });
      jestProcessManager.stopJestProcess(jestProcess);

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(0);
      expect(jestProcess.stop).toHaveBeenCalledTimes(1);
    });

    it('keeps the reference to the jest process that exited on its own but then restarted', () => {
      jestProcessMock.mockImplementation(() => ({
        keepAlive: true,
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
      }));

      const jestProcess = jestProcessManager.startJestProcess({ keepAlive: true });

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(1);
    });

    it('removes the reference to the jest process that exited on its own that preceeds the jest process for watch mode', () => {
      jestProcessMock.mockImplementation(() => ({
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
        stopRequested: () => false,
      }));

      const jestProcess = jestProcessManager.startJestProcess({
        keepAlive: true,
        watchMode: WatchMode.Watch,
      });

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(1);
    });

    it('keeps the reference to the jest process in watch-mode that exited on its own', () => {
      const eventEmitterForWatchMode = new EventEmitter();
      const onExitMock = jest
        .fn()
        .mockImplementationOnce((callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        })
        .mockImplementationOnce((callback) => {
          eventEmitterForWatchMode.on('debuggerProcessExit', callback);
        });

      const mockImplementation = {
        keepAlive: true,
        onExit: onExitMock,
        restart: jest.fn(),
      };
      jestProcessMock.mockImplementation(() => mockImplementation);

      const jestProcess = jestProcessManager.startJestProcess({
        watch: true,
        keepAlive: true,
        exitCallback: (_, jestProcessInWatchMode) => {
          if (jestProcessInWatchMode) {
            // this one will exit the watch-mode process
            eventEmitterForWatchMode.emit('debuggerProcessExit', jestProcessInWatchMode);
          }
        },
      });

      // this one will exit the run-all-tests process
      eventEmitter.emit('debuggerProcessExit', jestProcess);

      // there should be one process left - the watch mode process is kept-alive
      expect(jestProcessManager.numberOfProcesses).toBe(1);
    });
  });

  describe('jest process exits with keepAlive === false', () => {
    it('removes the reference to the jest process that exited on its own', () => {
      jestProcessMock.mockImplementation(() => ({
        keepAlive: false,
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
        restart: jest.fn(),
      }));

      const jestProcess = jestProcessManager.startJestProcess();

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(0);
    });

    it('removes the reference to the jest process in watch-mode that exited on its own', () => {
      const eventEmitterForWatchMode = new EventEmitter();
      const onExitMock = jest
        .fn()
        .mockImplementationOnce((callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        })
        .mockImplementationOnce((callback) => {
          eventEmitterForWatchMode.on('debuggerProcessExit', callback);
        });

      const mockImplementation = {
        keepAlive: false,
        onExit: onExitMock,
        restart: jest.fn(),
      };
      jestProcessMock.mockImplementation(() => mockImplementation);

      const jestProcess = jestProcessManager.startJestProcess({
        watch: true,
        exitCallback: (_, jestProcessInWatchMode) => {
          if (jestProcessInWatchMode) {
            eventEmitterForWatchMode.emit('debuggerProcessExit', jestProcessInWatchMode);
          }
        },
      });

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessManager.numberOfProcesses).toBe(0);
    });
  });

  describe('when runAllTestsFirstInWatchMode is false', () => {
    it('does not run all tests first', () => {
      jestProcessManager = new JestProcessManager({
        projectWorkspace: projectWorkspaceMock,
        runAllTestsFirstInWatchMode: false,
      });

      jestProcessMock.mockImplementation(() => ({
        onExit: (callback) => {
          eventEmitter.on('debuggerProcessExit', callback);
        },
      }));

      const watchMode = WatchMode.Watch;
      const jestProcess = jestProcessManager.startJestProcess({ watchMode });

      eventEmitter.emit('debuggerProcessExit', jestProcess);

      expect(jestProcessMock).toHaveBeenCalledTimes(1);

      expect(jestProcessMock.mock.calls[0]).toEqual([
        {
          keepAlive: false,
          projectWorkspace: projectWorkspaceMock,
          watchMode,
        },
      ]);
    });
  });
});
