// alternative to use __mocks__ under src

/**
 * Jest automock will not mock arrow functions, so we need to mock it manually.
 */

/* istanbul ignore next */
jest.mock('../src/output-manager', () => ({
  outputManager: { clearOutputOnRun: jest.fn() },
}));

import { mockRun } from './test-provider/test-helper';
jest.mock('../src/test-provider/jest-test-run', () => {
  return {
    JestTestRun: jest.fn().mockImplementation((name) => mockRun({}, name)),
  };
});
