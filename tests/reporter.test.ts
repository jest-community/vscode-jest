jest.unmock('../src/reporter');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VSCodeJestReporter = require('../src/reporter');

describe('VSCodeJest Reporter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.stderr.write = jest.fn();
  });
  it('reports on RunStart and RunComplete via console.log', () => {
    const reporter = new VSCodeJestReporter();
    reporter.onRunStart({} as any);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('onRunStart'));
    reporter.onRunComplete(new Set(), {} as any);
    expect(process.stderr.write).toHaveBeenCalledWith('onRunComplete\r\n');
  });
  describe('report runtime exec error', () => {
    it('version >= 29.1.2', () => {
      const reporter = new VSCodeJestReporter();
      const args: any = { numTotalTestSuites: 10 };
      reporter.onRunStart(args);

      const result: any = { runExecError: { message: 'some error' } };
      reporter.onRunComplete(new Set(), result);
      const output = (process.stderr.write as jest.Mocked<any>).mock.calls[1][0];

      expect(output).toContain('onRunComplete: execError');
      expect(output).toContain('some error');
    });
  });
  describe('report test error status', () => {
    let writeSpy: any;
    beforeEach(() => {
      writeSpy = jest.spyOn(process.stderr, 'write');
    });
    it('report error if numFailingTests > 0', () => {
      const reporter = new VSCodeJestReporter();

      let testResult: any = { numFailingTests: 0 };
      reporter.onTestFileResult({} as any, testResult, {} as any);
      expect(writeSpy).not.toHaveBeenCalled();

      testResult = { numFailingTests: 1 };
      reporter.onTestFileResult({} as any, testResult, {} as any);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('onTestFileResult'));
    });
    it('report error if there is execError > 0', () => {
      const reporter = new VSCodeJestReporter();

      let testResult: any = {};
      reporter.onTestFileResult({} as any, testResult, {} as any);
      expect(writeSpy).not.toHaveBeenCalled();

      testResult = { testExecError: {} };
      reporter.onTestFileResult({} as any, testResult, {} as any);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('onTestFileResult'));
    });
  });

  it('getLastError never returns error', () => {
    const reporter = new VSCodeJestReporter();
    expect(reporter.getLastError()).toBeUndefined();
  });
});
