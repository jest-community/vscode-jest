jest.unmock('../../src/JestExt/process-listeners');
jest.unmock('../../src/JestExt/helper');

import * as vscode from 'vscode';

import {
  ListTestFileListener,
  RunTestListener,
  AbstractProcessListener,
} from '../../src/JestExt/process-listeners';
import { cleanAnsi } from '../../src/helpers';
import * as messaging from '../../src/messaging';

describe('jest process listeners', () => {
  let mockSession: any;
  let mockProcess;
  const mockLogging = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockSession = {
      scheduleProcess: jest.fn(),
      context: {
        settings: {},
        autoRun: {},
        updateStatusBar: jest.fn(),
        workspace: {},
        setupWizardAction: jest.fn(),
        loggingFactory: {
          create: jest.fn(() => mockLogging),
        },
      },
    };
    mockProcess = { request: { type: 'watch' } };
    (cleanAnsi as jest.Mocked<any>).mockImplementation((s) => s);
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
      output                                               | expectedFiles
      ${[]}                                                | ${undefined}
      ${['whatever\n', '["file1", "file', '2", "file3"]']} | ${['file1', 'file2', 'file3']}
      ${['["/a/b", "a/c"]']}                               | ${['/a/b', 'a/c']}
      ${['["/a/b", "a/c"]\n', '["a","b","c"]']}            | ${undefined}
      ${['[a, b]']}                                        | ${'throw'}
    `('can extract and notify file list from valid $output', ({ output, expectedFiles }) => {
      expect.hasAssertions();

      const onResult = jest.fn();
      const listener = new ListTestFileListener(mockSession, onResult);

      output.forEach((m) => listener.onEvent(mockProcess, 'executableOutput', Buffer.from(m)));
      listener.onEvent(mockProcess, 'processClose');

      expect(onResult).toBeCalledTimes(1);

      const [fileNames, error] = onResult.mock.calls[0];
      if (Array.isArray(expectedFiles)) {
        expect(fileNames).toEqual(expectedFiles);
        expect(error).toBeUndefined();
      } else {
        expect(fileNames).toBeUndefined();
        expect(error).not.toBeUndefined();
      }
    });
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
      mockSession.context.updateStatusBar = jest.fn();
      mockProcess = { request: { type: 'watch-tests' } };
    });

    it('can handle test result', () => {
      expect.hasAssertions();
      const listener = new RunTestListener(mockSession);
      const mockData = {};
      listener.onEvent(mockProcess, 'executableJSON', mockData);
      expect(mockSession.context.updateWithData).toBeCalledWith(mockData);
    });
    describe.each`
      output             | stdout   | stderr   | error
      ${'whatever'}      | ${true}  | ${true}  | ${true}
      ${'onRunStart'}    | ${false} | ${false} | ${true}
      ${'onRunComplete'} | ${false} | ${false} | ${true}
      ${'Watch Usage'}   | ${false} | ${false} | ${true}
    `('propagate process output: $output', ({ output, stdout, stderr, error }) => {
      it('from stdout: show=$stdout', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'executableOutput', output);
        if (stdout) {
          expect(mockSession.context.output.append).toBeCalledWith(output);
        } else {
          expect(mockSession.context.output.append).not.toBeCalled();
        }
      });
      it('from stderr: show=$stderr', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'executableStdErr', Buffer.from(output));
        if (stderr) {
          expect(mockSession.context.output.append).toBeCalledWith(output);
        } else {
          expect(mockSession.context.output.append).not.toBeCalled();
        }
      });
      it('from error event: show=$error', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'terminalError', output);
        if (error) {
          expect(mockSession.context.output.appendLine).toBeCalledWith(
            expect.stringContaining(output)
          );
        } else {
          expect(mockSession.context.output.appendLine).not.toBeCalled();
        }
      });
    });

    describe('can clear output and manage running state', () => {
      it('when process start and end', () => {
        expect.hasAssertions();
        const listener = new RunTestListener(mockSession);
        // stdout
        listener.onEvent(mockProcess, 'processStarting');
        expect(mockSession.context.updateStatusBar).toHaveBeenLastCalledWith({ state: 'running' });
        expect(mockSession.context.output.clear).toBeCalledTimes(1);

        listener.onEvent(mockProcess, 'processExit');
        expect(mockSession.context.updateStatusBar).toHaveBeenLastCalledWith({ state: 'done' });
        expect(mockSession.context.output.clear).toBeCalledTimes(1);
      });
      it.each`
        procType             | clearCount
        ${'watch-tests'}     | ${1}
        ${'watch-all-tests'} | ${1}
        ${'all-tests'}       | ${0}
        ${'by-file'}         | ${0}
      `(
        'for watch mode runs, where process do not stop, perform cleaning/reporting also from content',
        ({ procType, clearCount }) => {
          expect.hasAssertions();
          const listener = new RunTestListener(mockSession);
          mockProcess.request.type = procType;

          // stdout
          listener.onEvent(mockProcess, 'executableOutput', 'onRunStart');
          expect(mockSession.context.updateStatusBar).toHaveBeenLastCalledWith({
            state: 'running',
          });
          expect(mockSession.context.output.clear).toBeCalledTimes(clearCount);

          listener.onEvent(mockProcess, 'executableOutput', 'onRunComplete');
          expect(mockSession.context.updateStatusBar).toHaveBeenLastCalledWith({ state: 'done' });
          expect(mockSession.context.output.clear).toBeCalledTimes(clearCount);
        }
      );
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
          (messaging as jest.Mocked<any>).systemErrorMessage = jest.fn();
        });
        it('will show error message with help', () => {
          expect.hasAssertions();

          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'processClose', 1);
          expect(messaging.systemErrorMessage).toBeCalled();
        });
        it('in single-root env, folder name will not be shown in the message', () => {
          expect.hasAssertions();

          (vscode.workspace.workspaceFolders as any) = ['workspace-xyz'];

          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'processClose', 1);
          expect(messaging.systemErrorMessage).toBeCalled();
          const [msg] = (messaging.systemErrorMessage as jest.Mocked<any>).mock.calls[0];
          expect(msg).not.toContain('workspace-xyz');
        });
        it('in multi-root env, folder name will be shown in the message', () => {
          expect.hasAssertions();

          (vscode.workspace.workspaceFolders as any) = ['workspace-xyz', 'workspace-abc'];

          const listener = new RunTestListener(mockSession);

          listener.onEvent(mockProcess, 'processClose', 1);
          expect(messaging.systemErrorMessage).toBeCalled();
          const [msg] = (messaging.systemErrorMessage as jest.Mocked<any>).mock.calls[0];
          expect(msg).toContain('workspace-xyz');
        });
      });
    });
  });
});
