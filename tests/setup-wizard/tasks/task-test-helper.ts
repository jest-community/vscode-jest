import { workspaceFolder } from '../test-helper';

export const createWizardContext = (wsName: string, debugConfigProvider: any) => ({
  debugConfigProvider,
  workspace: workspaceFolder(wsName),
  message: jest.fn(),
});

export const validateTaskConfigUpdate = <T>(
  mockSaveConfig: jest.Mocked<any>,
  key: string,
  callBack?: (value?: T) => void
) => {
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
