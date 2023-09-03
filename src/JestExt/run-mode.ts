import * as vscode from 'vscode';
import {
  DeprecatedPluginResourceSettings,
  JestExtAutoRunSetting,
  JestRunMode,
  JestRunModeType,
} from '../Settings';

const isJestRunMode = (obj: JestRunModeType | JestRunMode | null | undefined): obj is JestRunMode =>
  obj != null && typeof obj !== 'string' && 'type' in obj;

interface RunModeQuickPickItem extends vscode.QuickPickItem {
  action?: () => Promise<boolean>;
}
export interface RunModeQuickSwitchOptions {
  preserveCoverage?: boolean;
}

export class RunMode {
  private _config: JestRunMode;
  // indicate if the runMode.type is changed
  public isModified = false;

  // altConfig is used to store the user's runtime config, if different from the original config

  constructor(
    private setting?: JestRunMode | JestRunModeType | null,
    private legacySettings?: DeprecatedPluginResourceSettings
  ) {
    this._config = this.toRunMode(setting, legacySettings);

    console.log(`runMode = ${JSON.stringify(this._config)}`);
  }

  /** returns readonly config */
  public get config(): Readonly<JestRunMode> {
    return this._config;
  }

  public activateDeferred() {
    if (this._config.type === 'deferred') {
      this._config = this._config.deferredRunMode;
      this.isModified = true;
    }
  }
  public toggleCoverage() {
    // note: we purposely do not consider this as "modified", thus not setting isModified to true
    this._config.coverage = !this._config.coverage;
  }

