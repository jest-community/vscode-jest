jest.unmock('../../src/test-provider/test-provider-helper');
jest.unmock('../../src/test-provider/test-provider-helper');
jest.unmock('./test-helper');

// import * as vscode from 'vscode';
import { JestTestRun } from '../../src/test-provider/test-provider-helper';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-helper';
import { mockController, mockExtExplorerContext } from './test-helper';

describe('JestTestRun', () => {
  let context, controllerMock, vRun, item;
  beforeEach(() => {
    jest.resetAllMocks();
    controllerMock = mockController();
    const profiles: any = [{ tag: { id: 'run' } }, { tag: { id: 'debug' } }];
    context = new JestTestProviderContext(mockExtExplorerContext('ws-1'), controllerMock, profiles);
    vRun = controllerMock.createTestRun({}, 'whatever');
    item = {};
  });
  it('can deetect status update after run is closed', () => {
    const jestRun = new JestTestRun(context, vRun);
    jestRun.enqueued(item);
    expect(vRun.enqueued).toHaveBeenCalled();

    jestRun.passed(item);
    expect(vRun.passed).toHaveBeenCalled();

    // end the run
    jestRun.end();
    expect(jestRun.isClosed()).toBeTruthy();
    expect(vRun.end).toHaveBeenCalled();

    //update state now should throw exception
    expect(() => jestRun.passed(item)).toThrow();
  });
  describe('can chain JestTestRun backed by a single vscode Run', () => {
    let jestRun1, jestRun2, request;
    beforeEach(() => {
      request = {};
      jestRun1 = new JestTestRun(context, vRun, { request });
      jestRun2 = new JestTestRun(context, jestRun1);
    });

    it('both are backed by the same vscode.TestRun', () => {
      expect(jestRun1.vscodeRun).toBe(jestRun2.vscodeRun);
    });
    it('request attribute is a deep attribute', () => {
      expect(jestRun1.request).toBe(request);
      expect(jestRun2.request).toBe(request);
    });
    it('close the top of the chain will close the underlying vscodeRun and mark isClose() state', () => {
      jestRun2.end();

      expect(jestRun2.isClosed()).toBeTruthy();
      expect(jestRun1.isClosed()).toBeTruthy();
      expect(jestRun2.vscodeRun).toBeUndefined();
      expect(jestRun1.vscodeRun).toBeUndefined();
    });
    it('after close other attributes are still accessible', () => {
      jestRun2.end();
      expect(jestRun1.request).toBe(request);
      expect(jestRun2.request).toBe(request);
    });
  });
});
