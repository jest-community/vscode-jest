jest.unmock('../src/extension');

const extensionName = 'jest';
jest.mock('../src/appGlobals', () => ({
  extensionName,
}));

const statusBar = {
  register: jest.fn(() => []),
};
jest.mock('../src/StatusBar', () => ({ statusBar }));

const languageProvider = {
  register: jest.fn(() => []),
};
jest.mock('../src/language-provider', () => languageProvider);

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
  CoverageCodeLensProvider: jest.fn().mockReturnValue({}),
}));

jest.mock('../src/test-provider/test-item-context-manager', () => ({
  tiContextManager: { registerCommands: jest.fn(() => []) },
}));
const mockOutputManager = {
  register: jest.fn().mockReturnValue([]),
};
jest.mock('../src/output-manager', () => ({
  outputManager: mockOutputManager,
}));

const extensionManager = {
  unregisterAllWorkspaces: jest.fn(),
  activate: jest.fn(),
  register: jest.fn(() => []),
  deleteAllExtensions: jest.fn(),
  getByName: jest.fn(),
};

// tslint:disable-next-line: variable-name
const mockExtensionManager = {
  ExtensionManager: jest.fn(() => extensionManager),
  getExtensionWindowSettings: jest.fn(() => ({})),
};

jest.mock('../src/extension-manager', () => mockExtensionManager);

import { activate, deactivate } from '../src/extension';

describe('Extension', () => {
  const context: any = {
    subscriptions: {
      push: jest.fn(),
    },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    // ExtensionManager.mockImplementation(() => extensionManager);
  });
  describe('activate()', () => {
    beforeEach(() => {
      context.subscriptions.push.mockReset();
    });

    it('should instantiate ExtensionManager', () => {
      activate(context);
      expect(mockExtensionManager.ExtensionManager).toHaveBeenCalledTimes(1);
    });

    it('should register statusBar', () => {
      statusBar.register.mockClear();
      activate(context);
      expect(statusBar.register).toHaveBeenCalled();
      const [f]: any[] = statusBar.register.mock.calls[0];
      f('whatever');
      expect(extensionManager.getByName).toHaveBeenCalledWith('whatever');
    });
    it('should register language provider', () => {
      activate(context);
      expect(languageProvider.register).toHaveBeenCalledTimes(1);
    });
    it('should register outputManager', () => {
      activate(context);
      expect(mockOutputManager.register).toHaveBeenCalled();
    });
  });

  describe('deactivate()', () => {
    it('should call unregisterAll on instancesManager', () => {
      activate(context);
      deactivate();
      expect(extensionManager.deleteAllExtensions).toHaveBeenCalled();
    });
  });
});