  private getDefaultRunMode(setting: JestRunModeType): JestRunMode {
    switch (setting.toLocaleLowerCase()) {
      case 'watch':
        return { type: 'watch', revealOutput: 'on-run' };
      case 'on-save':
        return { type: 'on-save', revealOutput: 'on-run' };
      case 'manual':
        return { type: 'manual', revealOutput: 'on-run' };
      case 'deferred':
        return {
          type: 'deferred',
          revealOutput: 'manual',
          deferredRunMode: this.getDefaultRunMode('manual'),
        };
      case 'disabled':
        return { type: 'disabled' };
      default: {
        throw new Error(`invalid runMode ${setting}`);
      }
    }
  }
  private fromAutoRun(setting: JestExtAutoRunSetting): JestRunMode {
    let runMode: JestRunMode;
    if (typeof setting === 'string') {
      switch (setting) {
        case 'default':
        case 'watch':
          runMode = this.getDefaultRunMode('watch');
          break;
        case 'on-save':
          runMode = this.getDefaultRunMode('on-save');
          break;
        case 'legacy':
          runMode = this.getDefaultRunMode('watch');
          runMode.runAllTestsOnStartup = true;
          break;
        case 'off':
          runMode = this.getDefaultRunMode('manual');
          break;
        default:
          throw new Error(`invalid autoRun ${setting}`);
      }
    } else {
      if (setting.watch) {
        runMode = this.getDefaultRunMode('watch');
      } else {
        runMode = this.getDefaultRunMode('manual');
        if (setting.onSave) {
          runMode = this.getDefaultRunMode('on-save');
          if (runMode.type === 'on-save' && setting.onSave === 'test-file') {
            runMode.testFileOnly = true;
          }
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((setting as any).onStartup?.includes('all-tests')) {
      runMode.runAllTestsOnStartup = true;
    }
    console.log(`"autoRun" is deprecated and replaced by "runMode": ${JSON.stringify(runMode)}`);
    return runMode;
  }
  private toRunMode(
    setting?: JestRunModeType | JestRunMode | null,
    legacySettings?: DeprecatedPluginResourceSettings
  ): JestRunMode {
    if (legacySettings?.enable === false) {
      return this.getDefaultRunMode('disabled');
    }

    if (isJestRunMode(setting)) {
      return setting;
    }

    try {
      const base = setting
        ? this.getDefaultRunMode(setting)
        : legacySettings?.autoRun
        ? this.fromAutoRun(legacySettings.autoRun)
        : this.getDefaultRunMode('watch');

      if (legacySettings?.showCoverageOnLoad) {
        base.coverage = true;
      }
      if (legacySettings?.autoRevealOutput) {
        switch (legacySettings.autoRevealOutput) {
          case 'on-run':
          case 'on-exec-error':
            base.revealOutput = legacySettings.autoRevealOutput;
            break;
          case 'off':
            base.revealOutput = 'manual';
            break;
          default:
            throw new Error(`invalid autoRevealOutput ${legacySettings.autoRevealOutput}`);
        }
      }
      return base;
    } catch (e) {
      const message = `invalid runMode ${JSON.stringify(
        setting
      )}, will use default RunMode instead`;
      console.error(message);
      vscode.window.showErrorMessage(message);
      return this.getDefaultRunMode('watch');
    }
  }

  /**
   * pop up a chooser to allow user change runMode types
   * @returns true if runMode is changed, false if runMode didn't change
   */
  public async quickSwitch(options?: RunModeQuickSwitchOptions): Promise<boolean> {
    const runModeItem = (type: JestRunModeType): RunModeQuickPickItem => {
      const mode = this.getDefaultRunMode(type);
      const active = mode.type === this.config.type;
      return {
        label: `${runModeIcon(mode)} ${mode.type}`,
        description: active ? '$(check)' : undefined,
        action: () => {
          const coverage = options?.preserveCoverage ? this._config.coverage : mode.coverage;
          this._config = mode;
          this._config.coverage = coverage;
          this.isModified = true;
          return Promise.resolve(true);
        },
      };
    };

    // runMode
    const runModeTypes: JestRunModeType[] = ['watch', 'on-save', 'manual', 'deferred'];
    const items: RunModeQuickPickItem[] = runModeTypes.map((type) => runModeItem(type));
    items.unshift({ label: 'RunMode', kind: vscode.QuickPickItemKind.Separator });

    // // coverage
    // items.push({ label: 'Coverage', kind: vscode.QuickPickItemKind.Separator });
    // const coverage = this.config.coverage ?? false;
    // items.push({
    //   label: `$(color-mode) Toggle coverage ${coverageString(!coverage)}`,
    //   description: ` (current: ${coverageString(coverage)})`,
    //   action: () => {
    //     this._config.coverage = !coverage;
    //     this.isModified = true;
    //     return Promise.resolve(true);
    //   },
    // });

    // misc
    // items.push({
    //   label: '$(edit) Edit RunMode',
    //   detail: 'Edit the detailed config manually in an editor',
    //   action: this.edit,
    // });
    // items.push({
    //   label: '$(archive) Save RunMode',
    //   detail: 'Save the RunMode permanently. This will override your vscode settings.',
    //   action: this.save,
    // });

    if (this.isModified) {
      items.push({ label: 'Restore', kind: vscode.QuickPickItemKind.Separator });
      items.push({
        label: '$(sync) Restore to original runMode',
        description: ` (original: "${this._config.type}")`,
        action: () => {
          this._config = this.toRunMode(this.setting, this.legacySettings);
          this.isModified = false;
          return Promise.resolve(true);
        },
      });
    }

    const item = await vscode.window.showQuickPick<RunModeQuickPickItem>(items, {
      title: 'Quick Switch RunMode',
      placeHolder: 'Select the desired run mode for the current session',
    });

    return item?.action?.() ?? false;
  }

  public saveCurrentConfig = async (): Promise<boolean> => {
    return Promise.reject(new Error('not implemented'));
  };
}

// const coverageString = (value: boolean) => (value ? 'on' : 'off');

export const runModeIcon = (mode: JestRunMode): string => {
  switch (mode.type) {
    case 'watch':
      return '$(eye)';
    case 'on-save':
      return mode.testFileOnly ? '$(save)' : '$(save-all)';
    case 'manual':
      return '$(run)';
    case 'deferred':
      return '$(beaker-stop)';
    case 'disabled':
      return '$(close)';
  }
};
