export interface ExtErrorDef {
  code: number;
  type: 'error' | 'warn';
  desc: string;
  helpLink: string;
}

const BASE_URL = 'https://github.com/jest-community/vscode-jest/blob/master/README.md';
export const GENERIC_ERROR: ExtErrorDef = {
  code: 1,
  type: 'error',
  desc: 'jest test run failed',
  helpLink: `${BASE_URL}#troubleshooting`,
};
export const CMD_NOT_FOUND: ExtErrorDef = {
  code: 2,
  type: 'error',
  desc: 'jest process failed to start, most likely due to env or project configuration issues',
  helpLink: `${BASE_URL}#jest-failed-to-run`,
};
export const LONG_RUNNING_TESTS: ExtErrorDef = {
  code: 3,
  type: 'warn',
  desc: 'jest test run exceed the configured threshold ("jest.monitorLongRun") ',
  helpLink: `${BASE_URL}#what-to-do-with-long-running-tests-warning`,
};

export const getExitErrorDef = (exitCode?: number): ExtErrorDef | undefined => {
  if (exitCode === 127) {
    return CMD_NOT_FOUND;
  }
};
