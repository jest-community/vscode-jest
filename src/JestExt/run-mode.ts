import * as vscode from 'vscode';
import {
  DeprecatedPluginResourceSettings,
  JestExtAutoRunSetting,
  JestPredefinedRunModeType,
  JestRunMode,
  JestRunModeSetting,
  JestRunModeType,
  updateSetting,
} from '../Settings';
import { NoOpFileSystemProvider } from '../noop-fs-provider';

const runModeTypes: JestRunModeType[] = ['watch', 'on-save', 'on-demand'];
const predefinedRunModeTypes: JestPredefinedRunModeType[] = [...runModeTypes, 'deferred'];

const isJestRunMode = (obj: JestRunModeSetting | null | undefined): obj is JestRunMode =>
  obj != null && typeof obj !== 'string' && 'type' in obj;

interface RunModeQuickPickItem extends vscode.QuickPickItem {
  mode: JestRunMode;
  isCurrent?: boolean;
}
interface RunModeQuickPickButton extends vscode.QuickInputButton {
  action: () => Promise<JestRunMode>;
}

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
  'on-demand': { icon: '$(run)', label: 'on-demand' },
  coverage: { icon: '$(color-mode)', label: 'coverage' },
  deferred: { icon: '$(debug-pause)', label: 'deferred' },
};

export class RunMode {
  private _config: JestRunMode;
  private origConfig: Readonly<JestRunMode>;
  private _isModified = false;

  constructor(
    setting?: JestRunMode | JestRunModeType | null,
    legacySettings?: DeprecatedPluginResourceSettings
  ) {
    this._config = this.toRunMode(setting, legacySettings);
    this.origConfig = { ...this._config };
  }

  /** returns readonly config */
  public get config(): Readonly<JestRunMode> {
    return this._config;
  }
  public get isModified(): Readonly<boolean> {
    return this._isModified;
  }

  public exitDeferMode() {
    this._config.deferred = false;
    this._isModified = true;
  }

  public toggleCoverage() {
    this._config.coverage = !this._config.coverage;
    this._isModified = true;
  }

  static validate(config: JestRunModeSetting): void {
    let errConfigType: string | undefined;
    if (isJestRunMode(config) && !runModeTypes.includes(config.type)) {
      errConfigType = config.type;
    } else if (typeof config === 'string' && !predefinedRunModeTypes.includes(config)) {
      errConfigType = config;
    }

    if (errConfigType) {
      throw new Error(
        `Invalid type "${errConfigType}" in jest.runMode setting: ${JSON.stringify(config)}`
      );
    }
  }

  private getDefaultRunMode(setting: JestPredefinedRunModeType): JestRunMode {
    switch (setting.toLocaleLowerCase()) {
      case 'watch':
        return { type: 'watch', revealOutput: 'on-run' };
      case 'on-save':
        return { type: 'on-save', revealOutput: 'on-run' };
      case 'on-demand':
        return { type: 'on-demand', revealOutput: 'on-run' };
      case 'deferred':
        return {
          ...this.getDefaultRunMode('on-demand'),
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
          runMode = this.getDefaultRunMode('on-demand');
          break;
        default:
          throw new Error(`invalid autoRun ${setting}`);
      }
    } else {
      if (setting.watch) {
        runMode = this.getDefaultRunMode('watch');
      } else {
        runMode = this.getDefaultRunMode('on-demand');
        if ('onSave' in setting && setting.onSave) {
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
    console.warn(`"autoRun" is deprecated and replaced by "runMode": ${JSON.stringify(runMode)}`);
    return runMode;
  }
  private toRunMode(
    setting?: JestRunModeSetting | null,
    legacySettings?: DeprecatedPluginResourceSettings
  ): JestRunMode {
    try {
      if (setting) {
        RunMode.validate(setting);

        if (isJestRunMode(setting)) {
          return { ...setting };
        }
        return this.getDefaultRunMode(setting);
      }

      // Determine the base run mode based on the provided setting, or fallback to legacy settings or default 'watch' mode.
      // If a setting is provided, use the default run mode for that setting.
      // If no setting is provided, check if legacy autoRun is enabled and use its run mode.
      // If neither setting nor legacy autoRun is available, use the default 'watch' mode.

      const base = (
        legacySettings?.autoRun
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
            base.revealOutput = 'on-demand';
            break;
          default:
            throw new Error(`invalid autoRevealOutput ${legacySettings.autoRevealOutput}`);
        }
      }
      return base;
    } catch (e) {
      // sever user error, while we can fallback to the default, it might not be what the user intended.
      // therefore raise a prominent error message.
      // This should only happen when experienced user specified a runMode with the wrong value, i.e. rare, and should not happen to new users.
      const message = `invalid runMode ${JSON.stringify(
        setting
      )}, will use default RunMode instead`;
      console.error(message);
      vscode.window.showErrorMessage(message);
      return this.getDefaultRunMode('watch');
    }
  }

  protected clone(config: JestRunMode): RunMode {
    const newRunMode = new RunMode(this.origConfig);
    newRunMode._config = { ...config };
    return newRunMode;
  }

  /**
   * pop up a chooser to allow user change runMode
   * @returns the new runMode or undefined if nothing is changed
   */
  public async quickSwitch(context: vscode.ExtensionContext): Promise<RunMode | undefined> {
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
      const runModeSchemaUri = vscode.Uri.file(
        context.asAbsolutePath('syntaxes/jestRunModeSchema.json')
      );
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
          const edited = await runModeEditor.edit(mode, runModeSchemaUri);
          return edited ? this.toRunMode(edited) : mode;
        },
      };

      return [coverageButton, deferredButton, editButton];
    };

