import * as vscode from 'vscode';
import { extensionName } from './appGlobals';
import { JestExt } from './JestExt';
import { TestStats, TestStatsCategory } from './types';
import { VirtualFolderBasedCache } from './virtual-workspace-folder';

export enum StatusType {
  active,
  summary,
}

export type ProcessState = 'running' | 'success' | 'exec-error' | 'stopped' | 'initial' | 'done';
export type AutoRunMode =
  | 'auto-run-watch'
  | 'auto-run-on-save'
  | 'auto-run-on-save-test'
  | 'auto-run-off';
export type Mode = AutoRunMode | 'coverage';

type SummaryState = 'summary-warning' | 'summary-pass' | 'stats-not-sync';

export type SBTestStats = TestStats & { isDirty?: boolean; state?: ProcessState };
export interface ExtensionStatus {
  mode?: Mode[];
  stats?: SBTestStats;
  state?: ProcessState;
}

export interface SourceStatus {
  source: string;
  status: ExtensionStatus;
}

export type StatusBarUpdate = Partial<ExtensionStatus>;

export interface StatusBarUpdateRequest {
  update: (status: StatusBarUpdate) => void;
}
interface TypedStatusBarItem {
  actual: vscode.StatusBarItem;
  readonly type: StatusType;
}

interface FolderStatusBarItem extends TypedStatusBarItem {
  workspaceFolder: vscode.WorkspaceFolder;
  status: ExtensionStatus;
}

type BGColor = 'error' | 'warning';

interface StateInfo {
  label: string;
  backgroundColor?: BGColor;
}

export class StatusBar {
  private summaryStatusItem: TypedStatusBarItem;
  private warningColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  private errorColor = new vscode.ThemeColor('statusBarItem.errorBackground');

  private cache = new VirtualFolderBasedCache<FolderStatusBarItem>();
  private _activeFolder?: string;
  private summaryOutput?: vscode.OutputChannel;

  constructor() {
    this.summaryStatusItem = this.createSummaryStatusBarItem();
  }

  private createSummaryStatusBarItem(): TypedStatusBarItem {
    const actual = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    actual.tooltip = 'Jest status summary of the workspace';

    const { showSummaryOutput } = this.itemCommands();
    actual.command = showSummaryOutput;

    return {
      type: StatusType.summary,
      actual,
    };
  }

  private createFolderStatusBarItem(workspaceFolder: vscode.WorkspaceFolder): FolderStatusBarItem {
    let item = this.cache.getItemByFolderName(workspaceFolder.name);
    if (item) {
      return item;
    }
    const actual = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
    actual.tooltip = 'Jest status of the active folder';

    item = {
      type: StatusType.active,
      workspaceFolder,
      status: {},
      actual,
    };

    const { showActiveOutput } = this.itemCommands();
    actual.command = { title: 'show test output', command: showActiveOutput, arguments: [item] };

    this.cache.addItem(item);
    return item;
  }

  private itemCommands() {
    const showSummaryOutput = `${extensionName}.show-summary-output`;
    const showActiveOutput = `${extensionName}.show-active-output`;

    return { showSummaryOutput, showActiveOutput };
  }

