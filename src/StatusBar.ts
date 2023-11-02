import * as vscode from 'vscode';
import { extensionName } from './appGlobals';
import { JestExt } from './JestExt';
import { TestStats, TestStatsCategory } from './types';
import { VirtualFolderBasedCache } from './virtual-workspace-folder';
import { isInFolder } from './workspace-manager';
import { RunMode, runModeDescription } from './JestExt/run-mode';

export enum StatusType {
  active,
  summary,
}

export type ProcessState = 'running' | 'success' | 'exec-error' | 'stopped' | 'initial' | 'done';
type SummaryState = 'summary-warning' | 'summary-pass' | 'stats-not-sync';

export type SBTestStats = TestStats & { isDirty?: boolean; state?: ProcessState };
export interface ExtensionStatus {
  mode?: RunMode;
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

class TypedStatusBarItem {
  public status: ExtensionStatus = {};
  public isVisible = false;
  constructor(
    public readonly type: StatusType,
    protected readonly actual: vscode.StatusBarItem
  ) {
    this.actual.hide();
  }
  hide() {
    this.actual.hide();
    this.isVisible = false;
  }
  show() {
    this.actual.show();
    this.isVisible = true;
  }
  render(options: { text?: string; tooltip?: string; backgroundColor?: vscode.ThemeColor }) {
    const { text, tooltip, backgroundColor } = options;
    this.actual.text = text ?? this.actual.text;
    this.actual.tooltip = tooltip ?? this.actual.tooltip;
    this.actual.backgroundColor = backgroundColor;
  }
  dispose() {
    this.actual.dispose();
  }
}
class FolderStatusBarItem extends TypedStatusBarItem {
  constructor(
    public readonly type: StatusType,
    protected readonly actual: vscode.StatusBarItem,
    public readonly workspaceFolder: vscode.WorkspaceFolder
  ) {
    super(type, actual);
  }
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
  // private _activeFolder?: string;
  private summaryOutput?: vscode.OutputChannel;

  constructor() {
    this.summaryStatusItem = this.createSummaryStatusBarItem();
  }

  private createSummaryStatusBarItem(): TypedStatusBarItem {
    const actual = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    actual.tooltip = 'Jest status summary of the workspace';

    const { showSummaryOutput } = this.itemCommands();
    actual.command = showSummaryOutput;

    return new TypedStatusBarItem(StatusType.summary, actual);
  }

  private createFolderStatusBarItem(workspaceFolder: vscode.WorkspaceFolder): FolderStatusBarItem {
    const actual = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
    actual.tooltip = 'Jest status of the active folder';

    const item = new FolderStatusBarItem(StatusType.active, actual, workspaceFolder);

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

    if (
      vscode.window.activeTextEditor?.document.uri &&
      isInFolder(vscode.window.activeTextEditor.document.uri, folder)
    ) {
      item.show();
    }
    return {
      update: (update: StatusBarUpdate) => {
        this.handleUpdate(item, update);
      },
    };
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor): void {
    const visibleItems = this.cache.getAllItems().filter((item) => item.isVisible);
    if (editor && editor.document) {
      const items = this.cache.findRelatedItems(editor.document.uri);
      items?.forEach((item) => {
        if (!item.isVisible) {
          this.updateItemStatus(item);
        } else {
          visibleItems.splice(visibleItems.indexOf(item), 1);
        }
      });
    }
    // hide the items no longer relevant
    visibleItems.forEach((item) => item.hide());
  }

  private handleUpdate(item: FolderStatusBarItem, update: StatusBarUpdate) {
    item.status = { ...item.status, ...update };

    if (item.isVisible) {
      this.updateItemStatus(item);
    }
    this.updateSummaryStatus();
  }

  private updateItemStatus(item: TypedStatusBarItem) {
    const tooltip = this.getModes(item.status.mode, false);
    const stateInfo = this.buildSourceStatusString(item.status);
    this.render(stateInfo, tooltip, item);
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

        statusBarItem.render({
          text: `${name}: ${stateInfo.label}`,
          tooltip: `'${item.workspaceFolder.name}' Jest: ${tooltip}`,
          backgroundColor: this.toThemeColor(stateInfo.backgroundColor),
        });
        break;
      }
      case StatusType.summary:
        statusBarItem.render({
          text: `Jest-WS: ${stateInfo.label}`,
          tooltip: `Workspace(s) stats: ${tooltip}`,
          backgroundColor: this.toThemeColor(stateInfo.backgroundColor),
        });
        break;
    }
    statusBarItem.show();
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
  private getModes(mode?: RunMode, showIcon = true): string {
    if (!mode) {
      return '';
    }

    const modesStrings = Object.values(runModeDescription(mode.config))
      .map((desc) => (showIcon ? desc.icon : desc.label))
      .filter((s) => s);
    return modesStrings.join(showIcon ? ' ' : ', ');
  }

  public removeWorkspaceFolder(folder: vscode.WorkspaceFolder) {
    const item = this.cache.getItemByFolderName(folder.name);
    if (item) {
      this.cache.deleteItemByFolder(folder);
      item.dispose();
    }
  }
  public dispose() {
    this.cache.getAllItems().forEach((item) => item.dispose());
  }
}

export const statusBar = new StatusBar();
