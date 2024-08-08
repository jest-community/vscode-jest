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
import { extensionName } from '../../src/appGlobals';
import { ProcessStatus } from '../../src/JestProcessManagement/types';
import { JestTestProcessType } from '../../src/Settings';

class DummyListener extends AbstractProcessListener {
  constructor(session) {
    super(session);
  }
  retryWithLoginShell(process, code, signal): boolean {
    return super.retryWithLoginShell(process, code, signal);
  }
}

const initMockProcess = (requestType: JestTestProcessType) => {
  return {
    id: `${requestType}-0`,
    request: { type: requestType },
    stop: jest.fn(),
    isWatchMode: requestType === 'watch-tests' || requestType === 'watch-all-tests',
    status: ProcessStatus.Pending,
  };
};

describe('jest process listeners', () => {
  let mockSession: any;
  let mockProcess;
  const mockLogging = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    jest.useFakeTimers({ legacyFakeTimers: true });
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');

    mockSession = {
      scheduleProcess: jest.fn(),
      context: {
        settings: { shell: { useLoginShell: false } },
        autoRun: {},
        workspace: {},
        setupWizardAction: jest.fn(),
        loggingFactory: {
          create: jest.fn(() => mockLogging),
        },
        onRunEvent: { fire: jest.fn() },
        output: { write: jest.fn() },
      },
    };
    mockProcess = initMockProcess('watch-tests');
    (cleanAnsi as jest.Mocked<any>).mockImplementation((s) => s);
  });
  afterEach(() => {
    jest.clearAllTimers();
  });
  describe('listener base class: AbstractProcessListener', () => {
    it.each`
      event                 | log
      ${'processClose'}     | ${false}
      ${'processExit'}      | ${false}
      ${'executableJSON'}   | ${false}
      ${'executableStdErr'} | ${false}
      ${'executableOutput'} | ${false}
      ${'terminalError'}    | ${true}
    `('listening for runner event $event,  will log=$log', ({ event, log }) => {
      const listener = new AbstractProcessListener(mockSession);
      listener.onEvent(mockProcess, event, jest.fn(), jest.fn());
      if (log) {
        expect(mockLogging).toHaveBeenCalled();
        const msg = mockLogging.mock.calls[0][1];
        expect(msg).toContain(mockProcess.request.type);
        expect(msg.toLowerCase()).toContain(event.toLowerCase());
      } else {
        expect(mockLogging).not.toHaveBeenCalled();
      }
    });
    describe('can flag possible process env error', () => {
      it.each`
        case | data                                                   | CmdNotFoundEnv
        ${1} | ${'/bin/sh: jest: command not found'}                  | ${false}
        ${2} | ${'/bin/sh: node: command not found'}                  | ${true}
        ${3} | ${'/bin/sh: npm: command not found'}                   | ${true}
        ${4} | ${'env: yarn: No such file or directory'}              | ${true}
        ${5} | ${'env: jest: No such file or directory'}              | ${false}
        ${6} | ${'env: node: No such file or directory'}              | ${true}
        ${7} | ${'/bin/sh: react-scripts: command not found'}         | ${false}
        ${8} | ${'/bin/sh: react-scripts: No such file or directory'} | ${false}
      `('case $case', ({ data, CmdNotFoundEnv }) => {
        const listener = new AbstractProcessListener(mockSession);
        listener.onEvent(mockProcess, 'executableStdErr', data, '');
        expect((listener as any).CmdNotFoundEnv).toEqual(CmdNotFoundEnv);
      });
    });
    describe('can retry with login-shell if applicable', () => {
      it.each`
        case | useLoginShell | exitCode | hasEnvIssue | retry
        ${1} | ${false}      | ${127}   | ${true}     | ${true}
        ${2} | ${true}       | ${127}   | ${true}     | ${false}
        ${3} | ${'never'}    | ${127}   | ${true}     | ${false}
        ${4} | ${false}      | ${127}   | ${false}    | ${false}
        ${5} | ${false}      | ${136}   | ${true}     | ${true}
        ${6} | ${false}      | ${1}     | ${true}     | ${false}
      `('case $case', ({ useLoginShell, exitCode, hasEnvIssue, retry }) => {
        mockSession.context.settings.shell.useLoginShell = useLoginShell;
        const listener = new DummyListener(mockSession);
        if (hasEnvIssue) {
          listener.onEvent(mockProcess, 'executableStdErr', 'whatever: command not found', '');
        }
        expect(listener.retryWithLoginShell(mockProcess, exitCode, undefined)).toEqual(retry);
        if (retry) {
          expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            `${extensionName}.with-workspace.enable-login-shell`,
            mockSession.context.workspace
          );
        } else {
          expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        }
      });
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
      listener.onEvent(mockProcess, 'processClose', 0);

      // should not fire exit event
      expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();

      // onResult should be called to report results
      expect(onResult).toHaveBeenCalledTimes(1);

      const [fileNames, error] = onResult.mock.calls[0];
      if (Array.isArray(expectedFiles)) {
        expect(vscode.Uri.file).toHaveBeenCalledTimes(expectedFiles.length);
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
        listener.onEvent(mockProcess, 'processClose', exitCode);

        // should not fire exit event
        expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();

        // onResult should be called to report results or error
        expect(onResult).toHaveBeenCalledTimes(1);

        const [fileNames, error, code] = onResult.mock.calls[0];

        // const warnLog = ['warn'];
        if (!isError) {
          const expectedFiles = ['a', 'b'];
          expect(vscode.Uri.file).toHaveBeenCalledTimes(expectedFiles.length);
          expect(fileNames).toEqual(expectedFiles);
          expect(error).toBeUndefined();
        } else {
          expect(code).toEqual(exitCode);
          expect(fileNames).toBeUndefined();
          expect(error).toEqual('some error');
        }
      }
    );
    describe('can retry with login-shell if process.env is not correct', () => {
      it.each`
        case | useLoginShell | exitCode | willRetry
        ${1} | ${false}      | ${1}     | ${false}
        ${2} | ${false}      | ${127}   | ${true}
        ${3} | ${false}      | ${136}   | ${true}
        ${4} | ${true}       | ${127}   | ${false}
        ${5} | ${'never'}    | ${127}   | ${false}
      `('will retry with login-shell', ({ useLoginShell, exitCode, willRetry }) => {
        mockSession.context.settings.shell.useLoginShell = useLoginShell;
        const onResult = jest.fn();
        const listener = new ListTestFileListener(mockSession, onResult);

        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from('node: command not found'));
        listener.onEvent(mockProcess, 'processClose', exitCode);

        if (willRetry) {
          expect(onResult).not.toHaveBeenCalled();
        } else {
          expect(onResult).toHaveBeenCalled();
        }
      });
    });
  });
  describe('RunTestListener', () => {
    beforeEach(() => {
      mockSession.context.output = {
        appendLine: jest.fn(),
        append: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        write: jest.fn(),
      };
      mockSession.context.updateWithData = jest.fn();
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
        listener.onEvent(mockProcess, 'executableJSON', mockData);
        expect(mockSession.context.updateWithData).toHaveBeenCalledWith(mockData, mockProcess);
      });
    });
    describe.each`
      output                                    | stdout       | stderr          | error
      ${'whatever'}                             | ${'data'}    | ${'data'}       | ${'data'}
      ${'onRunStart'}                           | ${'data'}    | ${'start'}      | ${'data'}
      ${'onRunComplete'}                        | ${'data'}    | ${'end'}        | ${'data'}
      ${'onTestFileResult: encountered errors'} | ${'data'}    | ${'test-error'} | ${'data'}
      ${'Watch Usage'}                          | ${undefined} | ${undefined}    | ${'data'}
    `('propagate run events: $output', ({ output, stdout, stderr, error }) => {
      it('from stdout: eventType=$stdout', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'executableOutput', output);
        if (stdout) {
          expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
            expect.objectContaining({
              type: stdout,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();
        }
      });
      it('from stderr: eventType=$stderr', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
        if (stderr) {
          expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
            expect.objectContaining({
              type: stderr,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();
        }
      });
      it('from error event: show=$error', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'terminalError', output);
        if (error) {
          expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
            expect.objectContaining({
              type: error,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();
        }
      });
    });

    describe('can notify start/end events', () => {
      it('when process start and end', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout

        mockSession.context.onRunEvent.fire.mockClear();
        listener.onEvent(mockProcess, 'processExit');
        expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();

        listener.onEvent(mockProcess, 'processClose');
        expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
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
            expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
              expect.objectContaining({ type: 'start' })
            );

            listener.onEvent(mockProcess, 'executableStdErr', 'onRunComplete');
            expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
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
            expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
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

        expect(setTimeout).not.toHaveBeenCalled();

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');

        expect(clearTimeout).not.toHaveBeenCalled();
        if (threshold > 0) {
          expect(setTimeout).toHaveBeenCalledWith(expect.anything(), threshold);
        } else {
          expect(setTimeout).not.toHaveBeenCalled();
        }

        jest.runAllTimers();
        if (threshold > 0) {
          expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'long-run',
              numTotalTestSuites: 100,
              threshold,
            })
          );
        } else {
          expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'long-run' })
          );
        }
      });
      it.each`
        eventType             | args
        ${'processClose'}     | ${[0]}
        ${'executableStdErr'} | ${['onRunComplete']}
      `(
        'should not trigger timeout after process/run ended with $eventType',
        ({ eventType, args }) => {
          mockSession.context.settings.monitorLongRun = undefined;
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
          expect(setTimeout).toHaveBeenCalledTimes(1);
          expect(clearTimeout).not.toHaveBeenCalled();

          listener.onEvent(mockProcess, eventType, ...args);
          expect(clearTimeout).toHaveBeenCalledTimes(1);

          jest.runAllTimers();
          expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'long-run' })
          );
        }
      );
      it('each run will start its own monitor', () => {
        mockSession.context.settings.monitorLongRun = undefined;
        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
        listener.onEvent(mockProcess, 'executableStdErr', 'onRunComplete: execError: whatever');
        expect(setTimeout).toHaveBeenCalledTimes(1);
        expect(clearTimeout).toHaveBeenCalledTimes(1);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 70');
        expect(setTimeout).toHaveBeenCalledTimes(2);
        expect(clearTimeout).toHaveBeenCalledTimes(1);
      });
      it('will restart timer even if previous timer did not get closed properly', () => {
        mockSession.context.settings.monitorLongRun = undefined;
        const listener = new RunTestListener(mockSession);

        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 100');
        listener.onEvent(mockProcess, 'executableStdErr', 'onRunStart: numTotalTestSuites: 70');
        expect(setTimeout).toHaveBeenCalledTimes(2);
        expect(clearTimeout).toHaveBeenCalledTimes(1);
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
          mockProcess = initMockProcess(processType);
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
          if (expectToRestart) {
            expect(mockSession.scheduleProcess).toHaveBeenCalledWith({ type: 'watch-all-tests' });
            expect(mockProcess.stop).toHaveBeenCalled();
          } else {
            expect(mockSession.scheduleProcess).not.toHaveBeenCalled();
          }
        }
      );
    });
    describe('upon process exit', () => {
      describe('determining execution error', () => {
        describe('when user cancels => no error', () => {
          it.each`
            requestType      | exitCode
            ${'watch-tests'} | ${0}
            ${'watch-tests'} | ${1}
            ${'watch-tests'} | ${127}
            ${'all-tests'}   | ${0}
            ${'all-tests'}   | ${1}
            ${'all-tests'}   | ${127}
          `('$requestType, exitCode=$exitCode', ({ requestType, exitCode }) => {
            expect.hasAssertions();
            mockProcess = initMockProcess(requestType);
            mockProcess.status = ProcessStatus.Cancelled;

            const listener = new RunTestListener(mockSession);

            listener.onEvent(mockProcess, 'processClose', exitCode);
            expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'exit',
                error: undefined,
              })
            );
          });
        });
        describe('when not by user cancellation', () => {
          it.each`
            case  | requestType      | exitCode | willRetry | isError
            ${1}  | ${'all-tests'}   | ${0}     | ${false}  | ${false}
            ${2}  | ${'all-tests'}   | ${1}     | ${false}  | ${false}
            ${3}  | ${'all-tests'}   | ${2}     | ${false}  | ${true}
            ${4}  | ${'all-tests'}   | ${127}   | ${true}   | ${false}
            ${5}  | ${'all-tests'}   | ${127}   | ${false}  | ${true}
            ${6}  | ${'watch-tests'} | ${0}     | ${false}  | ${true}
            ${7}  | ${'watch-tests'} | ${1}     | ${false}  | ${true}
            ${8}  | ${'watch-tests'} | ${2}     | ${false}  | ${true}
            ${9}  | ${'watch-tests'} | ${127}   | ${true}   | ${false}
            ${10} | ${'watch-tests'} | ${127}   | ${false}  | ${true}
          `('case $case', ({ requestType, exitCode, willRetry, isError }) => {
            expect.hasAssertions();
            mockProcess = initMockProcess(requestType);
            mockProcess.status = ProcessStatus.Running;

            const listener = new RunTestListener(mockSession);
            (listener as any).CmdNotFoundEnv = willRetry;

            listener.onEvent(mockProcess, 'processClose', exitCode);
            const error = isError ? expect.anything() : undefined;
            if (willRetry) {
              expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalled();
            } else {
              expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
                expect.objectContaining({
                  type: 'exit',
                  error,
                })
              );
            }
          });
        });
      });
      describe('can retry with login-shell if process.env is not correct', () => {
        it.each`
          case | useLoginShell | exitCode | willRetry
          ${1} | ${false}      | ${1}     | ${false}
          ${2} | ${false}      | ${127}   | ${true}
          ${3} | ${false}      | ${136}   | ${true}
          ${4} | ${true}       | ${127}   | ${false}
          ${5} | ${'never'}    | ${127}   | ${false}
        `('case $case', ({ useLoginShell, exitCode, willRetry }) => {
          mockSession.context.settings.shell.useLoginShell = useLoginShell;
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', Buffer.from('node: command not found'));
          listener.onEvent(mockProcess, 'processClose', exitCode);

          if (willRetry) {
            expect(mockSession.context.onRunEvent.fire).not.toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'exit',
              })
            );
          } else {
            expect(mockSession.context.onRunEvent.fire).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'exit',
              })
            );
          }
        });
      });
    });
    describe('jest 30 support', () => {
      describe('can restart process if detected jest 30 related error', () => {
        it.each`
          case | output                                                                            | useJest30Before | useJest30After | willRestart
          ${1} | ${'Error in JestTestPatterns'}                                                    | ${null}         | ${null}        | ${false}
          ${2} | ${'Error in JestTestPatterns'}                                                    | ${true}         | ${true}        | ${false}
          ${3} | ${'Process Failed\nOption "testPathPattern" was replaced by "testPathPatterns".'} | ${null}         | ${true}        | ${true}
          ${4} | ${'Process Failed\nOption "testPathPattern" was replaced by "testPathPatterns".'} | ${false}        | ${true}        | ${true}
        `('case $case', ({ output, useJest30Before, useJest30After, willRestart }) => {
          expect.hasAssertions();
          mockSession.context.settings.useJest30 = useJest30Before;
          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));

          expect(mockSession.context.settings.useJest30).toEqual(useJest30After);

          if (willRestart) {
            expect(mockSession.scheduleProcess).toHaveBeenCalledTimes(1);
            expect(mockSession.scheduleProcess).toHaveBeenCalledWith(mockProcess.request);
            expect(mockProcess.stop).toHaveBeenCalled();
          } else {
            expect(mockSession.scheduleProcess).not.toHaveBeenCalled();
            expect(mockProcess.stop).not.toHaveBeenCalled();
          }
        });
      });
      it('can restart process if setting useJest30 for a non jest 30 runtime', () => {
        expect.hasAssertions();
        mockSession.context.settings.useJest30 = true;
        const listener = new RunTestListener(mockSession);

        const output = `whatever\n Unrecognized option "testPathPatterns". Did you mean "testPathPattern"?\n`;
        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));

        expect(mockSession.context.settings.useJest30).toEqual(false);

        expect(mockSession.scheduleProcess).toHaveBeenCalledTimes(1);
        expect(mockSession.scheduleProcess).toHaveBeenCalledWith(mockProcess.request);
        expect(mockProcess.stop).toHaveBeenCalled();
      });
    });
  });
});
