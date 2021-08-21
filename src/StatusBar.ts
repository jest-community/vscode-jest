import * as vscode from 'vscode';
import { extensionName } from './appGlobals';
import { JestExt } from './JestExt';
import { TestStats, TestStatsCategory } from './types';

export enum StatusType {
  active,
  summary,
}

export type ProcessState = 'running' | 'failed' | 'success' | 'stopped' | 'initial' | 'done';
export type AutoRunMode =
  | 'auto-run-watch'
  | 'auto-run-on-save'
  | 'auto-run-on-save-test'
  | 'auto-run-off';
export type Mode = AutoRunMode | 'coverage';

type SummaryState = 'summary-warning' | 'summary-pass' | 'stats-not-sync';

export type SBTestStats = TestStats & { isDirty?: boolean };
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
interface SpinnableStatusBarItem
  extends Pick<vscode.StatusBarItem, 'command' | 'text' | 'tooltip'> {
  readonly type: StatusType;
  show(): void;
  hide(): void;
}

const createStatusBarItem = (type: StatusType, priority: number): SpinnableStatusBarItem => {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  return {
    type,
    show: () => item.show(),
    hide: () => item.hide(),

    get command() {
      return item.command;
    },
    get text() {
      return item.text;
    },
    get tooltip() {
      return item.tooltip;
    },

    set command(_command) {
      item.command = _command;
    },
    set text(_text: string) {
      item.text = _text;
    },
    set tooltip(_tooltip: string | vscode.MarkdownString | undefined) {
      item.tooltip = _tooltip;
    },
  };
};

// The bottom status bar
export class StatusBar {
  private activeStatusItem = createStatusBarItem(StatusType.active, 2);
  private summaryStatusItem = createStatusBarItem(StatusType.summary, 1);

  private sourceStatusMap = new Map<string, SourceStatus>();
  private _activeFolder?: string;
  private summaryOutput?: vscode.OutputChannel;

  constructor() {
    this.summaryStatusItem.tooltip = 'Jest status summary of the workspace';
    this.activeStatusItem.tooltip = 'Jest status of the active folder';
  }

  register(getExtension: (name: string) => JestExt | undefined): vscode.Disposable[] {
    const showSummaryOutput = `${extensionName}.show-summary-output`;
    const showActiveOutput = `${extensionName}.show-active-output`;
    this.summaryStatusItem.command = showSummaryOutput;
    this.activeStatusItem.command = showActiveOutput;

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
            ext.channel.show();
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
      this.render(this.buildSourceStatusString(ss), tooltip, this.activeStatusItem);
    } else {
      this.activeStatusItem.hide();
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
      for (const r of this.sourceStatusMap.values()) {
        this.updateSummaryStats(r, summaryStats);
      }

      const tooltip = this.buildStatsString(summaryStats, false);
      this.render(this.buildStatsString(summaryStats), tooltip, this.summaryStatusItem);
      return;
    }
    this.summaryStatusItem.hide();
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

  private buildSourceStatusString(ss: SourceStatus): string {
    const parts: string[] = [
      ss.status.state ? this.getMessageByState(ss.status.state) : '',
      ss.status.mode ? this.getModes(ss.status.mode) : '',
    ];
    return parts.filter((s) => s.length > 0).join(' | ');
  }

  private render(text: string, tooltip: string, statusBarItem: SpinnableStatusBarItem) {
    switch (statusBarItem.type) {
      case StatusType.active: {
        statusBarItem.text = `Jest: ${text}`;
        statusBarItem.tooltip = `'${this.activeFolder}' Jest: ${tooltip}`;
        break;
      }
      case StatusType.summary:
        statusBarItem.text = `Jest-WS: ${text}`;
        statusBarItem.tooltip = `Workspace(s) stats: ${tooltip}`;
        break;
      default:
        throw new Error(`unexpected statusType: ${statusBarItem.type}`);
    }
    statusBarItem.show();
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

  private getMessageByState(
    state: ProcessState | TestStatsCategory | SummaryState,
    showIcon = true
  ): string {
    switch (state) {
      case 'running':
        return showIcon ? '$(sync~spin)' : state;
      case 'fail':
        return showIcon ? '$(error)' : state;
      case 'summary-warning':
        return showIcon ? '' : 'warning';
      case 'failed':
        return showIcon ? '$(alert)' : state;
      case 'success':
        return showIcon ? '$(pass)' : state;
      case 'initial':
        return showIcon ? '...' : state;
      case 'unknown':
        return showIcon ? '$(question)' : state;
      case 'done':
        return showIcon ? '' : 'idle';
      case 'summary-pass':
        return showIcon ? '$(check)' : 'pass';
      case 'stats-not-sync':
        return showIcon ? '$(sync-ignored)' : state;

      default:
        return state;
    }
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

        default:
          console.error(`unrecognized mode: ${m}`);
          return '';
      }
    });
    return modesStrings.join(showIcon ? ' ' : ', ');
  }
}

export const statusBar = new StatusBar();
