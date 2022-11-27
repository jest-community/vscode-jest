import { ActionMessageType } from '../../src/setup-wizard/types';

export const mockWizardHelper = (mockHelper: jest.Mocked<any>): any => {
  const mockShowActionMenu = (...ids: number[]) => {
    ids.forEach((id) => {
      mockHelper.showActionMenu.mockImplementationOnce((items) => {
        for (const item of items) {
          if (item.id === id) {
            return item.action();
          }
          const found = item.buttons?.find((b) => b?.id === id);
          if (found) {
            return found.action();
          }
        }
      });
    });
  };

  const mockShowActionMessage = (msgType: ActionMessageType, id: number) => {
    mockHelper.showActionMessage.mockImplementation((type, _b, ...buttons) => {
      if (type === msgType) {
        return buttons?.find((b) => b.id === id)?.action?.();
      }
    });
  };

  const mockHelperSetup = () => {
    mockHelper.actionItem.mockImplementation((id, label, detail, action) => ({
      id,
      label,
      detail,
      action,
    }));
  };
  const mockSelectWorkspace = (ws?: string) => {
    mockHelper.selectWorkspace.mockImplementation(() => Promise.resolve(ws));
  };
  return {
    mockShowActionMenu,
    mockShowActionMessage,
    mockHelperSetup,
    mockSelectWorkspace,
  };
};

export const throwError = (msg: string): void => {
  throw new Error(msg);
};

export const workspaceFolder = (name: string): any => ({
  name,
  uri: { fsPath: name, path: name },
});
