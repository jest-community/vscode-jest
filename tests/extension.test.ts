jest.unmock('../src/extension');

const extensionName = 'jest';
jest.mock('../src/appGlobals', () => ({
  extensionName,
}));

const statusBar = {
  register: jest.fn(() => []),
};
jest.mock('../src/StatusBar', () => ({ statusBar }));

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
  CoverageCodeLensProvider: jest.fn().mockReturnValue({}),
}));

jest.mock('../src/SnapshotCodeLens', () => ({
  registerSnapshotCodeLens: jest.fn(() => []),
  registerSnapshotPreview: jest.fn(() => []),
}));

jest.mock('../src/test-provider/test-item-context-manager', () => ({
  tiContextManager: { registerCommands: jest.fn(() => []) },
}));

const extensionManager = {
  unregisterAllWorkspaces: jest.fn(),
  activate: jest.fn(),
  register: jest.fn(() => []),
};

// tslint:disable-next-line: variable-name
const ExtensionManager = jest.fn();

jest.mock('../src/extensionManager', () => ({
  ExtensionManager,
  getExtensionWindowSettings: jest.fn(() => ({})),
}));

import { activate, deactivate } from '../src/extension';

describe('Extension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ExtensionManager.mockImplementation(() => extensionManager);
  });
  describe('activate()', () => {
    const context: any = {
      subscriptions: {
        push: jest.fn(),
      },
    };

    beforeEach(() => {
      context.subscriptions.push.mockReset();
    });

    it('should instantiate ExtensionManager', () => {
      activate(context);
      expect(ExtensionManager).toHaveBeenCalledTimes(1);
    });

    it('should register statusBar', () => {
      statusBar.register.mockClear();
      activate(context);
      expect(statusBar.register).toHaveBeenCalled();
    });
  });

  describe('deactivate()', () => {
    it('should call unregisterAll on instancesManager', () => {
      deactivate();
      expect(extensionManager.unregisterAllWorkspaces).toHaveBeenCalled();
    });
  });
});
