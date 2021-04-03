jest.unmock('../../src/JestProcessManagement/JestProcess');
jest.unmock('../test-helper');
jest.unmock('../../src/JestProcessManagement/helper');
jest.unmock('../../src/helpers');

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
      `"JestProcess: id: 0, request: {\\"type\\":\\"all-tests\\",\\"schedule\\":{\\"queue\\":\\"blocking\\"},\\"listener\\":\\"function\\"}; stopReason: undefined"`
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
      expect(extContext.loggingFactory.create).toBeCalledTimes(1);
    });
    it('does not start runner upon creation', () => {
      const request = mockProcessRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      expect(RunnerClassMock).not.toHaveBeenCalled();
    });
  });
  describe('when start', () => {
    it('reeturns a promise that resolved when process closed', async () => {
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
      type                 | extraProperty                                                    | startArgs         | includeReporter | extraRunnerOptions
      ${'all-tests'}       | ${undefined}                                                     | ${[false, false]} | ${true}         | ${undefined}
      ${'watch-tests'}     | ${undefined}                                                     | ${[true, false]}  | ${true}         | ${undefined}
      ${'watch-all-tests'} | ${undefined}                                                     | ${[true, true]}   | ${true}         | ${undefined}
      ${'by-file'}         | ${{ testFileNamePattern: '"abc def"' }}                          | ${[false, false]} | ${true}         | ${undefined}
      ${'by-file-test'}    | ${{ testFileNamePattern: '"abc def"', testNamePattern: 'test' }} | ${[false, false]} | ${true}         | ${undefined}
      ${'not-test'}        | ${{ args: ['--listTests'] }}                                     | ${[false, false]} | ${false}        | ${{ args: { args: ['--listTests'], replace: true } }}
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
        expect(options).toEqual(expect.objectContaining(extraRunnerOptions ?? extraProperty ?? {}));
        expect(mockRunner.start).toBeCalledWith(...startArgs);
        closeRunner();
        await p;
      }
    );
    it.each`
      request                                                                                               | expectUpdate
      ${{ type: 'all-tests', updateSnapshot: true }}                                                        | ${true}
      ${{ type: 'all-tests', updateSnapshot: false }}                                                       | ${false}
      ${{ type: 'by-file', updateSnapshot: true, testFileNamePattern: 'abc' }}                              | ${true}
      ${{ type: 'by-file-test', updateSnapshot: true, testFileNamePattern: 'abc', testNamePattern: 'xyz' }} | ${true}
      ${{ type: 'watch-tests', updateSnapshot: true }}                                                      | ${false}
      ${{ type: 'watch-all-tests', updateSnapshot: true }}                                                  | ${false}
    `('can update snapshot with request $request', ({ request, expectUpdate }) => {
      expect.hasAssertions();
      const _request = mockRequest(request.type, request);
      jestProcess = new JestProcess(extContext, _request);
      jestProcess.start();
      const [, options] = RunnerClassMock.mock.calls[0];
      if (expectUpdate) {
        expect(options.args.args).toContain('--updateSnapshot');
      } else {
        expect(options.args).toBeUndefined();
      }
    });
    it('starting on a running process does nothing but returns the same promise', async () => {
      expect.hasAssertions();
      const request = mockRequest('all-tests');
      jestProcess = new JestProcess(extContext, request);
      const p1 = jestProcess.start();
      const p2 = jestProcess.start();

      expect(RunnerClassMock).toBeCalledTimes(1);
      expect(mockRunner.start).toBeCalledTimes(1);
      expect(p1).toBe(p2);
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
