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
    it.each`
      numTotalTests | numTotalTestSuites | hasError
      ${1}          | ${1}               | ${false}
      ${0}          | ${0}               | ${false}
      ${0}          | ${2}               | ${true}
    `(
      'version < 29.1.2: ($numTotalTests, $numTotalTestSuites)',
      ({ numTotalTests, numTotalTestSuites, hasError }) => {
        const reporter = new VSCodeJestReporter();
        const args: any = { numTotalTestSuites };
        reporter.onRunStart(args);
        expect(process.stderr.write).toHaveBeenCalledWith(
          `onRunStart: numTotalTestSuites: ${numTotalTestSuites}\r\n`
        );
        const result: any = { numTotalTests, numTotalTestSuites };
        reporter.onRunComplete(new Set(), result);
        if (hasError) {
          expect(process.stderr.write).toHaveBeenCalledWith(
            expect.stringContaining('onRunComplete: execError')
          );
        } else {
          expect(process.stderr.write).toHaveBeenCalledWith('onRunComplete\r\n');
        }
      }
    );
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
  it('getLastError never returns error', () => {
    const reporter = new VSCodeJestReporter();
    expect(reporter.getLastError()).toBeUndefined();
  });
});
