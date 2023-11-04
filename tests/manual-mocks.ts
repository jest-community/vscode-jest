// alternative to use __mocks__ under src

/**
 * Jest automock will not mock arrow functions, so we need to mock it manually.
 */

/* istanbul ignore next */
jest.mock('../src/output-manager', () => ({
  outputManager: { clearOutputOnRun: jest.fn() },
}));

jest.mock('../src/test-provider/jest-test-run', () => {
  return {
    JestTestRun: jest.fn().mockImplementation((name: string) => {
      return {
        name,
        enqueued: jest.fn(),
        started: jest.fn(),
        errored: jest.fn(),
        failed: jest.fn(),
        passed: jest.fn(),
        skipped: jest.fn(),
        end: jest.fn(),
        write: jest.fn(),
        addProcess: jest.fn(),
        isClosed: jest.fn(() => false),
        updateRequest: jest.fn(),
      };
    }),
  };
});
