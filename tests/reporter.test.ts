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
  it.each`
    numTotalTests | numTotalTestSuites | hasError
    ${1}          | ${1}               | ${false}
    ${0}          | ${0}               | ${false}
    ${0}          | ${2}               | ${true}
  `(
    'report runtime exec error in RunComplete',
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
  it('getLastError never returns error', () => {
    const reporter = new VSCodeJestReporter();
    expect(reporter.getLastError()).toBeUndefined();
  });
});