    const runModeItem = (type: JestRunModeType): RunModeQuickPickItem => {
      let mode = this.getDefaultRunMode(type);

      const isCurrent = mode.type === this.config.type;
      if (isCurrent) {
        mode = { ...this._config };
      }

      const typeLabel = runModeDescription(mode).type;

      return {
        label: `${typeLabel.icon} ${mode.type}`,
        description: isCurrent ? '(current)' : undefined,
        isCurrent,
        mode,
        buttons: itemButtons(mode),
      };
    };

    // create items
    const items: RunModeQuickPickItem[] = runModeTypes.map((type) => runModeItem(type));
    let restoreOriginalItem: RunModeQuickPickItem | undefined;

    if (this._isModified) {
      restoreOriginalItem = {
        label: '$(sync) Restore original runMode',
        description: ` ("${typeIcon(this.origConfig).label}")`,
        mode: { ...this.origConfig },
      };
      items.push({ label: '', mode: { type: 'watch' }, kind: vscode.QuickPickItemKind.Separator });
      items.push(restoreOriginalItem);
    }

    // showing the quickPick
    const pickedItem = await showRunModeQuickPick(items, itemButtons);

    // make sure any open runMode editor is closed
    await runModeEditor.close();

    if (pickedItem) {
      const newRunMode = this.clone(pickedItem.mode);
      if (pickedItem === restoreOriginalItem) {
        newRunMode._isModified = false;
      } else {
        newRunMode._isModified = true;
      }
      return newRunMode;
    }
  }

  /**
   * save runMode to the workspace settings
   * @returns
   */
  public save = (workspaceFolder: vscode.WorkspaceFolder): Promise<void> => {
    return updateSetting(workspaceFolder, 'runMode', this.config);
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
        quickPick.activeItems = [active];

        const m = await (e.button as RunModeQuickPickButton).action();
        const found = items.find((item) => item.mode.type === m.type);

        /* this following condition should not happen, and can't really be tested based on today's implementation, */
        /* but decided to leave it here anyway for error proof... */
        /* istanbul ignore next */
        if (!found) {
          vscode.window.showErrorMessage(`Disregard changes: invalid runMode type: ${m.type}.`);
          return;
        }
        // active might have changed, so we need to update it
        active = found;
        quickPick.activeItems = [active];

        found.mode = m;
        found.buttons = itemButtons(found.mode);
        quickPick.items = [...items];

        // hack to fix the active item not showing up after items being reset
        // see issue: https://github.com/microsoft/vscode/issues/75005
        fixActiveHack = 2;

        quickPick.activeItems = [active];
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

const RunModeEditInstruction = `
// Save the file to accept the change.
// close without saving to cancel the change.
// RunMode reference: https://github.com/jest-community/vscode-jest/blob/master/README.md#runmode
`;

export class RunModeEditor {
  // private doc?: vscode.TextDocument;
  private disposables: vscode.Disposable[] = [];
  private docUri = vscode.Uri.parse(`${NoOpFileSystemProvider.scheme}://workspace/runMode.json`);

  private dispose = () => {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.cancelEdit = undefined;
  };
  private cancelEdit: (() => void) | undefined;

  async edit(config: JestRunMode, schemaUri: vscode.Uri): Promise<JestRunModeSetting | undefined> {
    this.dispose();

    const jsonObject = {
      $schema: schemaUri.toString(),
      'jest.runMode': config,
    };
    const content = RunModeEditInstruction + JSON.stringify(jsonObject, null, 4);

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

    return new Promise((_resolve) => {
      // let edited: JestRunModeSetting | undefined;
      let resolved = false;

      const resolve = (value?: JestRunModeSetting) => {
        if (!resolved) {
          _resolve(value);
          resolved = true;
          this.dispose();
        }
      };
      this.cancelEdit = () => resolve(undefined);

      this.disposables.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
          if (document === doc) {
            try {
              // Remove the comments from the document text
              let jsonText = document.getText();
              jsonText = jsonText.slice(jsonText.indexOf('{'));
              if (jsonText) {
                // Parse the JSON content to validate it
                const jsonObject = JSON.parse(jsonText);
                const edited = jsonObject['jest.runMode'];
                if (edited) {
                  RunMode.validate(edited);
                  resolve(edited);
                  // Close the active editor
                  vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                  return;
                }
              }
              throw new Error(`invalid runMode JSON content`);
            } catch (error) {
              // Show parse error
              vscode.window.showErrorMessage('RunMode is invalid: ' + error);
            }
          }
        })
      );
      this.disposables.push(
        vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
          if (closedDoc.uri.toString() === doc.uri.toString()) {
            resolve();
          }
        })
      );
    });
  }
  async close() {
    this.cancelEdit?.();

    // find the editor for the docUri
    const uri = this.docUri.toString();
    const editor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri
    );
    if (editor) {
      // force save the document to noop fs so we can close the editor without prompt
      await editor.document.save();

      // since there didn't seem to have a way to close the given editor, we have to work around by
      // making the target editor active then close the activeEditor
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    this.dispose();
  }
}

export const runModeDescription = (config: JestRunMode): RunModeDescription => {
  let description: RunModeDescription;
  switch (config.type) {
    case 'watch':
    case 'on-demand':
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
