import '../manual-mocks';

jest.dontMock('../../src/test-provider/jest-test-run');
jest.unmock('./test-helper');

import * as vscode from 'vscode';
import { JestTestRun } from '../../src/test-provider/jest-test-run';
import { mockJestProcess } from './test-helper';

jest.useFakeTimers();
jest.spyOn(global, 'setTimeout');

describe('JestTestRun', () => {
  let mockContext: any;
  let jestRun: JestTestRun;
  let mockCreateTestRun: any;
  let mockRequest: any;

  beforeEach(() => {
    mockContext = {
      output: {
        write: jest.fn((text) => text),
      },
      ext: {
        workspace: { name: 'testWorkspace' },
        settings: {
          debugMode: false,
          runMode: { config: { showInlineError: true } },
        },
      },
    };
    mockCreateTestRun = jest
      .fn()
      .mockImplementation((_request: vscode.TestRunRequest, name: string) => ({
        name,
        appendOutput: jest.fn(),
        enqueued: jest.fn(),
        started: jest.fn(),
        errored: jest.fn(),
        failed: jest.fn(),
        passed: jest.fn(),
        skipped: jest.fn(),
        end: jest.fn(),
      }));

    mockRequest = {};
    (vscode.TestRunRequest as jest.Mocked<any>).mockClear();
    (vscode.TestRunRequest as jest.Mocked<any>).mockImplementation(() => mockRequest);
    jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);
  });

  describe('constructor', () => {
    it('should set the name property', () => {
      expect(jestRun.name).toBe('testWorkspace:test:0');
    });
    it('does not create vscode TestRun until it is needed', () => {
      expect(mockCreateTestRun).not.toHaveBeenCalled();
    });
  });

  describe('write', () => {
    it('does not create TestRun if it does not exist', () => {
      const message = 'test message\r\n';
      jestRun.write(message);
      expect(mockContext.output.write).toHaveBeenCalledWith(message, undefined);
      expect(mockCreateTestRun).not.toHaveBeenCalled();
    });

    it('if TestRun exists, the message will be written to both context.output and run', () => {
      const message = 'test message';

      // force the underlying TestRun to be created
      jestRun.enqueued({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run = mockCreateTestRun.mock.results[0].value;

      jestRun.write(message);
      expect(mockContext.output.write).toHaveBeenCalledWith(message, undefined);
      expect(run.appendOutput).toHaveBeenCalledWith(message);
    });
  });

  describe('isClosed', () => {
    it('reflect if there is an active TestRun', () => {
      expect(jestRun.isClosed()).toBe(true);
      jestRun.enqueued({} as any);
      expect(jestRun.isClosed()).toBe(false);
      jestRun.end();
      expect(jestRun.isClosed()).toBe(true);
    });
  });

  describe('supports TestRunProtocol by forwarding to the underlying TestRun', () => {
    let mockTestItem: any;

    beforeEach(() => {
      mockTestItem = {
        id: 'testId',
        label: 'testLabel',
        uri: vscode.Uri.parse('file:///path/to/test/file'),
      };
    });

    describe('enqueued', () => {
      it('should call the enqueued method on the test run', () => {
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.enqueued(mockTestItem);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.enqueued).toHaveBeenCalledWith(mockTestItem);
      });
    });

    describe('started', () => {
      it('should call the started method on the test run', () => {
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.started(mockTestItem);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.started).toHaveBeenCalledWith(mockTestItem);
      });
    });

    describe('errored', () => {
      it('should call the errored method on the test run with the given test item and message', () => {
        const message: any = 'test error message';
        const duration = 100;
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.errored(mockTestItem, message, duration);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.errored).toHaveBeenCalledWith(mockTestItem, message, duration);
      });

      it('should not send message if showInlineError is false', () => {
        const message: any = 'test error message';
        const duration = 100;
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);

        mockContext.ext.settings.runMode.config.showInlineError = false;
        jestRun.errored(mockTestItem, message, duration);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;

        expect(run.errored).toHaveBeenCalledWith(mockTestItem, [], duration);
      });
    });

    describe('failed', () => {
      it('should call the failed method on the test run with the given test item and message', () => {
        const message: any = 'test failure message';
        const duration = 100;
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.failed(mockTestItem, message, duration);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.failed).toHaveBeenCalledWith(mockTestItem, message, duration);
      });

      it('should use an empty message if showInlineError is false', () => {
        const message: any = 'test failure message';
        const duration = 100;
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);

        mockContext.ext.settings.runMode.config.showInlineError = false;
        jestRun.failed(mockTestItem, message, duration);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.failed).toHaveBeenCalledWith(mockTestItem, [], duration);
      });
    });

    describe('passed', () => {
      it('should call the passed method on the test run', () => {
        const duration = 100;
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.passed(mockTestItem, duration);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.passed).toHaveBeenCalledWith(mockTestItem, duration);
      });
    });

    describe('skipped', () => {
      it('should call the skipped method on the test run', () => {
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.skipped(mockTestItem);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(run.skipped).toHaveBeenCalledWith(mockTestItem);
      });
    });

    describe('end', () => {
      it('should do nothing if there is no run', () => {
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.end();
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.isClosed()).toBe(true);
      });
      it('can close a no-process run immediately', () => {
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);
        jestRun.enqueued(mockTestItem);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;
        expect(jestRun.isClosed()).toBe(false);

        jestRun.end();
        expect(jestRun.isClosed()).toBe(true);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        expect(run.end).toHaveBeenCalledTimes(1);
      });
      it('can only close a run after all processes are done', () => {
        const p1 = mockJestProcess('p1');
        const p2 = mockJestProcess('p2');
        jestRun.addProcess(p1);
        jestRun.addProcess(p2);
        jestRun.enqueued(mockTestItem);

        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
        const run = mockCreateTestRun.mock.results[0].value;

        jestRun.end();
        expect(jestRun.isClosed()).toBe(false);
        expect(run.end).toHaveBeenCalledTimes(0);

        jestRun.end({ process: p1 });
        expect(jestRun.isClosed()).toBe(false);
        expect(run.end).toHaveBeenCalledTimes(0);

        // when the last process is closed, the whole run is then closed
        jestRun.end({ process: p2 });
        expect(jestRun.isClosed()).toBe(true);
        expect(run.end).toHaveBeenCalledTimes(1);
      });
      it('with verbose, more information will be logged', () => {
        const process = mockJestProcess('123');
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockContext.ext.settings.debugMode = true;

        jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);
        jestRun.addProcess(process);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(0);

        jestRun.started(mockTestItem);
        expect(mockCreateTestRun).toHaveBeenCalledTimes(1);

        jestRun.end({ process, reason: 'testReason' });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(process.id));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('testReason'));
      });
      describe('when close the process-run with delayed', () => {
        it('will end the run after specified delay', () => {
          jestRun.started(mockTestItem);
          expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
          const run = mockCreateTestRun.mock.results[0].value;
          expect(jestRun.isClosed()).toBe(false);

          // close with 1000 msec delay
          jestRun.end({ process: mockJestProcess('whatever'), delay: 1000 });

          expect(jestRun.isClosed()).toBe(false);
          expect(run.end).not.toHaveBeenCalled();
          expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);

          // forward timer
          jest.runAllTimers();

          expect(run.end).toHaveBeenCalled();
          expect(jestRun.isClosed()).toBe(true);
        });

        it('the subsequent end will cancel any running timer earlier', () => {
          const process = mockJestProcess('123');
          jest.spyOn(global, 'clearTimeout');

          jestRun.addProcess(process);
          jestRun.started(mockTestItem);

          expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
          const run = mockCreateTestRun.mock.results[0].value;

          jestRun.end({ process, delay: 30000 });
          expect(jestRun.isClosed()).toBe(false);

          // advance timer by 1000 msec, the run is still not closed
          jest.advanceTimersByTime(1000);
          expect(jestRun.isClosed()).toBe(false);

          // another end with 1000 msec delay, will cancel the previous 30000 msec delay
          jestRun.end({ process, delay: 1000 });
          expect(global.clearTimeout).toHaveBeenCalledTimes(1);
          expect(jestRun.isClosed()).toBe(false);

          // now advance timer by 1000 msec, the timer will finish and run will be closed
          jest.advanceTimersByTime(1000);
          expect(global.clearTimeout).toHaveBeenCalledTimes(1);
          expect(jestRun.isClosed()).toBe(true);
          expect(run.end).toHaveBeenCalledTimes(1);
        });
        it('with verbose, more information will be logged', () => {
          const process = mockJestProcess('123');
          const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
          mockContext.ext.settings.debugMode = true;

          jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);
          jestRun.addProcess(process);
          expect(mockCreateTestRun).toHaveBeenCalledTimes(0);

          jestRun.started(mockTestItem);
          expect(mockCreateTestRun).toHaveBeenCalledTimes(1);

          jestRun.end({ process, delay: 1000, reason: 'testReason' });
          jest.runAllTimers();

          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(process.id));
          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('testReason'));
        });
      });
    });
  });
  it('print warning for runs re-created after close: this means the test-run will be splitted into multiple TestRun', () => {
    mockContext.ext.settings.debugMode = true;

    jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);

    jestRun.started({} as any);
    expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
    const run1 = mockCreateTestRun.mock.results[0].value;

    // close this run
    jestRun.end();
    expect(jestRun.isClosed()).toEqual(true);
    expect(mockCreateTestRun).toHaveBeenCalledTimes(1);

    // calling error on a closed run will force it to open again
    jestRun.errored({} as any, 'whatever' as any);

    expect(jestRun.isClosed()).toEqual(false);
    expect(mockCreateTestRun).toHaveBeenCalledTimes(2);
    const run2 = mockCreateTestRun.mock.results[1].value;
    expect(run1).not.toBe(run2);
  });
  describe('multi-items run', () => {
    it('ignore skipped tests if there are more than one test to run', () => {
      mockRequest = { include: ['test1', 'test2'] };
      jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);

      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run = mockCreateTestRun.mock.results[0].value;
      expect(run.started).toHaveBeenCalled();

      jestRun.skipped({} as any);
      expect(run.skipped).not.toHaveBeenCalled();
    });
  });
  describe('when request changed', () => {
    it('the next createTestRnn will use the new request', () => {
      jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run1 = mockCreateTestRun.mock.results[0].value;
      expect(run1.started).toHaveBeenCalled();

      jestRun.end();
      expect(run1.end).toHaveBeenCalled();

      const newRequest: any = { include: ['test1'] };
      (vscode.TestRunRequest as jest.Mocked<any>).mockImplementation(() => newRequest);
      jestRun.updateRequest(newRequest);
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(2);
      expect(mockCreateTestRun.mock.calls[1][0]).toEqual(newRequest);
      expect(vscode.TestRunRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('supports continuous test run', () => {
    it('by start/stop underlying TestRun per continuous run session', () => {
      jestRun = new JestTestRun('test', mockContext, mockRequest, mockCreateTestRun);

      // first run
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run1 = mockCreateTestRun.mock.results[0].value;
      expect(run1.started).toHaveBeenCalled();
      jestRun.end();
      expect(run1.end).toHaveBeenCalled();
      expect(vscode.TestRunRequest).toHaveBeenCalledTimes(1);

      // 2nd run
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(2);
      const run2 = mockCreateTestRun.mock.results[1].value;
      expect(run2.started).toHaveBeenCalled();
      jestRun.end();
      expect(run2.end).toHaveBeenCalled();
      expect(vscode.TestRunRequest).toHaveBeenCalledTimes(2);
    });
  });
  describe('cancel', () => {
    it('should cancel the run', () => {
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run = mockCreateTestRun.mock.results[0].value;
      expect(run.started).toHaveBeenCalled();

      jestRun.cancel();
      expect(run.started).toHaveBeenCalled();
      expect(run.end).toHaveBeenCalled();
    });
    it('will stops all processes and timers associated with the run', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const process1 = mockJestProcess('123');
      const process2 = mockJestProcess('456');
      jestRun.started({} as any);
      jestRun.addProcess(process1);
      jestRun.addProcess(process2);
      expect(process1.stop).not.toHaveBeenCalled();
      expect(process2.stop).not.toHaveBeenCalled();
      clearTimeoutSpy.mockClear();

      // a timer will be created
      jestRun.end({ process: process1, delay: 1000 });
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(0);

      jestRun.cancel();
      expect(process1.stop).toHaveBeenCalled();
      expect(process2.stop).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });
    it('cancel a already cancelled run will do nothing', () => {
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalledTimes(1);
      const run = mockCreateTestRun.mock.results[0].value;
      expect(run.started).toHaveBeenCalled();

      jestRun.cancel();
      expect(run.end).toHaveBeenCalledTimes(1);

      jestRun.cancel();
      expect(run.end).toHaveBeenCalledTimes(1);
    });
    it('call run methods after cancel will do nothing', () => {
      jestRun.started({} as any);
      expect(mockCreateTestRun).toHaveBeenCalled();
      const run = mockCreateTestRun.mock.results[0].value;
      expect(run.started).toHaveBeenCalled();
      run.started.mockClear();
      mockCreateTestRun.mockClear();

      jestRun.cancel();
      expect(run.end).toHaveBeenCalled();

      jestRun.started({} as any);
      expect(run.started).not.toHaveBeenCalled();

      jestRun.errored({} as any, {} as any);
      expect(run.errored).not.toHaveBeenCalled();

      jestRun.failed({} as any, {} as any);
      expect(run.failed).not.toHaveBeenCalled();

      jestRun.enqueued({} as any);
      expect(run.enqueued).not.toHaveBeenCalled();

      jestRun.passed({} as any);
      expect(run.passed).not.toHaveBeenCalled();

      jestRun.skipped({} as any);
      expect(run.skipped).not.toHaveBeenCalled();

      // no new run should be created
      expect(mockCreateTestRun).not.toHaveBeenCalled();
    });
  });
});
