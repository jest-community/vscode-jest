import * as vscode from 'vscode';
const mockConfig = {
  get: jest.fn(),
  update: jest.fn(),
};
const mockWorkspace = {
  getConfiguration: jest.fn().mockReturnValue(mockConfig),
  onDidChangeConfiguration: jest.fn(),
};
(vscode.workspace as jest.Mocked<any>) = mockWorkspace;

jest.dontMock('../src/output-manager');

import { OutputManager, DefaultJestOutputSetting } from '../src/output-manager';

describe('OutputManager', () => {
  const getOutputConfig = (om: OutputManager) => {
    mockConfig.update.mockClear();
    om.save();
    const config = mockConfig.update.mock.calls[0][1];
    return config;
  };
  let showWarningMessageSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    showWarningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage');
  });

  describe('constructor', () => {
    describe('with outputConfig', () => {
      describe('can resolve outputConfig settings', () => {
        it.each`
          case | outputConfig                                               | expected
          ${1} | ${undefined}                                               | ${DefaultJestOutputSetting}
          ${2} | ${'neutral'}                                               | ${DefaultJestOutputSetting}
          ${3} | ${'terminal-based'}                                        | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'none' }}
          ${4} | ${'test-results-based'}                                    | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${5} | ${{ revealOn: 'error' }}                                   | ${{ revealOn: 'error', revealWithFocus: 'none', clearOnRun: 'none' }}
          ${6} | ${{ revealWithFocus: 'terminal' }}                         | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'none' }}
          ${7} | ${{ revealWithFocus: 'terminal', clearOnRun: 'terminal' }} | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'terminal' }}
          ${8} | ${'wrong-type'}                                            | ${DefaultJestOutputSetting}
        `('case $case', ({ outputConfig, expected }) => {
          mockConfig.get.mockImplementationOnce(() => outputConfig);
          const om = new OutputManager();
          const config = getOutputConfig(om);
          expect(config).toEqual(expected);
        });
      });
      it('will ignore legacy settings', () => {
        mockConfig.get.mockImplementation((key: string) => {
          if (key === 'outputConfig') {
            return 'terminal-based';
          }
          if (key === 'openTesting') {
            return 'openOnTestStart';
          }
          return undefined;
        });
        const om = new OutputManager();
        const config = getOutputConfig(om);
        expect(config).toEqual({
          revealOn: 'run',
          revealWithFocus: 'terminal',
          clearOnRun: 'none',
        });
      });
    });
    describe('without outputConfig', () => {
      describe('create a backward compatible config based on the legacy settings', () => {
        it.each`
          case  | openTesting            | autoClearTerminal | autoRevealOutput   | expected
          ${1}  | ${'openOnTestStart'}   | ${undefined}      | ${undefined}       | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${2}  | ${'openOnTestStart'}   | ${true}           | ${undefined}       | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'terminal' }}
          ${3}  | ${'openOnTestStart'}   | ${true}           | ${'off'}           | ${{ revealOn: 'demand', revealWithFocus: 'none', clearOnRun: 'terminal' }}
          ${4}  | ${'neverOpen'}         | ${undefined}      | ${undefined}       | ${DefaultJestOutputSetting}
          ${5}  | ${'neverOpen'}         | ${true}           | ${undefined}       | ${{ revealOn: 'run', revealWithFocus: 'none', clearOnRun: 'terminal' }}
          ${6}  | ${'openOnTestFailure'} | ${undefined}      | ${undefined}       | ${{ revealOn: 'error', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${7}  | ${'openOnTestFailure'} | ${undefined}      | ${'on-run'}        | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${8}  | ${'openOnTestFailure'} | ${undefined}      | ${'on-exec-error'} | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${9}  | ${'openOnTestFailure'} | ${true}           | ${'off'}           | ${{ revealOn: 'demand', revealWithFocus: 'none', clearOnRun: 'terminal' }}
          ${10} | ${'whatever'}          | ${undefined}      | ${undefined}       | ${DefaultJestOutputSetting}
          ${11} | ${'openOnTestStart'}   | ${undefined}      | ${'whatever'}      | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
        `('case $case', ({ openTesting, autoClearTerminal, autoRevealOutput, expected }) => {
          mockConfig.get.mockImplementation((key: string) => {
            switch (key) {
              case 'outputConfig':
                return undefined;
              case 'openTesting':
                return openTesting;
              case 'autoClearTerminal':
                return autoClearTerminal;
              case 'autoRevealOutput':
                return autoRevealOutput;
              default:
                return undefined;
            }
          });
          const om = new OutputManager();
          const config = getOutputConfig(om);
          expect(config).toEqual(expected);
        });
      });
    });
  });

  describe('showOutputOn', () => {
    let mockTerminalOutput: any;
    const showTestResultsCommand = 'workbench.panel.testResults.view.focus';

    beforeEach(() => {
      mockTerminalOutput = {
        enable: jest.fn(),
        show: jest.fn(),
      };
    });
    it.each`
      case  | outputConfig                                               | type            | enableTerminal | showOutput
      ${1}  | ${undefined}                                               | ${'run'}        | ${true}        | ${undefined}
      ${2}  | ${undefined}                                               | ${'test-error'} | ${undefined}   | ${undefined}
      ${3}  | ${undefined}                                               | ${'exec-error'} | ${true}        | ${undefined}
      ${4}  | ${{ revealOn: 'error' }}                                   | ${'run'}        | ${undefined}   | ${undefined}
      ${5}  | ${{ revealOn: 'error' }}                                   | ${'test-error'} | ${true}        | ${undefined}
      ${6}  | ${{ revealOn: 'error' }}                                   | ${'exec-error'} | ${true}        | ${undefined}
      ${7}  | ${{ revealWithFocus: 'terminal' }}                         | ${'run'}        | ${true}        | ${'terminal'}
      ${8}  | ${{ revealWithFocus: 'terminal' }}                         | ${'test-error'} | ${undefined}   | ${undefined}
      ${9}  | ${{ revealWithFocus: 'terminal' }}                         | ${'exec-error'} | ${true}        | ${'terminal'}
      ${10} | ${{ revealWithFocus: 'test-results' }}                     | ${'run'}        | ${true}        | ${'test-results'}
      ${11} | ${{ revealWithFocus: 'test-results' }}                     | ${'test-error'} | ${undefined}   | ${undefined}
      ${12} | ${{ revealWithFocus: 'test-results' }}                     | ${'exec-error'} | ${true}        | ${undefined}
      ${13} | ${{ revealOn: 'error', revealWithFocus: 'terminal' }}      | ${'run'}        | ${undefined}   | ${undefined}
      ${14} | ${{ revealOn: 'error', revealWithFocus: 'terminal' }}      | ${'test-error'} | ${true}        | ${'terminal'}
      ${15} | ${{ revealOn: 'error', revealWithFocus: 'test-results' }}  | ${'test-error'} | ${true}        | ${'test-results'}
      ${16} | ${{ revealOn: 'demand', revealWithFocus: 'test-results' }} | ${'run'}        | ${undefined}   | ${undefined}
      ${17} | ${{ revealOn: 'demand', revealWithFocus: 'test-results' }} | ${'test-error'} | ${undefined}   | ${undefined}
      ${18} | ${{ revealOn: 'demand', revealWithFocus: 'test-results' }} | ${'exec-error'} | ${undefined}   | ${undefined}
    `('case $case', ({ outputConfig, type, enableTerminal, showOutput }) => {
      mockConfig.get.mockImplementation((key) => {
        switch (key) {
          case 'outputConfig':
            return outputConfig;
          case 'openTesting':
            return 'neverOpen';
        }
      });
      const om = new OutputManager();
      om.showOutputOn(type, mockTerminalOutput);
      if (enableTerminal) {
        expect(mockTerminalOutput.enable).toHaveBeenCalled();
      } else {
        expect(mockTerminalOutput.enable).not.toHaveBeenCalled();
      }
      if (showOutput) {
        if (showOutput === 'terminal') {
          expect(mockTerminalOutput.show).toHaveBeenCalled();
          expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(showTestResultsCommand);
        } else {
          expect(mockTerminalOutput.show).not.toHaveBeenCalled();
          expect(vscode.commands.executeCommand).toHaveBeenCalledWith(showTestResultsCommand);
        }
      } else {
        expect(mockTerminalOutput.show).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(showTestResultsCommand);
      }
    });
  });

  describe('clearOutputOnRun', () => {
    let mockTerminalOutput: any;
    const clearTestResultsCommand = 'testing.clearTestResults';

    beforeEach(() => {
      mockTerminalOutput = {
        clear: jest.fn(),
      };
    });
    it.each`
      case | clearOnRun        | clearTerminal | clearTestResults
      ${1} | ${'none'}         | ${false}      | ${false}
      ${2} | ${'terminal'}     | ${true}       | ${false}
      ${3} | ${'test-results'} | ${false}      | ${true}
      ${4} | ${'both'}         | ${true}       | ${true}
    `('case $case', ({ clearOnRun, clearTerminal, clearTestResults }) => {
      mockConfig.get.mockImplementationOnce(() => ({ ...DefaultJestOutputSetting, clearOnRun }));
      const om = new OutputManager();
      om.clearOutputOnRun(mockTerminalOutput);
      if (clearTerminal) {
        expect(mockTerminalOutput.clear).toHaveBeenCalled();
      } else {
        expect(mockTerminalOutput.clear).not.toHaveBeenCalled();
      }
      if (clearTestResults) {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(clearTestResultsCommand);
      } else {
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(clearTestResultsCommand);
      }
    });
  });

  describe('register', () => {
    it('will register onDidChangeConfiguration and a save command', async () => {
      const om = new OutputManager();
      const disposables = om.register();
      expect(disposables).toHaveLength(2);
      expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        expect.stringContaining('save-output-config'),
        expect.anything()
      );
      const onDidChangeConfiguration = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];
      expect(onDidChangeConfiguration).not.toBeUndefined();

      const saveCommand = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls[0][1];
      const saveSpy = jest.spyOn(om, 'save');
      await saveCommand();
      expect(saveSpy).toHaveBeenCalled();
    });
    describe('onDidChangeConfiguration', () => {
      let om: OutputManager;
      let onDidChangeConfiguration: any;
      let mockChangeEvent: any;
      beforeEach(() => {
        om = new OutputManager();
        om.register();
        onDidChangeConfiguration = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];
        mockChangeEvent = { affectsConfiguration: jest.fn() };
      });
      it('no-op if no outputConfig related changes detected', () => {
        mockConfig.get.mockImplementationOnce(() => ({ revealOn: 'error' }));
        mockChangeEvent.affectsConfiguration.mockReturnValue(false);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const config = getOutputConfig(om);
        expect(config.revealOn).not.toBe('error');
      });
      it('if outputConfig related changes detected, will load new config', () => {
        mockConfig.get.mockImplementation((key: string) => {
          if (key === 'openTesting') {
            return 'neverOpen';
          }
          if (key === 'outputConfig') {
            return { revealOn: 'error' };
          }
        });
        mockChangeEvent.affectsConfiguration.mockReturnValue(true);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const config = getOutputConfig(om);
        expect(config.revealOn).toBe('error');
        expect(showWarningMessageSpy).not.toHaveBeenCalled();
      });
      it('will show warning message if outputConfig related changes detected and config is not valid', () => {
        mockConfig.get.mockImplementation((key: string) => {
          if (key === 'openTesting') {
            return 'openOnTestStart';
          }
          if (key === 'outputConfig') {
            return { revealOn: 'error' };
          }
        });
        mockChangeEvent.affectsConfiguration.mockReturnValue(true);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        expect(showWarningMessageSpy).toHaveBeenCalled();
      });
    });
  });

  describe('validation and fix', () => {
    it('when no conflict, will return true', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'openTesting') {
          return 'neverOpen';
        }
        if (key === 'outputConfig') {
          return { revealOn: 'error' };
        }
      });
      const om = new OutputManager();
      await expect(om.validate()).resolves.toEqual(true);
      expect(showWarningMessageSpy).not.toHaveBeenCalled();
    });
    describe('when conflict detected', () => {
      beforeEach(() => {
        mockConfig.get.mockImplementation((key: string) => {
          if (key === 'openTesting') {
            return 'openOnTestStart';
          }
          if (key === 'outputConfig') {
            return { revealOn: 'error' };
          }
        });
      });
      it('will show warning message', async () => {
        showWarningMessageSpy.mockResolvedValue(undefined);
        const om = new OutputManager();
        await expect(om.validate()).resolves.toEqual(false);
        expect(showWarningMessageSpy).toHaveBeenCalled();
      });
      it('if user select "Help", will open a help page URL', async () => {
        showWarningMessageSpy.mockResolvedValue('Help');
        vscode.Uri.parse = jest.fn().mockReturnValueOnce('help-url');
        const om = new OutputManager();
        await expect(om.validate()).resolves.toEqual(false);
        expect(showWarningMessageSpy).toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.open', 'help-url');
      });
      it('if user select "Cancel", nothing will happen', async () => {
        showWarningMessageSpy.mockResolvedValue('Cancel');
        const om = new OutputManager();
        await expect(om.validate()).resolves.toEqual(false);
        expect(showWarningMessageSpy).toHaveBeenCalled();
      });
      describe('"Fix it" QuickPick', () => {
        let showQuickPickSpy: any;
        const mockQuickPick = (
          choose: (items: readonly vscode.QuickPickItem[]) => vscode.QuickPickItem | undefined
        ) => {
          showQuickPickSpy.mockImplementationOnce((items: any) => {
            return Promise.resolve(choose(items));
          });
        };
        beforeEach(() => {
          showWarningMessageSpy.mockResolvedValue('Fix it');
          showQuickPickSpy = jest.spyOn(vscode.window, 'showQuickPick');
        });
        it('if user select "Fix it", will open a QuickPick', async () => {
          mockQuickPick(() => undefined);
          const om = new OutputManager();
          await expect(om.validate()).resolves.toEqual(false);
          expect(showWarningMessageSpy).toHaveBeenCalled();
          expect(showQuickPickSpy).toHaveBeenCalled();
        });
        it('if user select "Edit Settings", will open workspace settings', async () => {
          mockQuickPick((items) => {
            const item = items.find((item) => item.label.includes('Edit Settings'));
            return item;
          });
          const om = new OutputManager();
          await expect(om.validate()).resolves.toEqual(false);
          expect(showWarningMessageSpy).toHaveBeenCalled();
          expect(showQuickPickSpy).toHaveBeenCalled();
          expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.openWorkspaceSettings'
          );
        });
        it('if user select "Help", will open URL page', async () => {
          mockQuickPick((items) => {
            const item = items.find((item) => item.label.includes('Help'));
            return item;
          });
          vscode.Uri.parse = jest.fn().mockReturnValueOnce('help-url');
          const om = new OutputManager();
          await expect(om.validate()).resolves.toEqual(false);
          expect(showWarningMessageSpy).toHaveBeenCalled();
          expect(showQuickPickSpy).toHaveBeenCalled();
          expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.open', 'help-url');
        });
        it('if user select "Fix test-results", testing setting will be fixed', async () => {
          mockQuickPick((items) => {
            const item = items.find((item) => item.label.includes('Fix test-results'));
            return item;
          });
          const om = new OutputManager();
          await expect(om.validate()).resolves.toEqual(true);
          expect(showWarningMessageSpy).toHaveBeenCalled();
          expect(showQuickPickSpy).toHaveBeenCalled();
          expect(mockConfig.update).toHaveBeenCalledWith(
            'openTesting',
            'neverOpen',
            vscode.ConfigurationTarget.Workspace
          );
        });
        it('if user select "Fix outputConfig", revealWithFocus setting will be fixed', async () => {
          mockQuickPick((items) => {
            const item = items.find((item) => item.label.includes('Fix outputConfig'));
            return item;
          });
          const om = new OutputManager();
          await expect(om.validate()).resolves.toEqual(true);
          expect(showWarningMessageSpy).toHaveBeenCalled();
          expect(showQuickPickSpy).toHaveBeenCalled();
          expect(mockConfig.update).toHaveBeenCalledWith(
            'outputConfig',
            expect.objectContaining({ revealWithFocus: 'test-results' })
          );
        });
      });
    });
  });
});
