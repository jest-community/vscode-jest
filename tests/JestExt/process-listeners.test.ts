jest.unmock('../../src/JestExt/process-listeners');
jest.unmock('../../src/JestExt/helper');

import * as vscode from 'vscode';

import {
  ListTestFileListener,
  RunTestListener,
  AbstractProcessListener,
  DEFAULT_LONG_RUN_THRESHOLD,
} from '../../src/JestExt/process-listeners';
import { cleanAnsi, toErrorString } from '../../src/helpers';
import * as messaging from '../../src/messaging';

describe('jest process listeners', () => {
  let mockSession: any;
  let mockProcess;
  const mockLogging = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    jest.useFakeTimers('legacy');
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');

    mockSession = {
      scheduleProcess: jest.fn(),
      context: {
        settings: {},
        autoRun: {},
        workspace: {},
        setupWizardAction: jest.fn(),
        loggingFactory: {
          create: jest.fn(() => mockLogging),
        },
        onRunEvent: { fire: jest.fn() },
      },
    };
    mockProcess = { request: { type: 'watch' } };
    (cleanAnsi as jest.Mocked<any>).mockImplementation((s) => s);
  });
  afterEach(() => {
    jest.clearAllTimers();
  });
  describe('listener base class: AbstractProcessListener', () => {
    it.each`
      event                 | log
      ${'processStarting'}  | ${true}
      ${'processClose'}     | ${false}
      ${'processExit'}      | ${false}
      ${'executableJSON'}   | ${true}
      ${'executableStdErr'} | ${true}
      ${'executableOutput'} | ${true}
      ${'terminalError'}    | ${true}
    `('listening for runner event $event,  will log=$log', ({ event, log }) => {
      mockProcess.request = { type: 'all-tests' };
      const listener = new AbstractProcessListener(mockSession);
      listener.onEvent(mockProcess, event, jest.fn(), jest.fn());
      if (log) {
        expect(mockLogging).toBeCalled();
        const msg = mockLogging.mock.calls[0][1];
        expect(msg).toContain(mockProcess.request.type);
        expect(msg.toLowerCase()).toContain(event.toLowerCase());
      } else {
        expect(mockLogging).not.toBeCalled();
      }
    });
  });

  describe('ListTestFileListener', () => {
    it.each`
      output                                                          | expectedFiles
      ${[]}                                                           | ${[]}
      ${['whatever\n', '["file1", "file', '2", "file3"]']}            | ${['file1', 'file2', 'file3']}
      ${['["/a/b", "a/c"]']}                                          | ${['/a/b', 'a/c']}
      ${['["/a/b", "", "a/c"]']}                                      | ${['/a/b', 'a/c']}
      ${['["/a/b"]\n[""]\n["a/c"]\n']}                                | ${['/a/b', 'a/c']}
      ${['["/a/b", "a/c"]\n', '["a","b"]']}                           | ${['/a/b', 'a/c', 'a', 'b']}
      ${['[a, b]']}                                                   | ${'Unexpected token'}
      ${['on windows with some error\n', '["C:\\\\a\\\\b.test.js"]']} | ${['C:\\a\\b.test.js']}
    `('can extract and notify file list from valid $output', ({ output, expectedFiles }) => {
      expect.hasAssertions();

      (vscode.Uri.file as jest.Mocked<any>) = jest.fn((f) => ({ fsPath: f }));
      const onResult = jest.fn();
      const listener = new ListTestFileListener(mockSession, onResult);
      (toErrorString as jest.Mocked<any>).mockReturnValue(expectedFiles);

      output.forEach((m) => listener.onEvent(mockProcess, 'executableOutput', Buffer.from(m)));
      listener.onEvent(mockProcess, 'processExit', 0);
      listener.onEvent(mockProcess, 'processClose');

      // should not fire exit event
      expect(mockSession.context.onRunEvent.fire).not.toBeCalled();

      // onResult should be called to report results
      expect(onResult).toBeCalledTimes(1);

      const [fileNames, error] = onResult.mock.calls[0];
      if (Array.isArray(expectedFiles)) {
        expect(vscode.Uri.file).toBeCalledTimes(expectedFiles.length);
        expect(fileNames).toEqual(expectedFiles);
        expect(error).toBeUndefined();
      } else {
        expect(fileNames).toBeUndefined();
        expect(error).toContain(expectedFiles);
      }
    });
    it.each`
      exitCode | isError
      ${0}     | ${false}
      ${1}     | ${true}
      ${999}   | ${true}
    `(
      'can handle process error via onResult: exitCode:$exitCode => isError?$isError',
      ({ exitCode, isError }) => {
        expect.hasAssertions();

        (vscode.Uri.file as jest.Mocked<any>) = jest.fn((f) => ({ fsPath: f }));
        const onResult = jest.fn();
        const listener = new ListTestFileListener(mockSession, onResult);
        (toErrorString as jest.Mocked<any>).mockReturnValue('some error');

        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from('some error'));
        listener.onEvent(mockProcess, 'executableOutput', Buffer.from('["a", "b"]'));
        listener.onEvent(mockProcess, 'processExit', exitCode);
        listener.onEvent(mockProcess, 'processClose');

        // should not fire exit event
        expect(mockSession.context.onRunEvent.fire).not.toBeCalled();

        // onResult should be called to report results or error
        expect(onResult).toBeCalledTimes(1);

        const [fileNames, error, code] = onResult.mock.calls[0];

        // const warnLog = ['warn'];
        if (!isError) {
          const expectedFiles = ['a', 'b'];
          expect(vscode.Uri.file).toBeCalledTimes(expectedFiles.length);
          expect(fileNames).toEqual(expectedFiles);
          expect(error).toBeUndefined();
        } else {
          expect(code).toEqual(exitCode);
          expect(fileNames).toBeUndefined();
          expect(error).toEqual('some error');
        }
      }
    );
  });
  describe('RunTestListener', () => {
    /* eslint-disable jest/no-conditional-expect */
    beforeEach(() => {
      mockSession.context.output = {
        appendLine: jest.fn(),
        append: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
      };
      mockSession.context.updateWithData = jest.fn();
      mockProcess = { request: { type: 'watch-tests' } };
    });

    describe('can handle test result', () => {
      it.each([[true], [false]])('with full output implementation: %s', (fullOutput) => {
        if (!fullOutput) {
          delete mockSession.context.output.clear;
          delete mockSession.context.output.show;
        }
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        const mockData = {};
        mockProcess = { id: 'mock-id' };
        listener.onEvent(mockProcess, 'executableJSON', mockData);
        expect(mockSession.context.updateWithData).toBeCalledWith(mockData, mockProcess);
      });
    });
    describe.each`
      output             | stdout       | stderr       | error
      ${'whatever'}      | ${'data'}    | ${'data'}    | ${'data'}
      ${'onRunStart'}    | ${'data'}    | ${'start'}   | ${'data'}
      ${'onRunComplete'} | ${'data'}    | ${'end'}     | ${'data'}
      ${'Watch Usage'}   | ${undefined} | ${undefined} | ${'data'}
    `('propagate run events: $output', ({ output, stdout, stderr, error }) => {
      it('from stdout: eventType=$stdout', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'executableOutput', output);
        if (stdout) {
          expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
            expect.objectContaining({
              type: stdout,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toBeCalled();
        }
      });
      it('from stderr: eventyType=$stderr', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
        if (stderr) {
          expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
            expect.objectContaining({
              type: stderr,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toBeCalled();
        }
      });
      it('from error event: show=$error', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'terminalError', output);
        if (error) {
          expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
            expect.objectContaining({
              type: error,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toBeCalled();
        }
      });
    });

    describe('can notify start/end events', () => {
      it('when process start and end', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'processStarting');
        expect(mockSession.context.onRunEvent.fire).toBeCalledTimes(1);
        expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
          expect.objectContaining({ type: 'process-start' })
        );

        mockSession.context.onRunEvent.fire.mockClear();
        listener.onEvent(mockProcess, 'processExit');
        expect(mockSession.context.onRunEvent.fire).not.toBeCalled();

        listener.onEvent(mockProcess, 'processClose');
        expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
          expect.objectContaining({ type: 'exit' })
        );
      });
      describe('when reporters reports start/end', () => {
        it.each(['watch', 'all-tests'])(
          'will notify start/end regardless request types',
          (requestType) => {
            expect.hasAssertions();
            const listener = new RunTestListener(mockSession);
            mockProcess.request.type = requestType;

            // stderr
            listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart');
            expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
              expect.objectContaining({ type: 'start' })
            );

            listener.onEvent(mockProcess, 'executableStdErr', 'onRunComplete');
            expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
              expect.objectContaining({ type: 'end' })
            );
          }
        );
        it.each`
          message                                                   | raw
          ${'the data before\r\nonRunStart: xxx\r\ndata after 1'}   | ${'the data before\r\ndata after 1'}
          ${'the data before\r\nonRunComplete\r\ndata after 2\r\n'} | ${'the data before\r\ndata after 2\r\n'}
        `(
          'will still report message: "$message" excluding the reporter output',
          ({ message, raw }) => {
            const listener = new RunTestListener(mockSession);
            // stderr
            listener.onEvent(mockProcess, 'executableStdErr', message, message);
            expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
              expect.objectContaining({ type: 'data', raw })
            );
          }
        );
      });
    });
    describe('MonitorLongRun', () => {
      it.each`
        setting      | threshold
        ${undefined} | ${DEFAULT_LONG_RUN_THRESHOLD}
        ${'off'}     | ${-1}
        ${0}         | ${-1}
        ${-1000}     | ${-1}
        ${10000}     | ${10000}
      `('with monitorLongRun=$setting, actual threshold=$threshold', ({ setting, threshold }) => {
        mockSession.context.settings.monitorLongRun = setting;
        const listener = new RunTestListener(mockSession);

        expect(setTimeout).not.toBeCalled();

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');

        expect(clearTimeout).not.toBeCalled();
        if (threshold > 0) {
          expect(setTimeout).toBeCalledWith(expect.anything(), threshold);
        } else {
          expect(setTimeout).not.toBeCalled();
        }

        jest.runAllTimers();
        if (threshold > 0) {
          expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
            expect.objectContaining({
              type: 'long-run',
              numTotalTestSuites: 100,
              threshold,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toBeCalledWith(
            expect.objectContaining({ type: 'long-run' })
          );
        }
      });
      it.each`
        eventType             | args
        ${'processExit'}      | ${[]}
        ${'executableStdErr'} | ${['onRunComplete']}
      `(
        'should not trigger timeout after process/run ended with $eventType',
        ({ eventType, args }) => {
          mockSession.context.settings.monitorLongRun = undefined;
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
          expect(setTimeout).toBeCalledTimes(1);
          expect(clearTimeout).not.toBeCalled();

          listener.onEvent(mockProcess, eventType, ...args);
          expect(clearTimeout).toBeCalledTimes(1);

          jest.runAllTimers();
          expect(mockSession.context.onRunEvent.fire).not.toBeCalledWith(
            expect.objectContaining({ type: 'long-run' })
          );
        }
      );
      it('each run will start its own monitor', () => {
        mockSession.context.settings.monitorLongRun = undefined;
        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
        listener.onEvent(mockProcess, 'executableStdErr', 'onRunComplete: execError: whatever');
        expect(setTimeout).toBeCalledTimes(1);
        expect(clearTimeout).toBeCalledTimes(1);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 70');
        expect(setTimeout).toBeCalledTimes(2);
        expect(clearTimeout).toBeCalledTimes(1);
      });
      it('will restart timer even if previous timer did not get closed properly', () => {
        mockSession.context.settings.monitorLongRun = undefined;
        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 70');
        expect(setTimeout).toBeCalledTimes(2);
        expect(clearTimeout).toBeCalledTimes(1);
      });
    });
    describe('when snapshot test failed', () => {
      it.each`
        seq  | output                            | enableSnapshotUpdateMessages | expectUpdateSnapshot
        ${1} | ${'Snapshot test failed'}         | ${true}                      | ${true}
        ${2} | ${'Snapshot test failed'}         | ${false}                     | ${false}
        ${3} | ${'Snapshot failed'}              | ${true}                      | ${true}
        ${4} | ${'Snapshots failed'}             | ${true}                      | ${true}
        ${5} | ${'Failed for some other reason'} | ${true}                      | ${false}
      `(
        'can detect snapshot failure: #$seq',
        async ({ output, enableSnapshotUpdateMessages, expectUpdateSnapshot }) => {
          expect.hasAssertions();
          mockSession.context.settings.enableSnapshotUpdateMessages = enableSnapshotUpdateMessages;
          (vscode.window.showInformationMessage as jest.Mocked<any>).mockReturnValue(
            Promise.resolve('something')
          );

          const listener = new RunTestListener(mockSession);

          await listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
          if (expectUpdateSnapshot) {
            expect(vscode.window.showInformationMessage).toBeCalledTimes(1);
            expect(mockSession.scheduleProcess).toBeCalledWith({
              type: 'update-snapshot',
              baseRequest: mockProcess.request,
            });
          } else {
            expect(vscode.window.showInformationMessage).not.toBeCalled();
            expect(mockSession.scheduleProcess).not.toBeCalled();
          }
        }
      );
      it('will abort auto update snapshot if no user action is taken', async () => {
        expect.hasAssertions();
        mockSession.context.settings.enableSnapshotUpdateMessages = true;
        (vscode.window.showInformationMessage as jest.Mocked<any>).mockReturnValue(
          Promise.resolve(undefined)
        );

        const listener = new RunTestListener(mockSession);

        await listener.onEvent(
          mockProcess,
          'executableStdErr',
          Buffer.from('Snapshot test failed')
        );
        expect(vscode.window.showInformationMessage).toBeCalledTimes(1);
        expect(mockSession.scheduleProcess).not.toBeCalled();
      });
      it('auto update snapsot only apply for runs not already updating snapshots', async () => {
        expect.hasAssertions();
        mockSession.context.settings.enableSnapshotUpdateMessages = true;
        (vscode.window.showInformationMessage as jest.Mocked<any>).mockReturnValue(
          Promise.resolve('something')
        );

        const listener = new RunTestListener(mockSession);

        await listener.onEvent(
          mockProcess,
          'executableStdErr',
          Buffer.from('Snapshot test failed')
        );
        expect(vscode.window.showInformationMessage).toBeCalledTimes(1);
        expect(mockSession.scheduleProcess).toBeCalledWith({
          type: 'update-snapshot',
          baseRequest: mockProcess.request,
        });

        // for a process already with updateSnapshot flag: do nothing
        (vscode.window.showInformationMessage as jest.Mocked<any>).mockClear();
        mockSession.scheduleProcess.mockClear();
        mockProcess.request.updateSnapshot = true;
        await listener.onEvent(
          mockProcess,
          'executableStdErr',
          Buffer.from('Snapshot test failed')
        );
        expect(vscode.window.showInformationMessage).not.toBeCalled();
        expect(mockSession.scheduleProcess).not.toBeCalled();
      });
    });

    describe('when "--watch" is not supported', () => {
      const outOfRepositoryOutput = `
        Determining test suites to run...

          ● Test suite failed to run

            fatal: ../packages/a-dependency-outside-the-submodule: '../packages/a-dependency-outside-the-submodule' is outside repository
    `;
      it.each`
        seq  | processType          | output                                                              | expectToRestart
        ${1} | ${'watch-tests'}     | ${'--watch is not supported without git/hg, please use --watchAll'} | ${true}
        ${2} | ${'watch-all-tests'} | ${'--watch is not supported without git/hg, please use --watchAll'} | ${false}
        ${3} | ${'all-tests'}       | ${'--watch is not supported without git/hg, please use --watchAll'} | ${false}
        ${4} | ${'watch-tests'}     | ${'watch worked just fine...'}                                      | ${false}
        ${5} | ${'watch-tests'}     | ${outOfRepositoryOutput}                                            | ${true}
        ${6} | ${'all-tests'}       | ${outOfRepositoryOutput}                                            | ${false}
      `(
        'can detect and switch from watch to watch-all: #$seq',
        ({ processType, output, expectToRestart }) => {
          expect.hasAssertions();
          mockProcess.stop = jest.fn();
          mockProcess.request.type = processType;
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
          if (expectToRestart) {
            expect(mockSession.scheduleProcess).toBeCalledWith({ type: 'watch-all-tests' });
            expect(mockProcess.stop).toHaveBeenCalled();
          } else {
            expect(mockSession.scheduleProcess).not.toBeCalled();
          }
        }
      );
    });
    describe('upon process exit', () => {
      it('do nothing if not a watch process', () => {
        expect.hasAssertions();
        mockProcess.request = { type: 'all-tests' };
        (messaging as jest.Mocked<any>).systemErrorMessage = jest.fn();

        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'processClose', 1);
        expect(messaging.systemErrorMessage).not.toBeCalled();
      });
      it('do nothing if watch run exit due to on-demand stop', () => {
        expect.hasAssertions();
        mockProcess.request = { type: 'watch-tests' };
        mockProcess.stopReason = 'on-demand';
        (messaging as jest.Mocked<any>).systemErrorMessage = jest.fn();

        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'processClose', 1);
        expect(messaging.systemErrorMessage).not.toBeCalled();
      });
      describe('if watch exit not caused by on-demand stop', () => {
        beforeEach(() => {
          mockSession.context.workspace = { name: 'workspace-xyz' };
          mockProcess.request = { type: 'watch-tests' };
        });
        it('will fire exit with error', () => {
          expect.hasAssertions();

          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'processClose', 1);
          expect(mockSession.context.onRunEvent.fire).toBeCalledWith(
            expect.objectContaining({
              type: 'exit',
              error: expect.anything(),
            })
          );
        });
      });
    });
  });
});
