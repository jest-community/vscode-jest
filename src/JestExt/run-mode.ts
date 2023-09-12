import * as vscode from 'vscode';
import {
  DeprecatedPluginResourceSettings,
  JestExtAutoRunSetting,
  JestPredefinedRunModeType,
  JestRunMode,
  JestRunModeSetting,
  JestRunModeType,
} from '../Settings';
import { NoOpFileSystemProvider } from '../noop-fs-provider';

const isJestRunMode = (obj: JestRunModeSetting | null | undefined): obj is JestRunMode =>
  obj != null && typeof obj !== 'string' && 'type' in obj;

interface RunModeQuickPickItem extends vscode.QuickPickItem {
  mode: JestRunMode;
  isCurrent?: boolean;
}
interface RunModeQuickPickButton extends vscode.QuickInputButton {
  action: () => Promise<JestRunMode>;
}
// export interface RunModeQuickSwitchOptions {
//   preserveCoverage?: boolean;
// }

export interface RunModeIcon {
  icon: string;
  label: string;
}
export interface RunModeDescription {
  type: RunModeIcon;
  coverage?: RunModeIcon;
  deferred?: RunModeIcon;
}

export const RunModeIcons: Record<string, RunModeIcon> = {
  watch: { icon: '$(eye)', label: 'watch' },
  'on-save': { icon: '$(save-all)', label: 'on-save' },
  'on-save-test-file-only': { icon: '$(save)', label: 'on-save-test-file-only' },
  manual: { icon: '$(run)', label: 'manual' },
  coverage: { icon: '$(color-mode)', label: 'coverage' },
  deferred: { icon: '$(debug-pause)', label: 'deferred' },
};

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

  public exitDeferMode() {
    this._config.deferred = false;
    this.isModified = true;
  }

  public toggleCoverage() {
    this._config.coverage = !this._config.coverage;
    this.isModified = true;
  }

  private getDefaultRunMode(setting: JestPredefinedRunModeType): JestRunMode {
    switch (setting.toLocaleLowerCase()) {
      case 'watch':
        return { type: 'watch', revealOutput: 'on-run' };
      case 'on-save':
        return { type: 'on-save', revealOutput: 'on-run' };
      case 'manual':
        return { type: 'manual', revealOutput: 'on-run' };
      case 'deferred':
        return {
          ...this.getDefaultRunMode('manual'),
          deferred: true,
        };
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
          runMode = this.getDefaultRunMode('watch') as JestRunMode;
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
    setting?: JestRunModeSetting | null,
    legacySettings?: DeprecatedPluginResourceSettings
  ): JestRunMode {
    if (isJestRunMode(setting)) {
      return setting;
    }

    try {
      // Determine the base run mode based on the provided setting, or fallback to legacy settings or default 'watch' mode.
      // If a setting is provided, use the default run mode for that setting.
      // If no setting is provided, check if legacy autoRun is enabled and use its run mode.
      // If neither setting nor legacy autoRun is available, use the default 'watch' mode.

      const base = (
        setting
          ? this.getDefaultRunMode(setting)
          : legacySettings?.autoRun
          ? this.fromAutoRun(legacySettings.autoRun)
          : this.getDefaultRunMode('watch')
      ) as JestRunMode;

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
  public async quickSwitch(context: vscode.ExtensionContext): Promise<boolean> {
    const runModeEditor = new RunModeEditor();
    const itemButtons = (mode: JestRunMode): RunModeQuickPickButton[] => {
      const coverageIcon = mode.coverage
        ? vscode.Uri.file(context.asAbsolutePath('icons/coverage-on-20.svg'))
        : new vscode.ThemeIcon('color-mode');
      const coverageButton = {
        iconPath: coverageIcon,
        tooltip: `toggle coverage ${mode.coverage ? 'off' : 'on'}`,
        action: () => {
          mode.coverage = !(mode.coverage ?? false);
          return Promise.resolve(mode);
        },
      };
      const deferredIcon = mode.deferred
        ? vscode.Uri.file(context.asAbsolutePath('icons/pause-on-20.svg'))
        : new vscode.ThemeIcon('debug-pause');
      const deferredButton = {
        iconPath: deferredIcon,
        tooltip: `toggle deferred ${mode.deferred ? 'off' : 'on'}`,
        action: () => {
          mode.deferred = !(mode.deferred ?? false);
          return Promise.resolve(mode);
        },
      };
      const editButton = {
        iconPath: new vscode.ThemeIcon('edit'),
        tooltip: `edit the runMode`,
        action: async () => {
          const edited = await runModeEditor.edit(mode);
          return edited ?? mode;
        },
      };

      return [coverageButton, deferredButton, editButton];
    };

    const runModeItem = (type: JestRunModeType): RunModeQuickPickItem => {
      let mode = this.getDefaultRunMode(type);

      const isCurrent = mode.type === this.config.type;
      if (isCurrent) {
        mode = { ...this.config };
      }

      const typeLabel = runModeDescription(mode).type;

      return {
        label: `${typeLabel.icon} ${typeLabel.label}`,
        description: isCurrent ? '(current)' : undefined,
        isCurrent,
        mode,
        buttons: itemButtons(mode),
      };
    };

    // create items
    const runModeTypes: JestRunModeType[] = ['watch', 'on-save', 'manual'];
    const items: RunModeQuickPickItem[] = runModeTypes.map((type) => runModeItem(type));
    let restoreOriginalItem: RunModeQuickPickItem | undefined;

    if (this.isModified) {
      const orig = this.toRunMode(this.setting, this.legacySettings);
      restoreOriginalItem = {
        label: '$(sync) Restore original runMode',
        description: ` ("${typeIcon(orig).label}")`,
        mode: orig,
      };
      items.push({ label: '', mode: { type: 'watch' }, kind: vscode.QuickPickItemKind.Separator });
      items.push(restoreOriginalItem);
    }

    // showing the quickPick
    const pickedItem = await showRunModeQuickPick(items, itemButtons);

    // make sure any open runMode editor is closed
    runModeEditor.close();

    if (pickedItem) {
      this._config = pickedItem.mode;
      if (pickedItem === restoreOriginalItem) {
        this.isModified = false;
      } else {
        this.isModified = true;
      }
      return true;
    }

    return false;
  }

  public saveCurrentConfig = async (): Promise<boolean> => {
    return Promise.reject(new Error('not implemented'));
  };
}

const showRunModeQuickPick = async (
  items: RunModeQuickPickItem[],
  itemButtons: (mode: JestRunMode) => RunModeQuickPickButton[]
): Promise<RunModeQuickPickItem | undefined> => {
  const acceptButton = {
    iconPath: new vscode.ThemeIcon('check'),
    tooltip: 'switch to the selected runMode',
  };
  const quickPick = vscode.window.createQuickPick<RunModeQuickPickItem>();
  quickPick.items = items;
  quickPick.title = 'Quick Switch RunMode';
  // quickPick.placeholder = 'Select the desired run mode for the current session';
  quickPick.ignoreFocusOut = true;
  quickPick.canSelectMany = false;
  quickPick.buttons = [vscode.QuickInputButtons.Back, acceptButton];
  let active = items.find((item) => item.isCurrent) ?? items[0];
  quickPick.activeItems = [active];

  return new Promise((resolve) => {
    let picked: RunModeQuickPickItem | undefined;
    let fixActiveHack = 0;
    quickPick.onDidTriggerButton(async (button) => {
      picked = button === vscode.QuickInputButtons.Back ? undefined : quickPick.activeItems[0];
      quickPick.hide();
    });
    quickPick.onDidTriggerItemButton(async (e) => {
      const item = e.item;
      if (item) {
        active = item;
        quickPick.activeItems = [item];

        const m = await (e.button as RunModeQuickPickButton).action();
        item.mode = m;
        item.buttons = itemButtons(item.mode);
        quickPick.items = [...items];

        // hack to fix the active item not showing up after items being reset
        // see issue: https://github.com/microsoft/vscode/issues/75005
        fixActiveHack = 2;

        quickPick.activeItems = [item];
        // quickPick.selectedItems = [item];
      }
    });
    quickPick.onDidChangeActive(() => {
      // hack to fix the active item not showing up after items being reset
      // see issue: https://github.com/microsoft/vscode/issues/75005
      if (fixActiveHack !== 0) {
        fixActiveHack--;
        quickPick.activeItems = [active];
        return;
      }
    });
    quickPick.onDidChangeSelection((selectedItems) => {
      // disable 'selection" since we work with 'active' item only.
      // With both active and select appearances is quite confusing, therefore, we disable the selection here.
      if (selectedItems.length > 0) {
        quickPick.selectedItems = [];
      }
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(picked);
    });
    quickPick.show();
  });
};

class RunModeEditor {
  // private doc?: vscode.TextDocument;
  private disposables: vscode.Disposable[] = [];
  private docUri = vscode.Uri.parse(`${NoOpFileSystemProvider.scheme}://workspace/runMode.json`);

  private dispose = () => {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  };
  async edit(config: JestRunMode): Promise<JestRunMode | undefined> {
    const content = `
// Save the file to accept the change.
// close without saving to cancel the change.
// RunMode reference: https://github.com/jest-community/vscode-jest/blob/master/README.md#runmode

${JSON.stringify(config, null, 4)}
`;
    // noOpFileSystemProvider.content = content;
    this.dispose();

    const doc = await vscode.workspace.openTextDocument(this.docUri);
    await vscode.languages.setTextDocumentLanguage(doc, 'jsonc');
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    await editor.edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          editor.document.lineAt(0).range.start,
          editor.document.lineAt(editor.document.lineCount - 1).range.end
        ),
        content
      );
    });
    // do this to make sure the document didn't show up as changed
    await doc.save();

    return new Promise((resolve) => {
      let edited: JestRunMode | undefined;

      this.disposables.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
          if (document === doc) {
            try {
              // Remove the comments from the document text
              const jsonText = document.getText().replace(/\/\/.*\n/g, '');

              // Parse the JSON content to validate it
              edited = JSON.parse(jsonText);
              resolve(edited);
              this.dispose();

              // Close the active editor
              vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            } catch (error) {
              // Show parse error
              vscode.window.showErrorMessage('JSON is invalid: ' + error);
            }
          }
        })
      );
      this.disposables.push(
        vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
          if (closedDoc.uri.toString() === doc.uri.toString()) {
            this.dispose();
            resolve(edited);
          }
        })
      );
    });
  }
  async close(ignoreUnsaved = true) {
    // find the editor for the docUri
    const uri = this.docUri.toString();
    const editor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri
    );
    if (editor) {
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
      if (ignoreUnsaved) {
        // force save the document to noop fs so we can close the editor without prompt
        await editor.document.save();
      }

      // since there didn't seem to have a way to close the given editor, we have to work around by
      // making the target editor active then close the activeEditor
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  }
}

export const runModeDescription = (config: JestRunMode): RunModeDescription => {
  let description: RunModeDescription;
  switch (config.type) {
    case 'watch':
    case 'manual':
      description = { type: RunModeIcons[config.type] };
      break;
    case 'on-save':
      if (config.testFileOnly) {
        description = { type: RunModeIcons['on-save-test-file-only'] };
      } else {
        description = { type: RunModeIcons['on-save'] };
      }
      break;
  }
  if (config.coverage) {
    description.coverage = RunModeIcons['coverage'];
  }
  if (config.deferred) {
    description.deferred = RunModeIcons['deferred'];
  }
  return description;
};

export const typeIcon = (mode: JestRunMode): RunModeIcon => {
  const desc = runModeDescription(mode);
  return desc.deferred ?? desc.type;
};
