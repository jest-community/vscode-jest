import * as vscode from 'vscode';
import { AutoRevealOutputType, JestOutputSetting, JestRawOutputSetting } from './Settings/types';
import { ExtOutputTerminal } from './JestExt/output-terminal';

export type OutputConfig = Required<JestRawOutputSetting>;
export const DefaultJestOutputSetting: OutputConfig = {
  revealOn: 'run',
  revealWithFocus: 'none',
  clearOnRun: 'none',
};

const OUTPUT_CONFIG_HELP_URL = 'https://github.com/jest-community/vscode-jest#outputconfig';

export class OutputManager {
  private config: OutputConfig;

  constructor() {
    this.config = this.getConfig();
  }

  private getConfig(): OutputConfig {
    const config = vscode.workspace.getConfiguration('jest').get<JestOutputSetting>('outputConfig');
    return config
      ? this.resolveSetting(config)
      : { ...DefaultJestOutputSetting, ...this.fromLegacySettings() };
  }

  private resolveSetting(setting: JestOutputSetting): OutputConfig {
    if (typeof setting === 'string') {
      switch (setting) {
        case 'neutral':
          return DefaultJestOutputSetting;
        case 'terminal-based':
          return {
            revealOn: 'run',
            revealWithFocus: 'terminal',
            clearOnRun: 'none',
          };
        case 'test-results-based':
          return {
            revealOn: 'run',
            revealWithFocus: 'test-results',
            clearOnRun: 'none',
          };
        default: {
          console.warn(
            `Unknown predefined output setting: ${setting}, will use default setting ("neutral") instead.`
          );
          return DefaultJestOutputSetting;
        }
      }
    }

    return { ...DefaultJestOutputSetting, ...setting };
  }

  private fromLegacySettings(scope?: vscode.ConfigurationScope): JestRawOutputSetting {
    const vscodeConfig = vscode.workspace.getConfiguration('jest', scope);
    const autoClearTerminal = vscodeConfig.get<boolean>('autoClearTerminal');
    const autoRevealOutput = vscodeConfig.get<AutoRevealOutputType>('autoRevealOutput');
    const openTesting = vscode.workspace.getConfiguration('testing').get<string>('openTesting');

    const config = {} as JestRawOutputSetting;

    switch (openTesting) {
      case 'neverOpen':
      case 'openExplorerOnTestStart':
        // no-op
        break;
      case 'openOnTestStart':
        config.revealWithFocus = 'test-results';
        break;
      case 'openOnTestFailure':
        config.revealOn = 'error';
        config.revealWithFocus = 'test-results';
        break;
      default:
        console.warn(`Unrecognized "testing.openTesting" setting: ${openTesting}`);
    }

    switch (autoRevealOutput) {
      case undefined:
        // no-op
        break;
      case 'on-run':
      case 'on-exec-error':
        config.revealOn = 'run';
        break;
      case 'off':
        config.revealOn = 'demand';
        config.revealWithFocus = 'none';
        break;
    }
    config.clearOnRun = autoClearTerminal ? 'terminal' : 'none';
    return config;
  }

  public showOutputOn(
    type: 'run' | 'test-error' | 'exec-error',
    terminalOutput: ExtOutputTerminal
  ): void {
    // will not reveal output for the following cases:
    switch (type) {
      case 'run':
        if (this.config.revealOn !== 'run') {
          return;
        }
        break;
      case 'test-error':
        if (this.config.revealOn !== 'error') {
          return;
        }
        break;
      case 'exec-error':
        if (this.config.revealOn === 'demand') {
          return;
        }
        break;
    }
    terminalOutput.enable();

    // check to see if we need to show with the focus
    if (this.config.revealWithFocus === 'terminal') {
      return terminalOutput.show();
    } else if (type !== 'exec-error' && this.config.revealWithFocus === 'test-results') {
      // exec-error will only show in terminal
      return this.showTestResultsOutput();
    }
  }

  public clearOutputOnRun(terminalOutput: ExtOutputTerminal): void {
    if (this.config.clearOnRun === 'none') {
      return;
    }
    if (this.config.clearOnRun === 'terminal' || this.config.clearOnRun === 'both') {
      terminalOutput.clear();
    }
    if (this.config.clearOnRun === 'test-results' || this.config.clearOnRun === 'both') {
      this.clearTestResultsOutput();
    }
  }

