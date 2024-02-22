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

// jest.dontMock('../src/output-manager');
jest.unmock('../src/output-manager');

import { OutputManager, DefaultJestOutputSetting } from '../src/output-manager';

describe('OutputManager', () => {
  const mockWorkspaceConfig = (outputConfig?: any, openTesting = 'openOnTestStart') => {
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'outputConfig') {
        return outputConfig;
      }
      if (key === 'openTesting') {
        return openTesting;
      }
      return undefined;
    });
  };

  let showWarningMessageSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    showWarningMessageSpy = vscode.window.showWarningMessage as jest.Mocked<any>;
    // returns default config
    mockWorkspaceConfig();
  });

  describe('constructor', () => {
    describe('with outputConfig', () => {
      describe('can resolve outputConfig settings', () => {
        it.each`
          case | outputConfig                                               | expected
          ${1} | ${undefined}                                               | ${{ ...DefaultJestOutputSetting, revealWithFocus: 'test-results' }}
          ${2} | ${'neutral'}                                               | ${DefaultJestOutputSetting}
          ${3} | ${'terminal-based'}                                        | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'none' }}
          ${4} | ${'test-results-based'}                                    | ${{ revealOn: 'run', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${5} | ${{ revealOn: 'error' }}                                   | ${{ revealOn: 'error', revealWithFocus: 'none', clearOnRun: 'none' }}
          ${6} | ${{ revealWithFocus: 'terminal' }}                         | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'none' }}
          ${7} | ${{ revealWithFocus: 'terminal', clearOnRun: 'terminal' }} | ${{ revealOn: 'run', revealWithFocus: 'terminal', clearOnRun: 'terminal' }}
          ${8} | ${'wrong-type'}                                            | ${DefaultJestOutputSetting}
        `('case $case', ({ outputConfig, expected }) => {
          mockWorkspaceConfig(outputConfig);
          const om = new OutputManager();
          const { outputConfig: config } = om.outputConfigs();
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
        const { outputConfig: config } = om.outputConfigs();
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
          ${7}  | ${'openOnTestFailure'} | ${undefined}      | ${'on-run'}        | ${{ revealOn: 'error', revealWithFocus: 'test-results', clearOnRun: 'none' }}
          ${8}  | ${'openOnTestFailure'} | ${undefined}      | ${'on-exec-error'} | ${{ revealOn: 'error', revealWithFocus: 'test-results', clearOnRun: 'none' }}
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
          const { outputConfig: config } = om.outputConfigs();
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
      mockWorkspaceConfig({ ...DefaultJestOutputSetting, clearOnRun });
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

  describe('autoFocus', () => {
    it.each`
      case | outputConfig                           | openTesting          | expected
      ${1} | ${undefined}                           | ${'openOnTestStart'} | ${true}
      ${2} | ${undefined}                           | ${'neverOpen'}       | ${false}
      ${3} | ${{ revealWithFocus: 'none' }}         | ${'openOnTestStart'} | ${true}
      ${4} | ${{ revealWithFocus: 'none' }}         | ${'neverOpen'}       | ${false}
      ${5} | ${{ revealWithFocus: 'test-results' }} | ${'neverOpen'}       | ${true}
      ${6} | ${{ revealWithFocus: 'terminal' }}     | ${'neverOpen'}       | ${true}
    `('case $case: isAutoFocus = $expected', ({ outputConfig, openTesting, expected }) => {
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case 'outputConfig':
            return outputConfig;
          case 'openTesting':
            return openTesting;
        }
      });
      const om = new OutputManager();
      const result = om.isAutoFocus();
      expect(result).toEqual(expected);
    });
    describe('disableAutoFocus', () => {
      it('disableAutoFocus() will update both openTesting and outputConfig settings', async () => {
        const om = new OutputManager();
        await om.disableAutoFocus();
        expect(mockConfig.update).toHaveBeenCalledWith(
          'openTesting',
          'neverOpen',
          vscode.ConfigurationTarget.Workspace
        );
        expect(mockConfig.update).toHaveBeenCalledWith(
          'outputConfig',
          expect.objectContaining({ revealWithFocus: 'none' })
        );
      });
      it('during the update, validation will be skipped', async () => {
        const om = new OutputManager();

        let validateCount = 0;
        mockConfig.update.mockImplementation(async () => {
          // check if validation is skipped
          await expect(om.validate()).resolves.toBeUndefined();
          validateCount++;
        });

        await om.disableAutoFocus();
        expect(validateCount).toEqual(2);

        mockConfig.update.mockReset();
      });
    });
  });

  describe('register', () => {
    it('will register onDidChangeConfiguration and commands', async () => {
      const om = new OutputManager();
      const disposables = om.register();
      expect(disposables).toHaveLength(3);
      expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalled();
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        expect.stringContaining('save-output-config'),
        expect.anything()
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        expect.stringContaining('disable-auto-focus'),
        expect.anything()
      );
      const onDidChangeConfiguration = mockWorkspace.onDidChangeConfiguration.mock.calls[0][0];
      expect(onDidChangeConfiguration).not.toBeUndefined();

      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(2);
      let matched = 0;
      const saveSpy = jest.spyOn(om, 'save');
      const disableAutoFocusSpy = jest.spyOn(om, 'disableAutoFocus');

      for (const [command, func] of (vscode.commands.registerCommand as jest.Mocked<any>).mock
        .calls) {
        if (command.includes('save-output-config')) {
          matched |= 0x01;
          await func();
          expect(saveSpy).toHaveBeenCalled();
        } else if (command.includes('disable-auto-focus')) {
          matched |= 0x02;
          await func();
          expect(disableAutoFocusSpy).toHaveBeenCalled();
        } else {
          throw new Error(`Unexpected command: ${command}`);
        }
      }
      expect(matched).toBe(0x03);
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
        mockWorkspaceConfig({ revealOn: 'error' });
        mockChangeEvent.affectsConfiguration.mockReturnValue(false);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const { outputConfig: config } = om.outputConfigs();
        expect(config.revealOn).not.toBe('error');
      });
      it('if outputConfig related changes detected, will load new config', () => {
        mockWorkspaceConfig({ revealOn: 'error' }, 'neverOpen');
        mockChangeEvent.affectsConfiguration.mockReturnValue(true);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const { outputConfig: config } = om.outputConfigs();
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
    describe('isTestResultsConfigsValid', () => {
      it.each`
        case  | outputConfig                                               | openTesting                  | expected
        ${1}  | ${undefined}                                               | ${'openOnTestStart'}         | ${true}
        ${2}  | ${undefined}                                               | ${'neverOpen'}               | ${true}
        ${3}  | ${{ revealWithFocus: 'none' }}                             | ${'neverOpen'}               | ${true}
        ${4}  | ${{ revealWithFocus: 'none' }}                             | ${'openOnTestStart'}         | ${false}
        ${5}  | ${{ revealWithFocus: 'none' }}                             | ${'openOnTestFailure'}       | ${false}
        ${6}  | ${{ revealWithFocus: 'none' }}                             | ${'openExplorerOnTestStart'} | ${true}
        ${7}  | ${{ revealWithFocus: 'test-results' }}                     | ${'neverOpen'}               | ${true}
        ${8}  | ${{ revealWithFocus: 'test-results' }}                     | ${'openOnTestStart'}         | ${true}
        ${9}  | ${{ revealWithFocus: 'test-results' }}                     | ${'openOnTestFailure'}       | ${false}
        ${10} | ${{ revealWithFocus: 'test-results', revealOn: 'error' }}  | ${'openOnTestFailure'}       | ${true}
        ${11} | ${{ revealWithFocus: 'test-results', revealOn: 'error' }}  | ${'openOnTestStart'}         | ${false}
        ${12} | ${{ revealWithFocus: 'test-results', revealOn: 'demand' }} | ${'openOnTestStart'}         | ${false}
        ${13} | ${{ revealWithFocus: 'test-results', revealOn: 'demand' }} | ${'openOnTestFailure'}       | ${false}
        ${14} | ${{ revealWithFocus: 'terminal' }}                         | ${'neverOpen'}               | ${true}
        ${15} | ${{ revealWithFocus: 'terminal' }}                         | ${'openOnTestStart'}         | ${false}
        ${16} | ${{ revealWithFocus: 'terminal' }}                         | ${'openOnTestFailure'}       | ${false}
        ${17} | ${{ revealWithFocus: 'terminal' }}                         | ${'openExplorerOnTestStart'} | ${true}
      `('case $case: isAutoFocus = $expected', ({ outputConfig, openTesting, expected }) => {
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case 'outputConfig':
              return outputConfig;
            case 'openTesting':
              return openTesting;
          }
        });
        const om = new OutputManager();
        expect(om.isTestResultsConfigsValid()).toEqual(expected);
      });
    });
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
        mockWorkspaceConfig({ revealOn: 'error' });
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
          mockConfig.update.mockImplementation(() => {
            return Promise.resolve();
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
