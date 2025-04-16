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

import { getSettingDetail } from '../src/Settings';

interface TestingSettings {
  openTesting?: [string | undefined, boolean?];
  automaticallyOpenTestResults?: [string | undefined, boolean?];
}
const mockSettings = (outputConfig?: any, openTesting?: string) => {
  return mockTestingSettings(outputConfig, {
    openTesting: [openTesting],
  });
};
const mockTestingSettings = (outputConfig?: any, testingSettings?: TestingSettings) => {
  const isExplicitlySet = (values?: [string | undefined, boolean?]): boolean => {
    return values?.[1] !== undefined ? !!values?.[1] : values?.[0] !== undefined;
  };
  (getSettingDetail as jest.Mocked<any>).mockImplementation((_name: string, key: string) => {
    if (key === 'outputConfig') {
      return { value: outputConfig, isExplicitlySet: outputConfig !== undefined };
    }
    if (key === 'openTesting') {
      return {
        value: testingSettings?.openTesting?.[0],
        isExplicitlySet: isExplicitlySet(testingSettings?.openTesting),
      };
    }
    if (key === 'automaticallyOpenTestResults') {
      return {
        value: testingSettings?.automaticallyOpenTestResults?.[0] ?? 'openOnTestStart',
        isExplicitlySet: isExplicitlySet(testingSettings?.automaticallyOpenTestResults),
      };
    }
    return undefined;
  });
};

mockSettings();

jest.unmock('../src/output-manager');

import { OutputManager, DefaultJestOutputSetting } from '../src/output-manager';