  register(getExtension: (name: string) => JestExt | undefined): vscode.Disposable[] {
    const { showSummaryOutput, showActiveOutput } = this.itemCommands();
    return [
      vscode.commands.registerCommand(showSummaryOutput, () => {
        if (this.summaryOutput) {
          this.summaryOutput.show();
        }
      }),
      vscode.commands.registerCommand(showActiveOutput, (item: FolderStatusBarItem) => {
        const ext = getExtension(item.workspaceFolder.name);
        if (ext) {
          ext.showOutput();
        }
      }),
    ];
  }
  bind(folder: vscode.WorkspaceFolder): StatusBarUpdateRequest {
    const item =
      this.cache.getItemByFolderName(folder.name) ?? this.createFolderStatusBarItem(folder);

    return {
      update: (update: StatusBarUpdate) => {
        this.handleUpdate(item, update);
      },
    };
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor): void {
    if (editor && editor.document) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (folder && folder.name !== this._activeFolder) {
        this._activeFolder = folder.name;
        this.updateActiveStatus();
      }
    }
  }

  private handleUpdate(item: FolderStatusBarItem, update: StatusBarUpdate) {
    item.status = { ...item.status, ...update };

    this.updateActiveStatus();
    this.updateSummaryStatus();
  }

  private get activeFolder() {
    if (!this._activeFolder) {
      if (vscode.workspace.workspaceFolders?.length === 1) {
        // there's only one workspaceFolder, so let's take it
        this._activeFolder = vscode.workspace.workspaceFolders[0].name;
      } else if (vscode.window.activeTextEditor) {
        // otherwise select correct workspaceFolder based on the currently open textEditor
        const folder = vscode.workspace.getWorkspaceFolder(
          vscode.window.activeTextEditor.document.uri
        );
        if (folder) {
          this._activeFolder = folder.name;
        }
      }
    }
    return this._activeFolder;
  }

  private updateActiveStatus() {
    let matchedItems: FolderStatusBarItem[] | undefined;
    const allItems = this.cache.getAllItems();

    if (this.activeFolder) {
      matchedItems = this.cache.getItemsByActualFolderName(this.activeFolder);
    } else {
      if (allItems.length === 1) {
        matchedItems = allItems;
      }
    }

    allItems.forEach((item) => {
      if (matchedItems?.find((mi) => mi.actual === item.actual)) {
        const tooltip = this.getModes(item.status.mode, false);
        const stateInfo = this.buildSourceStatusString(item.status);
        this.render(stateInfo, tooltip, item);
        item.actual.show();
      } else {
        item.actual.hide();
      }
    });
  }

  private updateSummaryStats(status: ExtensionStatus, summaryStats: SBTestStats): void {
    summaryStats.fail += status.stats?.fail ?? 0;
    summaryStats.success += status.stats?.success ?? 0;
    summaryStats.unknown += status.stats?.unknown ?? 0;
    if (status.stats?.isDirty) {
      summaryStats.isDirty = true;
    }
  }

  private updateSummaryStatus() {
    if (this.needsSummaryStatus()) {
      this.updateSummaryOutput();

      const summaryStats: SBTestStats = { fail: 0, success: 0, unknown: 0 };
      let backgroundColor: BGColor | undefined;
      for (const item of this.cache.getAllItems()) {
        this.updateSummaryStats(item.status, summaryStats);
        if (!backgroundColor) {
          const color = item.status.state && this.getStateInfo(item.status.state).backgroundColor;
          if (color) {
            backgroundColor = 'warning';
          }
        }
      }
      const tooltip = this.buildStatsString(summaryStats, false);
      this.render(
        { label: this.buildStatsString(summaryStats), backgroundColor },
        tooltip,
        this.summaryStatusItem
      );
      return;
    }
    this.summaryStatusItem.actual.hide();
  }
  private buildStatsString(stats: SBTestStats, showIcon = true, alwaysShowDetails = false): string {
    const summary: SummaryState = stats.isDirty
      ? 'stats-not-sync'
      : stats.fail + stats.unknown === 0 && stats.success > 0
      ? 'summary-pass'
      : 'summary-warning';
    const output: string[] = [this.getMessageByState(summary, showIcon)];

    if (summary !== 'summary-pass' || alwaysShowDetails) {
      const parts = [
        `${this.getMessageByState('success', showIcon)} ${stats.success}`,
        `${this.getMessageByState('fail', showIcon)} ${stats.fail}`,
        `${this.getMessageByState('unknown', showIcon)} ${stats.unknown}`,
      ];
      output.push(parts.join(showIcon ? ' ' : ', '));
    }
    return output.filter((s) => s).join(' | ');
  }

  private buildSourceStatusString(status: ExtensionStatus): StateInfo {
    const stateInfo = status.state && this.getStateInfo(status.state);

    const parts: string[] = [stateInfo?.label ?? '', status.mode ? this.getModes(status.mode) : ''];
    return {
      label: parts.filter((s) => s.length > 0).join(' | '),
      backgroundColor: stateInfo?.backgroundColor,
    };
  }

  private toThemeColor(color?: BGColor): vscode.ThemeColor | undefined {
    switch (color) {
      case 'error':
        return this.errorColor;
      case 'warning':
        return this.warningColor;
    }
  }
  private render(stateInfo: StateInfo, tooltip: string, statusBarItem: TypedStatusBarItem) {
    switch (statusBarItem.type) {
      case StatusType.active: {
        const item = statusBarItem as FolderStatusBarItem;
        const name = this.cache.size > 1 ? `Jest (${item.workspaceFolder.name})` : 'Jest';

        statusBarItem.actual.text = `${name}: ${stateInfo.label}`;
        statusBarItem.actual.tooltip = `'${this.activeFolder}' Jest: ${tooltip}`;
        statusBarItem.actual.backgroundColor = this.toThemeColor(stateInfo.backgroundColor);
        break;
      }
      case StatusType.summary:
        statusBarItem.actual.text = `Jest-WS: ${stateInfo.label}`;
        statusBarItem.actual.tooltip = `Workspace(s) stats: ${tooltip}`;
        statusBarItem.actual.backgroundColor = this.toThemeColor(stateInfo.backgroundColor);
        break;
    }
    statusBarItem.actual.show();
  }

  private updateSummaryOutput() {
    if (!this.summaryOutput) {
      this.summaryOutput = vscode.window.createOutputChannel('Jest (Workspace)');
    }
    this.summaryOutput.clear();

    const messages: string[] = [];
    this.cache.getAllItems().forEach((item) => {
      const parts: string[] = [
        item.status.stats ? this.buildStatsString(item.status.stats, false, true) : '',
        item.status.mode ? `mode: ${this.getModes(item.status.mode, false)}` : '',
        item.status.state ? `state: ${this.getMessageByState(item.status.state, false)}` : '',
      ];
      const summary = parts.filter((s) => s.length > 0).join('; ');
      messages.push(`${item.workspaceFolder.name}:\t\t${summary}`);
    });
    this.summaryOutput.append(messages.join('\n'));
  }

  private needsSummaryStatus() {
    return this.cache.size > 0;
  }

  private getStateInfo(
    state: ProcessState | TestStatsCategory | SummaryState,
    showIcon = true
  ): StateInfo {
    switch (state) {
      case 'running':
        return { label: showIcon ? '$(sync~spin)' : state };
      case 'fail':
        return { label: showIcon ? '$(error)' : state };
      case 'summary-warning':
        return { label: showIcon ? '' : 'warning' };
      case 'exec-error':
        return { label: showIcon ? '$(alert)' : state, backgroundColor: 'error' };
      case 'stopped':
        return { label: state, backgroundColor: 'error' };
      case 'success':
        return { label: showIcon ? '$(pass)' : state };
      case 'initial':
        return { label: showIcon ? '...' : state };
      case 'unknown':
        return { label: showIcon ? '$(question)' : state };
      case 'done':
        return { label: showIcon ? '' : 'idle' };
      case 'summary-pass':
        return { label: showIcon ? '$(check)' : 'pass' };
      case 'stats-not-sync':
        return { label: showIcon ? '$(sync-ignored)' : state, backgroundColor: 'warning' };

      default:
        return { label: state };
    }
  }
  private getMessageByState(
    state: ProcessState | TestStatsCategory | SummaryState,
    showIcon: boolean
  ): string {
    return this.getStateInfo(state, showIcon).label;
  }
  private getModes(modes?: Mode[], showIcon = true): string {
    if (!modes || modes.length <= 0) {
      return '';
    }
    const modesStrings = modes.map((m) => {
      if (!showIcon) {
        return m;
      }
      switch (m) {
        case 'coverage':
          return '$(color-mode)';
        case 'auto-run-watch':
          return '$(eye)';
        case 'auto-run-on-save':
          return '$(save-all)';
        case 'auto-run-on-save-test':
          return '$(save)';
        case 'auto-run-off':
          return '$(wrench)';
      }
    });
    return modesStrings.join(showIcon ? ' ' : ', ');
  }

  public removeWorkspaceFolder(folder: vscode.WorkspaceFolder) {
    const item = this.cache.getItemByFolderName(folder.name);
    if (item) {
      this.cache.deleteItemByFolder(folder);
      item.actual.dispose();
    }
  }
  public dispose() {
    this.cache.getAllItems().forEach((item) => item.actual.dispose());
  }
}

export const statusBar = new StatusBar();