  private clearTestResultsOutput(): void {
    // Note: this command is probably not the right one as it will clear all test items status as well, not just the output like in the terminal.
    // should file a feature request for testing framework to provide a command to clear the output history only.
    vscode.commands.executeCommand('testing.clearTestResults');
  }
  private showTestResultsOutput(): void {
    vscode.commands.executeCommand('workbench.panel.testResults.view.focus');
  }

  private async updateTestResultsSettings(): Promise<void> {
    const value = 'neverOpen';
    await vscode.workspace
      .getConfiguration('testing')
      .update('openTesting', value, vscode.ConfigurationTarget.Workspace);
    console.warn(`set "testing.openTesting" to "${value}"`);
  }

  public register(): vscode.Disposable[] {
    return [vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this)];
  }

  /**
   * Check if "testing.openTesting" setting conflict with outputConfig.
   * This occurred when "testing.openTesting" is not set to "neverOpen"
   * and the 'revealWithFocus' is not set to "test-results"
   *
   * @returns boolean
   */
  private isTestingSettingValid(): boolean {
    const testingSetting = vscode.workspace.getConfiguration('testing').get<string>('openTesting');
    return testingSetting === 'neverOpen' || this.config.revealWithFocus === 'test-results';
  }

  /**
   * Validates output settings for potential conflicts.
   * If conflict detected, show a warning message with options to update the settings.
   * @returns void
   */
  public async validate(): Promise<boolean> {
    if (this.isTestingSettingValid()) {
      return true;
    }

    const testingSetting = vscode.workspace.getConfiguration('testing').get<string>('openTesting');
    const detail = `test-results panel setting "testing.openTesting: ${testingSetting}" conflicts with jest.outputConfig "revalWithFocus: ${this.config.revealWithFocus}".`;
    console.warn(detail);

    const actions = {
      fixIt: 'Fix it',
      help: 'Help',
      cancel: 'Cancel',
    };

    const buttons: string[] = [actions.fixIt, actions.help, actions.cancel];
    const selection = await vscode.window.showWarningMessage(
      `Output Config Conflict Detected`,
      ...buttons
    );
    switch (selection) {
      case actions.fixIt:
        return await this.showFixChooser();
      case actions.help:
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(OUTPUT_CONFIG_HELP_URL));
        break;
    }
    return false;
  }

  private async showFixChooser(): Promise<boolean> {
    const items = {
      fixTestResults: {
        label: '$(sync) Fix test-results panel setting',
        description: '(Extension manages the test-results panel)',
        detail: 'Set "testing.openTesting" to "neverOpen"',
      },
      fixOutputConfig: {
        label: '$(sync-ignored) Fix outputConfig setting',
        description: '(Extension will NOT manage the test-results panel)',
        detail: 'Set "jest.outputConfig.revealWithFocus" to "test-results"',
      },
      editSettings: {
        label: '$(tools) Edit Settings Manually',
        detail: 'Open workspace settings',
      },
      help: {
        label: '$(info) Help',
        detail: 'What is "jest.outputConfig"?',
      },
      cancel: {
        label: '$(close) Cancel',
      },
    };
    const item = await vscode.window.showQuickPick(Object.values(items), {
      placeHolder: 'Select an action',
    });
    switch (item) {
      case items.fixTestResults:
        await this.updateTestResultsSettings();
        return true;
      case items.fixOutputConfig:
        this.config.revealWithFocus = 'test-results';
        await this.save();
        return true;
      case items.editSettings:
        vscode.commands.executeCommand('workbench.action.openWorkspaceSettings');
        break;
      case items.help:
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(OUTPUT_CONFIG_HELP_URL));
        break;
    }
    return false;
  }

  private async onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent): Promise<void> {
    if (
      e.affectsConfiguration('jest.outputConfig') ||
      e.affectsConfiguration('testing.openTesting')
    ) {
      this.config = this.getConfig();
      this.validate();
    }
  }

  public async save(): Promise<void> {
    await vscode.workspace.getConfiguration('jest').update('outputConfig', this.config);
  }
}

export const outputManager = new OutputManager();
