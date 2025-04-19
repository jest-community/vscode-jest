import * as vscode from 'vscode';
import {
  AutoRevealOutputType,
  JestOutputSetting,
  JestRawOutputSetting,
  SettingDetail,
  getSettingDetail,
} from './Settings';
import { ExtOutputTerminal } from './JestExt/output-terminal';
import { OUTPUT_CONFIG_HELP_URL, extensionName } from './appGlobals';
import { RunMode } from './JestExt/run-mode';

export type OutputConfig = Required<JestRawOutputSetting>;
export const DefaultJestOutputSetting: OutputConfig = {
  revealOn: 'run',
  revealWithFocus: 'none',
  clearOnRun: 'none',
};
export interface OutputSettingDetail extends SettingDetail<OutputConfig> {
  value: OutputConfig; // Override the value property to make it non-undefined
}
export interface OutputConfigs {
  outputConfig: OutputSettingDetail;
  openTesting: SettingDetail<string>;
}

export class OutputManager {
  private config!: OutputSettingDetail;
  private openTesting!: SettingDetail<string>;
  private skipValidation = false;

  constructor() {
    this.initConfigs();
  }

  private initConfigs(): void {
    // Note: test.openTesting has been replaced with testing.automaticallyOpenTestResults on Nov 2024
    const automaticallyOpenTestResults = getSettingDetail<string>(
      'testing',
      'automaticallyOpenTestResults'
    );
    if (automaticallyOpenTestResults.isExplicitlySet) {
      this.openTesting = automaticallyOpenTestResults;
    } else {
      const openTesting = getSettingDetail<string>('testing', 'openTesting');
      this.openTesting = openTesting.isExplicitlySet ? openTesting : automaticallyOpenTestResults;
    }
    const config = getSettingDetail<OutputConfig>('jest', 'outputConfig');
    const value: OutputConfig = config.value
      ? this.resolveSetting(config.value)
      : { ...DefaultJestOutputSetting, ...this.fromLegacySettings() };
    this.config = { ...config, value };
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

    const config = {} as JestRawOutputSetting;

    switch (this.openTesting.value) {
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
        console.warn(
          `Unrecognized "testing.automaticallyOpenTestResults" setting: ${JSON.stringify(this.openTesting)}`
        );
    }

    if (autoRevealOutput === 'off') {
      config.revealOn = 'demand';
      config.revealWithFocus = 'none';
      if (this.openTesting.value !== 'neverOpen') {
        console.warn(
          'The "autoRevealOutput" setting is set to "off", but "testing.automaticallyOpenTestResults" is not set to "neverOpen".'
        );
      }
    }

    config.clearOnRun = autoClearTerminal ? 'terminal' : 'none';
    return config;
  }

  public showOutputOn(
    type: 'run' | 'test-error' | 'exec-error',
    terminalOutput: ExtOutputTerminal,
    runMode?: RunMode
  ): void {
    // will not reveal output for the following cases:
    switch (type) {
      case 'run':
        if (this.config.value.revealOn !== 'run') {
          return;
        }
        break;
      case 'test-error':
        if (this.config.value.revealOn !== 'error') {
          return;
        }
        break;
      case 'exec-error':
        if (this.config.value.revealOn === 'demand') {
          return;
        }
        break;
    }
    terminalOutput.enable();

    // check to see if we need to show with the focus
    if (this.config.value.revealWithFocus === 'terminal') {
      return terminalOutput.show();
    } else if (type !== 'exec-error' && this.config.value.revealWithFocus === 'test-results') {
      // exec-error will only show in terminal
      return this.showTestResultsOutput(runMode);
    }
  }

  public clearOutputOnRun(terminalOutput: ExtOutputTerminal): void {
    if (this.config.value.clearOnRun === 'none') {
      return;
    }
    if (this.config.value.clearOnRun === 'terminal' || this.config.value.clearOnRun === 'both') {
      terminalOutput.clear();
    }
    if (
      this.config.value.clearOnRun === 'test-results' ||
      this.config.value.clearOnRun === 'both'
    ) {
      this.clearTestResultsOutput();
    }
  }

