import * as vscode from 'vscode';
import { extensionName } from './appGlobals';
import { JestExt } from './JestExt';
import { TestStats, TestStatsCategory } from './types';

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

type BGColor = 'error' | 'warning';

interface StateInfo {
  label: string;
  backgroundColor?: BGColor;
}

const createStatusBarItem = (type: StatusType, priority: number): TypedStatusBarItem => {
  return {
    type,
    actual: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority),
  };
};

// The bottom status bar
export class StatusBar {
  private activeStatusItem = createStatusBarItem(StatusType.active, 2);
  private summaryStatusItem = createStatusBarItem(StatusType.summary, 1);
  private warningColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  private errorColor = new vscode.ThemeColor('statusBarItem.errorBackground');

  private sourceStatusMap = new Map<string, SourceStatus>();
  private _activeFolder?: string;
  private summaryOutput?: vscode.OutputChannel;

  constructor() {
    this.summaryStatusItem.actual.tooltip = 'Jest status summary of the workspace';
    this.activeStatusItem.actual.tooltip = 'Jest status of the active folder';
  }

  register(getExtension: (name: string) => JestExt | undefined): vscode.Disposable[] {
    const showSummaryOutput = `${extensionName}.show-summary-output`;
    const showActiveOutput = `${extensionName}.show-active-output`;
    this.summaryStatusItem.actual.command = showSummaryOutput;
    this.activeStatusItem.actual.command = showActiveOutput;

    return [
      vscode.commands.registerCommand(showSummaryOutput, () => {
        if (this.summaryOutput) {
          this.summaryOutput.show();
        }
      }),
      vscode.commands.registerCommand(showActiveOutput, () => {
        if (this.activeFolder) {
          const ext = getExtension(this.activeFolder);
          if (ext) {
            ext.showOutput();
          }
        }
      }),
    ];
  }
  bind(source: string): StatusBarUpdateRequest {
    return {
      update: (update: StatusBarUpdate) => {
        this.handleUpdate(source, update);
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

  private handleUpdate(source: string, update: StatusBarUpdate) {
    const ss = this.sourceStatusMap.get(source) ?? { source, status: {} };
    ss.status = { ...ss.status, ...update };
    this.sourceStatusMap.set(source, ss);

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
    let ss: SourceStatus | undefined;
    if (this.activeFolder) {
      ss = this.sourceStatusMap.get(this.activeFolder);
    } else if (this.sourceStatusMap.size === 1) {
      ss = this.sourceStatusMap.values().next().value;
    }

    if (ss) {
      const tooltip = this.getModes(ss.status.mode, false);
      const stateInfo = this.buildSourceStatusString(ss);
      this.render(stateInfo, tooltip, this.activeStatusItem);
    } else {
      this.activeStatusItem.actual.hide();
    }
  }

  private updateSummaryStats(ss: SourceStatus, summaryStats: SBTestStats): void {
    summaryStats.fail += ss.status.stats?.fail ?? 0;
    summaryStats.success += ss.status.stats?.success ?? 0;
    summaryStats.unknown += ss.status.stats?.unknown ?? 0;
    if (ss.status.stats?.isDirty) {
      summaryStats.isDirty = true;
    }
  }

  private updateSummaryStatus() {
    if (this.needsSummaryStatus()) {
      this.updateSummaryOutput();

      const summaryStats: SBTestStats = { fail: 0, success: 0, unknown: 0 };
      let backgroundColor: BGColor | undefined;
      for (const ss of this.sourceStatusMap.values()) {
        this.updateSummaryStats(ss, summaryStats);
        if (!backgroundColor) {
          const color = ss.status.state && this.getStateInfo(ss.status.state).backgroundColor;
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

  private buildSourceStatusString(ss: SourceStatus): StateInfo {
    const stateInfo = ss.status.state && this.getStateInfo(ss.status.state);

    const parts: string[] = [
      stateInfo?.label ?? '',
      ss.status.mode ? this.getModes(ss.status.mode) : '',
    ];
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
        statusBarItem.actual.text = `Jest: ${stateInfo.label}`;
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
    this.sourceStatusMap.forEach((ss) => {
      const parts: string[] = [
        ss.status.stats ? this.buildStatsString(ss.status.stats, false, true) : '',
        ss.status.mode ? `mode: ${this.getModes(ss.status.mode, false)}` : '',
        ss.status.state ? `state: ${this.getMessageByState(ss.status.state, false)}` : '',
      ];
      const summary = parts.filter((s) => s.length > 0).join('; ');
      messages.push(`${ss.source}:\t\t${summary}`);
    });
    this.summaryOutput.append(messages.join('\n'));
  }

  private needsSummaryStatus() {
    return this.sourceStatusMap.size > 0;
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
}

export const statusBar = new StatusBar();
