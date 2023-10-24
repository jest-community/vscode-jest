import * as vscode from 'vscode';
import { AutoRevealOutputType, JestOutputSetting } from './Settings/types';
import { ExtOutputTerminal } from './JestExt/output-terminal';

type OutputConfig = Required<JestOutputSetting>;
const DefaultJestOutputSetting: OutputConfig = {
  revalOn: 'run',
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
    return { ...DefaultJestOutputSetting, ...(config ?? this.fromLegacySettings()) };
  }

  public get revealOn(): JestOutputSetting['revalOn'] {
    return this.config.revalOn;
  }

  public showOutputOn(
    type: 'run' | 'test-error' | 'exec-error',
    terminalOutput: ExtOutputTerminal
  ): void {
    // will not reveal output for the following cases:
    switch (type) {
      case 'run':
        if (this.config.revalOn !== 'run') {
          return;
        }
        break;
      case 'test-error':
        if (this.config.revalOn !== 'error') {
          return;
        }
        break;
      case 'exec-error':
        if (this.config.revalOn === 'demand') {
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
  public async validate(modal: boolean): Promise<boolean> {
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

    const buttons: string[] = modal
      ? [actions.fixIt, actions.help]
      : [actions.fixIt, actions.help, actions.cancel];
    const selection = await vscode.window.showWarningMessage(
      `Output Config Conflict Detected`,
      { modal, detail },
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
      this.validate(false);
    }
  }

  private fromLegacySettings(scope?: vscode.ConfigurationScope): JestOutputSetting {
    const vscodeConfig = vscode.workspace.getConfiguration('jest', scope);
    const autoClearTerminal = vscodeConfig.get<boolean>('autoClearTerminal');
    const autoRevealOutput = vscodeConfig.get<AutoRevealOutputType>('autoRevealOutput');

    const config = {} as JestOutputSetting;
    switch (autoRevealOutput) {
      case undefined:
      case 'on-run':
      case 'on-exec-error':
        config.revalOn = 'run';
        break;
      case 'off':
        config.revalOn = 'demand';
        break;
    }
    config.clearOnRun = autoClearTerminal ? 'terminal' : 'none';
    return config;
  }
  public async save(): Promise<void> {
    await vscode.workspace.getConfiguration('jest').update('outputConfig', this.config);
  }
}

export const outputManager = new OutputManager();