describe('OutputManager', () => {
  let showWarningMessageSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    showWarningMessageSpy = vscode.window.showWarningMessage as jest.Mocked<any>;
    // returns default config
    mockSettings();
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
          mockSettings(outputConfig);
          const om = new OutputManager();
          const { outputConfig: config } = om.outputConfigs();
          expect(config.value).toEqual(expected);
        });
      });
      it('will ignore legacy settings', () => {
        mockSettings('terminal-based', 'openOnTestStart');

        const om = new OutputManager();
        const { outputConfig: config } = om.outputConfigs();
        expect(config.value).toEqual({
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
          mockSettings(undefined, openTesting);
          mockConfig.get.mockImplementation((key: string) => {
            switch (key) {
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
          expect(config.value).toEqual(expected);
        });
      });
    });
    describe('migrate testing.openTesting to testing.automaticallyOpenTestResults', () => {
      it.each`
        case | openTesting            | automaticallyOpenTestResults   | expected
        ${1} | ${[undefined]}         | ${[undefined]}                 | ${['openOnTestStart', false]}
        ${2} | ${[undefined]}         | ${['openOnTestStart', false]}  | ${['openOnTestStart', false]}
        ${3} | ${['neverOpen', true]} | ${['openOnTestStart', false]}  | ${['neverOpen', true]}
        ${4} | ${['neverOpen', true]} | ${['openOnTestStart', true]}   | ${['openOnTestStart', true]}
        ${5} | ${['neverOpen', true]} | ${['openOnTestFailure', true]} | ${['openOnTestFailure', true]}
        ${6} | ${['neverOpen', true]} | ${[undefined]}                 | ${['neverOpen', true]}
      `('case $case', ({ openTesting, automaticallyOpenTestResults, expected }) => {
        mockTestingSettings(undefined, { openTesting, automaticallyOpenTestResults });

        const om = new OutputManager();
        const { openTesting: config } = om.outputConfigs();
        expect(config.value).toEqual(expected[0]);
        expect(config.isExplicitlySet).toEqual(expected[1]);
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
    describe('without runMode', () => {
      describe('when no outputConfig is defined', () => {
        it.each`
          case  | openTesting                  | type            | enableTerminal | showTestResults
          ${1}  | ${'neverOpen'}               | ${'run'}        | ${true}        | ${false}
          ${2}  | ${'neverOpen'}               | ${'test-error'} | ${undefined}   | ${false}
          ${3}  | ${'neverOpen'}               | ${'exec-error'} | ${true}        | ${false}
          ${4}  | ${'openOnTestStart'}         | ${'run'}        | ${true}        | ${true}
          ${5}  | ${'openOnTestStart'}         | ${'test-error'} | ${undefined}   | ${false}
          ${6}  | ${'openOnTestStart'}         | ${'exec-error'} | ${true}        | ${false}
          ${7}  | ${'openOnTestFailure'}       | ${'run'}        | ${false}       | ${false}
          ${8}  | ${'openOnTestFailure'}       | ${'test-error'} | ${true}        | ${true}
          ${9}  | ${'openOnTestFailure'}       | ${'exec-error'} | ${true}        | ${false}
          ${10} | ${'openExplorerOnTestStart'} | ${'run'}        | ${true}        | ${false}
          ${11} | ${'openExplorerOnTestStart'} | ${'test-error'} | ${undefined}   | ${false}
          ${12} | ${'openExplorerOnTestStart'} | ${'exec-error'} | ${true}        | ${false}
          ${13} | ${undefined}                 | ${'run'}        | ${true}        | ${true}
          ${14} | ${undefined}                 | ${'test-error'} | ${undefined}   | ${false}
          ${15} | ${undefined}                 | ${'exec-error'} | ${true}        | ${false}
        `(
          'case $case openTesting=$openTesting, type=$type',
          ({ openTesting, type, enableTerminal, showTestResults }) => {
            mockSettings(undefined, openTesting);
            const om = new OutputManager();
            om.showOutputOn(type, mockTerminalOutput);

            if (enableTerminal) {
              expect(mockTerminalOutput.enable).toHaveBeenCalled();
            } else {
              expect(mockTerminalOutput.enable).not.toHaveBeenCalled();
            }

            expect(mockTerminalOutput.show).not.toHaveBeenCalled();

            if (showTestResults) {
              expect(vscode.commands.executeCommand).toHaveBeenCalledWith(showTestResultsCommand, {
                preserveFocus: true,
              });
            } else {
              expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            }
          }
        );
      });
      describe.each([
        ['neverOpen'],
        ['openOnTestStart'],
        ['openOnTestFailure'],
        ['openExplorerOnTestStart'],
      ])(`when openTesting is "%s"`, (openTesting) => {
        it.each`
          case  | outputConfig                                               | type            | enableTerminal | showOutput
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
        `(
          'case $case when outputConfig is defined',
          ({ outputConfig, type, enableTerminal, showOutput }) => {
            mockSettings(outputConfig, openTesting);
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
                expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
              } else {
                expect(mockTerminalOutput.show).not.toHaveBeenCalled();
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                  showTestResultsCommand,
                  { preserveFocus: true }
                );
              }
            } else {
              expect(mockTerminalOutput.show).not.toHaveBeenCalled();
              expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            }
          }
        );
      });
    });
    describe('with auto runMode', () => {
      describe.each([['watch'], ['on-save']])('runMode=%s', (runMode) => {
        it.each`
          case  | openTesting                  | outputConfig                                              | type            | execShowTestResults
          ${1}  | ${'neverOpen'}               | ${undefined}                                              | ${'run'}        | ${false}
          ${2}  | ${'neverOpen'}               | ${undefined}                                              | ${'test-error'} | ${false}
          ${3}  | ${'neverOpen'}               | ${undefined}                                              | ${'exec-error'} | ${false}
          ${4}  | ${'neverOpen'}               | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'run'}        | ${true}
          ${5}  | ${'neverOpen'}               | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'test-error'} | ${false}
          ${6}  | ${'neverOpen'}               | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${true}
          ${7}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'run'}        | ${true}
          ${8}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'test-error'} | ${false}
          ${9}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'exec-error'} | ${false}
          ${10} | ${'openOnTestStart'}         | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'run'}        | ${false}
          ${11} | ${'openOnTestStart'}         | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${true}
          ${12} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'run'}        | ${false}
          ${13} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'test-error'} | ${true}
          ${14} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'exec-error'} | ${false}
          ${15} | ${'openOnTestFailure'}       | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${true}
          ${16} | ${'openOnTestFailure'}       | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'test-error'} | ${false}
          ${17} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'run'}        | ${false}
          ${18} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'test-error'} | ${false}
          ${19} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'exec-error'} | ${false}
          ${20} | ${undefined}                 | ${undefined}                                              | ${'run'}        | ${false}
          ${21} | ${undefined}                 | ${undefined}                                              | ${'test-error'} | ${false}
          ${22} | ${undefined}                 | ${undefined}                                              | ${'exec-error'} | ${false}
        `('case $case', ({ openTesting, outputConfig, type, execShowTestResults }) => {
          mockSettings(outputConfig, openTesting);
          const om = new OutputManager();
          const mockRunMode: any = { config: { type: runMode } };
          om.showOutputOn(type, mockTerminalOutput, mockRunMode);

          if (execShowTestResults) {
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(showTestResultsCommand, {
              preserveFocus: true,
            });
          } else {
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
          }
        });
      });
    });
    describe('with on-demand runMode', () => {
      it.each`
        case  | openTesting                  | outputConfig                                              | type            | execShowTestResults
        ${1}  | ${'neverOpen'}               | ${undefined}                                              | ${'run'}        | ${false}
        ${2}  | ${'neverOpen'}               | ${undefined}                                              | ${'test-error'} | ${false}
        ${3}  | ${'neverOpen'}               | ${undefined}                                              | ${'exec-error'} | ${false}
        ${4}  | ${'neverOpen'}               | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'run'}        | ${true}
        ${5}  | ${'neverOpen'}               | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'test-error'} | ${false}
        ${6}  | ${'neverOpen'}               | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${true}
        ${7}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'run'}        | ${false}
        ${8}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'test-error'} | ${false}
        ${9}  | ${'openOnTestStart'}         | ${undefined}                                              | ${'exec-error'} | ${false}
        ${10} | ${'openOnTestStart'}         | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'run'}        | ${false}
        ${11} | ${'openOnTestStart'}         | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${false}
        ${12} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'run'}        | ${false}
        ${13} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'test-error'} | ${false}
        ${14} | ${'openOnTestFailure'}       | ${undefined}                                              | ${'exec-error'} | ${false}
        ${15} | ${'openOnTestFailure'}       | ${{ revealOn: 'error', revealWithFocus: 'test-results' }} | ${'test-error'} | ${false}
        ${16} | ${'openOnTestFailure'}       | ${{ revealOn: 'run', revealWithFocus: 'test-results' }}   | ${'test-error'} | ${false}
        ${17} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'run'}        | ${false}
        ${18} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'test-error'} | ${false}
        ${19} | ${'openExplorerOnTestStart'} | ${undefined}                                              | ${'exec-error'} | ${false}
      `(
        'case $case should be lazy in invoking command',
        ({ openTesting, outputConfig, type, execShowTestResults }) => {
          mockSettings(outputConfig, openTesting);
          const om = new OutputManager();
          const mockRunMode: any = { config: { type: 'on-demand' } };
          om.showOutputOn(type, mockTerminalOutput, mockRunMode);

          if (execShowTestResults) {
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(showTestResultsCommand, {
              preserveFocus: true,
            });
          } else {
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
          }
        }
      );
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
      mockSettings({ ...DefaultJestOutputSetting, clearOnRun });
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

  describe('disableAutoFocus', () => {
    it('disableAutoFocus() will update both openTesting and outputConfig settings', async () => {
      const om = new OutputManager();
      await om.disableAutoFocus();
      expect(mockConfig.update).toHaveBeenCalledWith(
        'automaticallyOpenTestResults',
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
        mockSettings({ revealOn: 'error' });
        mockChangeEvent.affectsConfiguration.mockReturnValue(false);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const { outputConfig: config } = om.outputConfigs();
        expect(config.value.revealOn).not.toBe('error');
      });
      it('if outputConfig related changes detected, will load new config', () => {
        mockSettings({ revealOn: 'error' }, 'neverOpen');
        mockChangeEvent.affectsConfiguration.mockReturnValue(true);

        onDidChangeConfiguration.call(om, mockChangeEvent);
        const { outputConfig: config } = om.outputConfigs();
        expect(config.value.revealOn).toBe('error');
        expect(showWarningMessageSpy).not.toHaveBeenCalled();
      });
      it('will show warning message if outputConfig related changes detected and config is not valid', () => {
        mockSettings({ revealOn: 'error' }, 'openOnTestStart');
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
        mockSettings(outputConfig, openTesting);
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
        mockSettings({ revealOn: 'error' });
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
            'automaticallyOpenTestResults',
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
