/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { workspaceFolder } from '../test-helper';
import * as path from 'path';

export const createWizardContext = (debugConfigProvider: any, wsName?: string): any => ({
  debugConfigProvider,
  vscodeContext: {
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
  },
  workspace: wsName ? workspaceFolder(wsName) : undefined,
  message: jest.fn(),
});

export const validateTaskConfigUpdate = <T>(
  mockSaveConfig: jest.Mocked<any>,
  key: string,
  callBack?: (value?: T) => void
): any => {
  if (!callBack) {
    expect(mockSaveConfig).not.toHaveBeenCalled();
    return;
  }
  const entries = mockSaveConfig.mock.calls[0];
  let called = false;
  entries.forEach((entry) => {
    const { name, value } = entry;
    if (name === key) {
      callBack(value);
      called = true;
    }
  });
  if (!called) {
    callBack();
  }
};

export const toUri = (...pathParts: string[]): any => ({
  fsPath: path.join(...pathParts),
  path: pathParts.join('/'),
});
