import { ActionMessageType } from '../../src/setup-wizard/types';

export const mockWizardHelper = (mockHelper: jest.Mocked<any>) => {
  const mockShowActionMenu = (...ids: number[]) => {
    ids.forEach((id) => {
      mockHelper.showActionMenu.mockImplementationOnce((items) =>
        items.find((item) => item.id === id)?.action()
      );
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
  return {
    mockShowActionMenu,
    mockShowActionMessage,
    mockHelperSetup,
  };
};

export const throwError = (msg: string) => {
  throw new Error(msg);
};

export const workspaceFolder = (name: string): any => ({
  name,
  uri: { fsPath: '/workspace' },
});
