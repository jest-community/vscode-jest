jest.unmock('../../src/JestProcessManagement/JestProcess');
jest.unmock('../test-helper');
jest.unmock('../../src/JestProcessManagement/helper');
jest.unmock('../../src/helpers');

const mockPlatform = jest.fn();
const mockRelease = jest.fn();
mockRelease.mockReturnValue('');
jest.mock('os', () => ({ platform: mockPlatform, release: mockRelease }));

import { Runner } from 'jest-editor-support';
import { JestProcess, RunnerEvents } from '../../src/JestProcessManagement/JestProcess';
import { EventEmitter } from 'events';
import { mockProcessRequest, mockJestExtContext } from '../test-helper';
import { normalize } from 'path';
import { JestProcessRequest } from '../../src/JestProcessManagement/types';
import { JestTestProcessType } from '../../src/Settings';
jest.unmock('path');
jest.mock('vscode', () => ({
  extensions: {
    getExtension: () => {
      return { extensionPath: normalize('/my/vscode/extensions') };
    },
  },
}));

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
  });

  it('can report its own state via toString()', () => {
    const request = mockProcessRequest('all-tests');
    jestProcess = new JestProcess(extContext, request);
    expect(`${jestProcess}`).toEqual(jestProcess.toString());
    expect(jestProcess.toString()).toMatchInlineSnapshot(
      `"JestProcess: id: all-tests-0, request: {"type":"all-tests","schedule":{"queue":"blocking"},"listener":"function"}; stopReason: undefined"`
    );
  });
  describe('when creating', () => {
    it('create instance with a readonly request', () => {
      const request = mockProcessRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      expect(jestProcess.request).toEqual(request);
      expect(jestProcess.stopReason).toBeUndefined();
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
  });
  describe('when start', () => {
    it('returns a promise that resolved when process closed', async () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');
      const jp = new JestProcess(extContext, request);
      const p = jp.start();

      expect(RunnerClassMock).toHaveBeenCalled();

      closeRunner();
      await expect(p).resolves.not.toThrow();
      expect(jp.stopReason).toEqual('process-end');
    });
    it('will emit processStart event upon starting', () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');
      const jp = new JestProcess(extContext, request);
      jp.start();

      expect(RunnerClassMock).toHaveBeenCalled();
      const [, event] = mockListener.onEvent.mock.calls[0];
      expect(event).toEqual('processStarting');
    });
    it.each`
      event                 | willEndProcess
      ${'processClose'}     | ${true}
      ${'processExit'}      | ${false}
      ${'executableJSON'}   | ${false}
      ${'executableStdErr'} | ${false}
      ${'executableOutput'} | ${false}
      ${'terminalError'}    | ${false}
    `(
      'register and propagate $event to the request.listener',
      async ({ event, willEndProcess }) => {
        expect.hasAssertions();
        const request = mockRequest('all-tests');
        const jp = new JestProcess(extContext, request);
        const p = jp.start();

        // register for each event
        expect(mockRunner.on).toHaveBeenCalledTimes(RunnerEvents.length);

        eventEmitter.emit(event);
        const [process, _event] = mockListener.onEvent.mock.calls[1];
        expect(process).toBe(jp);
        expect(_event).toEqual(event);

        if (!willEndProcess) {
          // end the test
          closeRunner();
        }

        await expect(p).resolves.not.toThrow();
      }
    );

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
      'supports jest process request: $type',
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
      expect(jestProcess.stopReason).toEqual('on-demand');

      closeRunner();

      await expect(pStart).resolves.not.toThrow();
      await expect(pStop).resolves.not.toThrow();

      expect(startDone).toBeTruthy();
      expect(stopDone).toBeTruthy();
      expect(jestProcess.stopReason).toEqual('on-demand');
    });
    it('call stop before start will resolve right away', async () => {
      expect.hasAssertions();
      await expect(jestProcess.stop()).resolves.not.toThrow();
      expect(jestProcess.stopReason).toEqual('on-demand');
    });
  });
});