  private clearTestResultsOutput(): void {
    // Note: this command is probably not the right one as it will clear all test items status as well, not just the output like in the terminal.
    // should file a feature request for testing framework to provide a command to clear the output history only.
    vscode.commands.executeCommand('testing.clearTestResults');
  }
  private showTestResultsOutput(runMode?: RunMode): void {
    switch (runMode?.config.type) {
      case 'on-demand':
        // only need to perform force reveal if users has turn off the openTesting; otherwise, test-results can
        // handle the reveal logic itself (returns false)
        if (this.openTesting.value !== 'neverOpen') {
          return;
        }
        break;
      case 'watch':
      case 'on-save':
        // for auto-runs, by default we will not perform auto reveal test results panel unless
        // it is explicitly configured by the user, i.e. either openTesting or outputConfig is set explicitly.
        if (!this.config.isExplicitlySet && !this.openTesting.isExplicitlySet) {
          return;
        }
        break;
    }
    vscode.commands.executeCommand('workbench.panel.testResults.view.focus', {
      preserveFocus: true,
    });
  }

  private async updateTestResultsSettings(): Promise<void> {
    const value = 'neverOpen';
    await vscode.workspace
      .getConfiguration('testing')
      .update('automaticallyOpenTestResults', value, vscode.ConfigurationTarget.Workspace);

    console.warn(`set "testing.automaticallyOpenTestResults" to "${value}"`);
  }

  public register(): vscode.Disposable[] {
    return [
      vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
      vscode.commands.registerCommand(`${extensionName}.save-output-config`, async () =>
        this.save()
      ),
      vscode.commands.registerCommand(`${extensionName}.disable-auto-focus`, async () =>
        this.disableAutoFocus()
      ),
    ];
  }

  public async disableAutoFocus(): Promise<void> {
    this.skipValidation = true;
    await this.updateTestResultsSettings();
    this.config.value.revealWithFocus = 'none';
    await this.save();
    this.skipValidation = false;
  }

  /** returns a readonly settings related to jest output */
  public outputConfigs(): OutputConfigs {
    return { outputConfig: { ...this.config }, openTesting: this.openTesting };
  }

  public isTestResultsConfigsValid(): boolean {
    switch (this.openTesting.value) {
      case 'openOnTestStart':
        return (
          this.config.value.revealWithFocus === 'test-results' &&
          this.config.value.revealOn === 'run'
        );
      case 'openOnTestFailure':
        return (
          this.config.value.revealWithFocus === 'test-results' &&
          this.config.value.revealOn === 'error'
        );
      default:
        return true;
    }
  }

  /**
   * Validates output settings for potential conflicts.
   * If conflict detected, show a warning message with options to update the settings.
   * @returns true if no conflict detected or user has resolved the conflict; false otherwise; undefined if validation is skipped.
   * @returns void
   */
  public async validate(): Promise<boolean | undefined> {
    if (this.skipValidation) {
      return;
    }

    //check for conflicts between testing.automaticallyOpenTestResults and jest.outputConfig.revealWithFocus
    if (this.isTestResultsConfigsValid()) {
      return true;
    }

    const detail =
      `Output Config Conflict Detected: test-results panel setting "testing.automaticallyOpenTestResults: ${this.openTesting.value}" ` +
      `conflicts with jest.outputConfig:\r\n ${JSON.stringify(this.config.value, undefined, 4)}.`;
    console.warn(detail);

    const actions = {
      fixIt: 'Fix it',
      help: 'Help',
      cancel: 'Cancel',
    };

    const buttons: string[] = [actions.fixIt, actions.help, actions.cancel];
    const selection = await vscode.window.showWarningMessage(
      `Output Config Conflict Detected (see console log for more details)`,
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
        detail: 'Set "testing.automaticallyOpenTestResults" to "neverOpen"',
      },
      fixOutputConfig: {
        label: '$(sync-ignored) Fix outputConfig setting',
        description: '(Match output config with current test-results panel setting)',
        detail: 'Set "jest.outputConfig.revealWithFocus" to "test-results" etc.',
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
        this.config.value.revealWithFocus = 'test-results';
        this.config.value.revealOn =
          this.openTesting.value === 'openOnTestFailure' ? 'error' : 'run';
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
      e.affectsConfiguration('testing.automaticallyOpenTestResults') ||
      e.affectsConfiguration('testing.openTesting')
    ) {
      this.initConfigs();
      this.validate();
    }
  }

  public async save(): Promise<void> {
    await vscode.workspace.getConfiguration('jest').update('outputConfig', this.config.value);
  }
}

export const outputManager = new OutputManager();
