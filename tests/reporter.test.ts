jest.unmock('../src/reporter');
import VSCodeJestReporter from '../src/reporter';

describe('VSCodeJest Reporter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    console.log = jest.fn();
  });
  it('reports on RunStart and RunComplete via console.log', () => {
    const reporter = new VSCodeJestReporter();
    reporter.onRunStart({} as any);
    expect(console.log).toBeCalledWith(expect.stringContaining('onRunStart'));
    reporter.onRunComplete(new Set(), {} as any);
    expect(console.log).toBeCalledWith('onRunComplete');
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
      expect(console.log).toBeCalledWith(`onRunStart: numTotalTestSuites: ${numTotalTestSuites}`);
      const result: any = { numTotalTests, numTotalTestSuites };
      reporter.onRunComplete(new Set(), result);
      if (hasError) {
        expect(console.log).toBeCalledWith(expect.stringContaining('onRunComplete: execError'));
      } else {
        expect(console.log).toBeCalledWith('onRunComplete');
      }
    }
  );
  it('getLastError never returns error', () => {
    const reporter = new VSCodeJestReporter();
    expect(reporter.getLastError()).toBeUndefined();
  });
});
