jest.unmock('../src/reporter');
import VSCodeJestReporter from '../src/reporter';

describe('VSCodeJest Reporter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    console.log = jest.fn();
  });
  it('reports on RunStart and RunComplete via console.log', () => {
    const reporter = new VSCodeJestReporter({});
    reporter.onRunStart();
    expect(console.log).toBeCalledWith('onRunStart');
    reporter.onRunComplete(new Set(), {} as any);
    expect(console.log).toBeCalledWith('onRunComplete');
  });
  it('reports ElapsedTime with minimal reporting interval', () => {
    const reporter = new VSCodeJestReporter({}, { reportingInterval: 20000 });
    const mockNow = jest.fn();
    Date.now = mockNow;

    mockNow.mockReturnValueOnce(1000);
    reporter.onRunStart();
    expect(console.log).toBeCalledWith('onRunStart');

    // nothing should be logged
    mockNow.mockReturnValueOnce(15000);
    reporter.onTestFileStart();
    expect(console.log).toBeCalledTimes(1);
    expect(console.log).not.toBeCalledWith('ElapsedTime: 14s');

    // when exceed reporting interval, it should output elapsed time
    mockNow.mockReturnValueOnce(23000);
    reporter.onTestFileStart();
    expect(console.log).toBeCalledTimes(2);
    expect(console.log).toBeCalledWith('ElapsedTime: 22s');
  });
  it.each`
    numTotalTests | numTotalTestSuites | hasError
    ${1}          | ${1}               | ${false}
    ${0}          | ${0}               | ${false}
    ${0}          | ${2}               | ${true}
  `(
    'report runtime exec error in RunComplete',
    ({ numTotalTests, numTotalTestSuites, hasError }) => {
      const reporter = new VSCodeJestReporter({});
      reporter.onRunStart();
      expect(console.log).toBeCalledWith('onRunStart');
      const result: any = { numTotalTests, numTotalTestSuites };
      reporter.onRunComplete(new Set(), result);
      if (hasError) {
        expect(console.log).toBeCalledWith('onRunComplete: with execError');
      } else {
        expect(console.log).toBeCalledWith('onRunComplete');
      }
    }
  );
});
