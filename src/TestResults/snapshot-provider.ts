import * as vscode from 'vscode';
import { Snapshot, SnapshotBlock } from 'jest-editor-support';

export type SnapshotStatus = 'exists' | 'missing' | 'inline';

export interface ExtSnapshotBlock extends SnapshotBlock {
  isInline: boolean;
}
export interface SnapshotSuite {
  testPath: string;
  blocks: ExtSnapshotBlock[];
}

const inlineKeys = ['toMatchInlineSnapshot', 'toThrowErrorMatchingInlineSnapshot'];
export class SnapshotProvider {
  private snapshots: Snapshot;
  private panel?: vscode.WebviewPanel;

  constructor() {
    this.snapshots = new Snapshot(undefined, inlineKeys);
  }

  public parse(testPath: string): SnapshotSuite {
    try {
      const sBlocks = this.snapshots.parse(testPath);
      const blocks = sBlocks.map((block) => ({
        ...block,
        isInline: inlineKeys.find((key) => block.node.name.includes(key)) ? true : false,
      }));
      const snapshotSuite = { testPath, blocks };
      return snapshotSuite;
    } catch (e) {
      console.warn('[SnapshotProvider] getMetadataAsync failed:', e);
      return { testPath, blocks: [] };
    }
  }
  public async getContent(testPath: string, testFullName: string): Promise<string | undefined> {
    return this.snapshots.getSnapshotContent(testPath, testFullName);
  }
  private escapeContent = (content: string) => {
    if (content) {
      const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre>${escaped}</pre>`;
    }
  };
  public async previewSnapshot(testPath: string, testFullName: string): Promise<void> {
    const content = await this.getContent(testPath, testFullName);
    if (!content) {
      vscode.window.showErrorMessage('no snapshot is found, please run test to generate first');
      return;
    }

    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'view_snapshot',
        testFullName,
        vscode.ViewColumn.Two,
        {}
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.webview.html = (content && this.escapeContent(content)) || '';
    this.panel.title = testFullName;
  }
}
