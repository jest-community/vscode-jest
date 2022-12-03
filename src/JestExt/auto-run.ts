import * as vscode from 'vscode';
import {
  JestExtAutoRunConfig,
  JestExtAutoRunSetting,
  JestExtAutoRunShortHand,
  OnSaveFileType,
  OnStartupType,
} from '../Settings';
import { AutoRunMode } from '../StatusBar';

export class AutoRun {
  private useOnConfig: boolean;
  private readonly onConfig: JestExtAutoRunConfig;
  private readonly offConfig: JestExtAutoRunConfig;

  constructor(setting: JestExtAutoRunSetting | null | undefined) {
    let config: JestExtAutoRunConfig;
    if (!setting) {
      config = this.toAutoRun('default');
    } else if (typeof setting === 'string') {
      config = this.toAutoRun(setting);
    } else {
      config = setting;
    }
    if (this.isConfigOff(config)) {
      this.offConfig = config;
      this.useOnConfig = false;
      // different from "default" (which is "watch") ? If user specifically set "off"
      // and want to turn on at runtime, we choose the one setting closest (in turns of trade-off metric)
      // to the original setting.
      this.onConfig = this.toAutoRun('on-save');
    } else {
      this.onConfig = config;
      this.useOnConfig = true;
      this.offConfig = this.toAutoRun('off');
    }
  }

  public get config(): JestExtAutoRunConfig {
    return this.useOnConfig ? this.onConfig : this.offConfig;
  }
  public get isOff(): boolean {
    return this.isConfigOff(this.config);
  }
  private isConfigOff(config: JestExtAutoRunConfig): boolean {
    return config.watch === false && config.onSave == null && config.onStartup == null;
  }
  public get isWatch(): boolean {
    return this.config.watch === true;
  }
  public get onSave(): OnSaveFileType | undefined {
    return this.config.watch === false ? this.config.onSave : undefined;
  }
  public get onStartup(): OnStartupType | undefined {
    return this.config.onStartup;
  }

  public get mode(): AutoRunMode {
    return this.autoRunMode();
  }
  public toggle(): void {
    this.useOnConfig = !this.useOnConfig;
  }

  private autoRunMode(): AutoRunMode {
    if (this.config.watch === false && !this.config.onSave && !this.config.onStartup) {
      return 'auto-run-off';
    }
    if (this.config.watch === true) {
      return 'auto-run-watch';
    }
    if (this.config.onSave === 'test-src-file') {
      return 'auto-run-on-save';
    }
    if (this.config.onSave === 'test-file') {
      return 'auto-run-on-save-test';
    }
    return 'auto-run-off';
  }

  private toAutoRun(shortHand: JestExtAutoRunShortHand): JestExtAutoRunConfig {
    switch (shortHand) {
      case 'legacy':
        return { watch: true, onStartup: ['all-tests'] };
      case 'default':
      case 'watch':
        return { watch: true };
      case 'off':
        return { watch: false };
      case 'on-save':
        return { watch: false, onSave: 'test-src-file' };
      default: {
        const message = `invalid autoRun setting "${shortHand}". Will use default setting instead`;
        console.error(message);
        vscode.window.showErrorMessage(message);
        return this.toAutoRun('default');
      }
    }
  }
}
