jest.unmock('../../src/JestProcessManagement/JestProcess');
jest.unmock('../test-helper');
jest.unmock('../../src/JestProcessManagement/helper');
jest.unmock('../../src/helpers');

const mockPlatform = jest.fn();
const mockRelease = jest.fn();
mockRelease.mockReturnValue('');
jest.mock('os', () => ({ platform: mockPlatform, release: mockRelease }));

import * as vscode from 'vscode';
import { Runner } from 'jest-editor-support';
import { JestProcess, RunnerEvents } from '../../src/JestProcessManagement/JestProcess';
import { EventEmitter } from 'events';
import { mockProcessRequest, mockJestExtContext } from '../test-helper';
import { normalize } from 'path';
import { JestProcessRequest, ProcessStatus } from '../../src/JestProcessManagement/types';
import { JestTestProcessType } from '../../src/Settings';
import { collectCoverage } from '../../src/JestExt/helper';
jest.unmock('path');

describe('JestProcess', () => {
  let jestProcess;
  const RunnerClassMock = Runner as jest.Mocked<any>;
  let mockRunner;
  let eventEmitter;
  const mockListener = { onEvent: jest.fn() };
  let extContext;

  const mockRequest = (type: JestTestProcessType, override?: Partial<JestProcessRequest>) =>
    mockProcessRequest(type, { listener: mockListener, ...(override ?? {}) });

  const closeRunner = () => eventEmitter.emit('processClose');

  beforeEach(() => {
    jest.resetAllMocks();

    // runner mock
    eventEmitter = new EventEmitter();
    mockRunner = {
      on: jest.fn().mockImplementation((event, callback) => {
        eventEmitter.on(event, callback);
        return this;
      }),
      start: jest.fn(),
      closeProcess: jest.fn(),
    };
    RunnerClassMock.mockReturnValueOnce(mockRunner);
    extContext = mockJestExtContext();
    (vscode.extensions.getExtension as jest.Mocked<any>).mockReturnValue({
      extensionPath: normalize('/my/vscode/extensions'),
    });
  });

  it('can report its own state via toString()', () => {
    const request = mockProcessRequest('all-tests');
    jestProcess = new JestProcess(extContext, request);
    expect(`${jestProcess}`).toEqual(jestProcess.toString());
    expect(jestProcess.toString()).toMatchInlineSnapshot(
      `"JestProcess: id: all-tests:0, request: {"type":"all-tests","schedule":{"queue":"blocking"},"listener":"function"}; status: "pending""`
    );
  });
  describe('when creating', () => {
    it('create instance with a readonly request', () => {
      const request = mockProcessRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      expect(jestProcess.request).toEqual(request);
      expect(jestProcess.status).toEqual(ProcessStatus.Pending);
    });
    it('uses loggingFactory to create logging', async () => {
      const request = mockProcessRequest('all-tests');

      jestProcess = new JestProcess(extContext, request);
      expect(extContext.loggingFactory.create).toHaveBeenCalledTimes(1);
    });
    it('does not start runner upon creation', () => {
      const request = mockProcessRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      expect(RunnerClassMock).not.toHaveBeenCalled();
    });
    describe('isWatchMode', () => {
      it.each`
        requestType               | isWatchMode
        ${'all-tests'}            | ${false}
        ${'watch-tests'}          | ${true}
        ${'watch-all-tests'}      | ${true}
        ${'by-file'}              | ${false}
        ${'by-file-test'}         | ${false}
        ${'by-file-pattern'}      | ${false}
        ${'by-file-test-pattern'} | ${false}
        ${'not-test'}             | ${false}
      `('for $requestType isWatchMode=$isWatchMode', ({ requestType, isWatchMode }) => {
        const request = mockProcessRequest(requestType);
        jestProcess = new JestProcess(extContext, request);
        expect(jestProcess.isWatchMode).toEqual(isWatchMode);
      });
    });
    describe('populate an id based on request info', () => {
      it.each`
        requestType      | extraProperty         | expected
        ${'all-tests'}   | ${undefined}          | ${'all-tests:'}
        ${'all-tests'}   | ${{ coverage: true }} | ${'all-tests:with-coverage:'}
        ${'watch-tests'} | ${undefined}          | ${'watch-tests:'}
      `('$requestType:$extraProperty', ({ requestType, extraProperty, expected }) => {
        (collectCoverage as jest.Mocked<any>).mockImplementation((c) => c);
        const request = mockProcessRequest(requestType, extraProperty);
        jestProcess = new JestProcess(extContext, request);
        expect(jestProcess.id).toEqual(expect.stringContaining(expected));
      });
    });
  });
  describe('when start', () => {
    it('returns a promise that resolved when process closed', async () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');
      const jp = new JestProcess(extContext, request);
      const p = jp.start();

      expect(jp.status).toEqual(ProcessStatus.Running);
      expect(RunnerClassMock).toHaveBeenCalled();

      closeRunner();
      await expect(p).resolves.not.toThrow();
      expect(jp.status).toEqual(ProcessStatus.Done);
    });
    describe('register and propagate the following event to the request.listener', () => {
      it.each`
        event                 | willEndProcess
        ${'processClose'}     | ${true}
        ${'processExit'}      | ${false}
        ${'executableJSON'}   | ${false}
        ${'executableStdErr'} | ${false}
        ${'executableOutput'} | ${false}
        ${'terminalError'}    | ${false}
      `('$event', async ({ event, willEndProcess }) => {
        expect.hasAssertions();
        const request = mockRequest('all-tests');
        const jp = new JestProcess(extContext, request);
        const p = jp.start();

        // register for each event
        expect(mockRunner.on).toHaveBeenCalledTimes(RunnerEvents.length);

        eventEmitter.emit(event);
        const [process, _event] = mockListener.onEvent.mock.calls[0];
        expect(process).toBe(jp);
        expect(_event).toEqual(event);

        if (!willEndProcess) {
          // end the test
          closeRunner();
        }

        await expect(p).resolves.not.toThrow();
      });
    });

    describe('Supports the following jest process request type', () => {
      it.each`
        type                      | extraProperty                                                    | startArgs         | includeReporter | extraRunnerOptions
        ${'all-tests'}            | ${undefined}                                                     | ${[false, false]} | ${true}         | ${undefined}
        ${'watch-tests'}          | ${undefined}                                                     | ${[true, false]}  | ${true}         | ${undefined}
        ${'watch-all-tests'}      | ${undefined}                                                     | ${[true, true]}   | ${true}         | ${undefined}
        ${'by-file'}              | ${{ testFileName: '"c:\\a\\b.ts"' }}                             | ${[false, false]} | ${true}         | ${{ args: { args: ['--runTestsByPath'] }, testFileNamePattern: '"C:\\a\\b.ts"' }}
        ${'by-file'}              | ${{ testFileName: '"c:\\a\\b.ts"', notTestFile: true }}          | ${[false, false]} | ${true}         | ${{ args: { args: ['--findRelatedTests', '"C:\\a\\b.ts"'] } }}
        ${'by-file-test'}         | ${{ testFileName: '"/a/b.js"', testNamePattern: 'a test' }}      | ${[false, false]} | ${true}         | ${{ args: { args: ['--runTestsByPath'] }, testFileNamePattern: '"/a/b.js"', testNamePattern: 'a\\ test' }}
        ${'by-file-pattern'}      | ${{ testFileNamePattern: '"c:\\a\\b.ts"' }}                      | ${[false, false]} | ${true}         | ${{ args: { args: ['--testPathPattern', '"c:\\\\a\\\\b\\.ts"'] } }}
        ${'by-file-test-pattern'} | ${{ testFileNamePattern: '/a/b.js', testNamePattern: 'a test' }} | ${[false, false]} | ${true}         | ${{ args: { args: ['--testPathPattern', '"/a/b\\.js"'] }, testNamePattern: 'a\\ test' }}
        ${'not-test'}             | ${{ args: ['--listTests', '--watchAll=false'] }}                 | ${[false, false]} | ${false}        | ${{ args: { args: ['--listTests'], replace: true } }}
      `(
        '$type',
        async ({ type, extraProperty, startArgs, includeReporter, extraRunnerOptions }) => {
          expect.hasAssertions();
          const request = mockRequest(type, extraProperty);
          jestProcess = new JestProcess(extContext, request);
          const p = jestProcess.start();
          const [, options] = RunnerClassMock.mock.calls[0];
          if (includeReporter) {
            expect(options.reporters).toEqual([
              'default',
              `"${normalize('/my/vscode/extensions/out/reporter.js')}"`,
            ]);
          } else {
            expect(options.reporters).toBeUndefined();
          }

          if (extraRunnerOptions) {
            const { args, ...restOptions } = extraRunnerOptions;
            expect(options).toEqual(expect.objectContaining(restOptions));
            const { args: flags, replace } = args;
            expect(options.args.replace).toEqual(replace);
            expect(options.args.args).toEqual(expect.arrayContaining(flags));
          }
          expect(mockRunner.start).toHaveBeenCalledWith(...startArgs);
          closeRunner();
          await p;
        }
      );
    });
    describe('supports jest v30 options', () => {
      it.each`
        case | type                      | extraProperty                                             | useJest30 | expectedOption
        ${1} | ${'by-file-pattern'}      | ${{ testFileNamePattern: 'abc' }}                         | ${null}   | ${'--testPathPattern'}
        ${2} | ${'by-file-pattern'}      | ${{ testFileNamePattern: 'abc' }}                         | ${true}   | ${'--testPathPatterns'}
        ${3} | ${'by-file-pattern'}      | ${{ testFileNamePattern: 'abc' }}                         | ${false}  | ${'--testPathPattern'}
        ${4} | ${'by-file-test-pattern'} | ${{ testFileNamePattern: 'abc', testNamePattern: 'abc' }} | ${null}   | ${'--testPathPattern'}
        ${5} | ${'by-file-test-pattern'} | ${{ testFileNamePattern: 'abc', testNamePattern: 'abc' }} | ${true}   | ${'--testPathPatterns'}
        ${6} | ${'by-file-test-pattern'} | ${{ testFileNamePattern: 'abc', testNamePattern: 'abc' }} | ${false}  | ${'--testPathPattern'}
      `(
        'case $case: generate the correct TestPathPattern(s) option',
        ({ type, extraProperty, useJest30, expectedOption }) => {
          expect.hasAssertions();
          extContext.settings.useJest30 = useJest30;
          const request = mockRequest(type, extraProperty);
          const jp = new JestProcess(extContext, request);
          jp.start();
          const [, options] = RunnerClassMock.mock.calls[0];
          expect(options.args.args).toContain(expectedOption);
        }
      );
    });
    describe('common flags', () => {
      it.each`
        type                      | extraProperty                                                    | excludeWatch | withColors
        ${'all-tests'}            | ${undefined}                                                     | ${true}      | ${true}
        ${'watch-tests'}          | ${undefined}                                                     | ${false}     | ${true}
        ${'watch-all-tests'}      | ${undefined}                                                     | ${false}     | ${true}
        ${'by-file'}              | ${{ testFileName: '"c:\\a\\b.ts"' }}                             | ${true}      | ${true}
        ${'by-file-test'}         | ${{ testFileName: '"/a/b.js"', testNamePattern: 'a test' }}      | ${true}      | ${true}
        ${'by-file-pattern'}      | ${{ testFileNamePattern: '"c:\\a\\b.ts"' }}                      | ${true}      | ${true}
        ${'by-file-test-pattern'} | ${{ testFileNamePattern: '/a/b.js', testNamePattern: 'a test' }} | ${true}      | ${true}
        ${'not-test'}             | ${{ args: ['--listTests', '--watchAll=false'] }}                 | ${true}      | ${false}
      `(
        'request $type: excludeWatch:$excludeWatch, withColors:$withColors',
        async ({ type, extraProperty, excludeWatch, withColors }) => {
          expect.hasAssertions();
          const request = mockRequest(type, extraProperty);
          jestProcess = new JestProcess(extContext, request);
          const p = jestProcess.start();
          closeRunner();
          await p;

          const [, options] = RunnerClassMock.mock.calls[0];
          if (withColors) {
            expect(options.args.args).toContain('--colors');
          } else {
            expect(options.args.args).not.toContain('--colors');
          }
          if (excludeWatch) {
            expect(options.args.args).toContain('--watchAll=false');
          } else {
            expect(options.args.args).not.toContain('--watchAll=false');
          }
        }
      );
    });
    it.each`
      request                                                                                                       | expectUpdate
      ${{ type: 'all-tests', updateSnapshot: true }}                                                                | ${true}
      ${{ type: 'all-tests', updateSnapshot: false }}                                                               | ${false}
      ${{ type: 'by-file', updateSnapshot: true, testFileName: 'abc' }}                                             | ${true}
      ${{ type: 'by-file-pattern', updateSnapshot: true, testFileNamePattern: 'abc' }}                              | ${true}
      ${{ type: 'by-file-test', updateSnapshot: true, testFileName: 'abc', testNamePattern: 'xyz' }}                | ${true}
      ${{ type: 'by-file-test-pattern', updateSnapshot: true, testFileNamePattern: 'abc', testNamePattern: 'xyz' }} | ${true}
      ${{ type: 'watch-tests', updateSnapshot: true }}                                                              | ${false}
      ${{ type: 'watch-all-tests', updateSnapshot: true }}                                                          | ${false}
    `('can update snapshot with request $request', ({ request, expectUpdate }) => {
      expect.hasAssertions();
      const _request = mockRequest(request.type, request);
      jestProcess = new JestProcess(extContext, _request);
      jestProcess.start();
      const [, options] = RunnerClassMock.mock.calls[0];
      if (expectUpdate) {
        expect(options.args.args).toContain('--updateSnapshot');
      } else {
        expect(options.args.args).not.toContain('--updateSnapshot');
      }
    });
    it('starting on a running process does nothing but returns the same promise', () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      const p1 = jestProcess.start();
      const p2 = jestProcess.start();

      expect(RunnerClassMock).toHaveBeenCalledTimes(1);
      expect(mockRunner.start).toHaveBeenCalledTimes(1);
      expect(p1).toBe(p2);
    });
    it('starting a cancelled process will resolved immediate', async () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');

      jestProcess = new JestProcess(extContext, request);
      jestProcess.stop();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
      await expect(jestProcess.start()).resolves.not.toThrow();
      expect(RunnerClassMock).not.toHaveBeenCalled();
    });
    describe('can prepare testNamePattern for used in corresponding spawned shell', () => {
      it.each`
        platform    | shell           | testNamePattern                   | expected
        ${'win32'}  | ${undefined}    | ${'with special $character.abc*'} | ${'"with special \\$character\\.abc\\*"'}
        ${'win32'}  | ${'CMD.EXE'}    | ${'with special $character.abc*'} | ${'"with special \\$character\\.abc\\*"'}
        ${'win32'}  | ${'powershell'} | ${'with special $character.abc*'} | ${"'with special \\$character\\.abc\\*'"}
        ${'darwin'} | ${undefined}    | ${'with special $character.abc*'} | ${'with\\ special\\ \\\\\\$character\\\\.abc\\\\\\*'}
        ${'darwin'} | ${'zsh'}        | ${'with special $character.abc*'} | ${'with\\ special\\ \\\\\\$character\\\\.abc\\\\\\*'}
        ${'win32'}  | ${undefined}    | ${'with "$double quote"'}         | ${'"with ""\\$double quote"""'}
        ${'win32'}  | ${'powershell'} | ${'with "$double quote"'}         | ${'\'with ""\\$double quote""\''}
        ${'linux'}  | ${'bash'}       | ${'with "$double quote"'}         | ${'with\\ \\"\\\\\\$double\\ quote\\"'}
        ${'win32'}  | ${undefined}    | ${"with '$single quote'"}         | ${'"with \'\\$single quote\'"'}
        ${'win32'}  | ${'powershell'} | ${"with '$single quote'"}         | ${"'with ''\\$single quote'''"}
        ${'darwin'} | ${'bash'}       | ${"with '$single quote'"}         | ${"with\\ \\'\\\\\\$single\\ quote\\'"}
        ${'darwin'} | ${'bash'}       | ${'with single `backtick'}        | ${'with\\ single\\ \\`backtick'}
      `(
        'convert "$testNamePattern" on $platform, $shell',
        ({ platform, shell, testNamePattern, expected }) => {
          expect.hasAssertions();
          mockPlatform.mockReturnValue(platform);
          const request = mockRequest('by-file-test-pattern', {
            type: 'by-file-test-pattern',
            testFileNamePattern: 'abc',
            testNamePattern,
          });
          extContext.settings.shell.toSetting.mockReturnValue(shell);
          jestProcess = new JestProcess(extContext, request);
          jestProcess.start();
          const [, options] = RunnerClassMock.mock.calls[0];
          expect(options.testNamePattern).toEqual(expected);
        }
      );
    });
    it('uses different output suffix for blocking-2 queue', () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');

      const jestProcess1 = new JestProcess(extContext, request);
      jestProcess1.start();
      expect(extContext.createRunnerWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ outputFileSuffix: undefined })
      );

      const request2 = mockRequest('by-file', { testFileName: 'abc' });
      request2.schedule.queue = 'blocking-2';
      const jestProcess2 = new JestProcess(extContext, request2);
      jestProcess2.start();
      expect(extContext.createRunnerWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ outputFileSuffix: expect.stringContaining('2') })
      );
    });
    describe('can pass on coverage info from request', () => {
      it.each`
        requestType               | extraProperty                                                    | canPassCoverage
        ${'all-tests'}            | ${undefined}                                                     | ${true}
        ${'watch-tests'}          | ${undefined}                                                     | ${true}
        ${'watch-all-tests'}      | ${undefined}                                                     | ${true}
        ${'by-file'}              | ${{ testFileName: '"c:\\a\\b.ts"' }}                             | ${true}
        ${'by-file-test'}         | ${{ testFileName: '"/a/b.js"', testNamePattern: 'a test' }}      | ${true}
        ${'by-file-pattern'}      | ${{ testFileNamePattern: '"c:\\a\\b.ts"' }}                      | ${true}
        ${'by-file-test-pattern'} | ${{ testFileNamePattern: '/a/b.js', testNamePattern: 'a test' }} | ${true}
        ${'not-test'}             | ${{ args: ['--listTests', '--watchAll=false'] }}                 | ${false}
      `('$requestType', ({ requestType, extraProperty, canPassCoverage }) => {
        expect.hasAssertions();
        (collectCoverage as jest.Mocked<any>).mockImplementation((c) => c);
        // when no coverage
        let req = mockRequest(requestType, extraProperty);
        jestProcess = new JestProcess(extContext, req);
        jestProcess.start();
        expect(extContext.createRunnerWorkspace).not.toHaveBeenCalledWith(
          expect.objectContaining({ collectCoverage: true })
        );

        // when with coverage
        req = mockRequest(requestType, { ...extraProperty, coverage: true });
        jestProcess = new JestProcess(extContext, req);
        jestProcess.start();
        if (canPassCoverage) {
          expect(extContext.createRunnerWorkspace).toHaveBeenCalledWith(
            expect.objectContaining({ collectCoverage: true })
          );
        } else {
          expect(extContext.createRunnerWorkspace).not.toHaveBeenCalledWith(
            expect.objectContaining({ collectCoverage: true })
          );
        }
      });
    });
  });

  describe('to interrupt the process', () => {
    //   const closeProcessMock = jest.fn();

    beforeEach(() => {
      const request = mockRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
    });
    it('call stop() to force the runner to exit and update the stopReason accordingly', async () => {
      expect.hasAssertions();
      let startDone = false;
      let stopDone = false;
      const pStart = jestProcess.start();
      pStart.then(() => {
        startDone = true;
      });
      const pStop = jestProcess.stop();
      pStop.then(() => {
        stopDone = true;
      });

      // they are the same promise actually
      expect(pStart).toBe(pStop);

      expect(mockRunner.closeProcess).toHaveBeenCalledTimes(1);
      expect(startDone).toBeFalsy();
      expect(stopDone).toBeFalsy();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);

      closeRunner();

      await expect(pStart).resolves.not.toThrow();
      await expect(pStop).resolves.not.toThrow();

      expect(startDone).toBeTruthy();
      expect(stopDone).toBeTruthy();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
    });
    it('call stop before start will resolve right away', async () => {
      expect.hasAssertions();
      await expect(jestProcess.stop()).resolves.not.toThrow();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
    });
  });
  describe('autoStop', () => {
    let clearTimeoutSpy;
    let stopSpy;
    beforeAll(() => {
      jest.useFakeTimers();
    });
    beforeEach(() => {
      const request = mockRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      stopSpy = jest.spyOn(jestProcess, 'stop');
      clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    });
    it('should stop the process after a delay', () => {
      jestProcess.start();
      jestProcess.autoStop(30000);

      expect(jestProcess.status).toEqual(ProcessStatus.Running);

      jest.advanceTimersByTime(30000);

      expect(stopSpy).toHaveBeenCalled();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
    });

    it('should call the onStop callback when the process is force closed', () => {
      const onStopMock = jest.fn();
      jestProcess.start();
      jestProcess.autoStop(30000, onStopMock);

      expect(jestProcess.status).toEqual(ProcessStatus.Running);

      jest.advanceTimersByTime(30000);

      expect(stopSpy).toHaveBeenCalled();
      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
      expect(onStopMock).toHaveBeenCalledWith(jestProcess);
    });

    it('should not stop the process if it is not running', () => {
      jestProcess.autoStop(30000);

      expect(jestProcess.status).not.toEqual(ProcessStatus.Running);

      jest.advanceTimersByTime(30000);

      expect(jestProcess.status).not.toEqual(ProcessStatus.Cancelled);
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('will clear previous timer if called again', () => {
      jestProcess.start();
      jestProcess.autoStop(30000);

      expect(jestProcess.status).toEqual(ProcessStatus.Running);
      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      jestProcess.autoStop(10000);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(jestProcess.status).toEqual(ProcessStatus.Running);

      jest.advanceTimersByTime(10000);

      expect(jestProcess.status).toEqual(ProcessStatus.Cancelled);
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
    it('if process ends before the autoStop timer, it will clear the timer', () => {
      jestProcess.start();
      jestProcess.autoStop(30000);
      closeRunner();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(30000);
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });
});
