import * as vscode from 'vscode';
import { Snapshot, SnapshotBlock, SnapshotParserOptions } from 'jest-editor-support';
import { escapeRegExp } from '../helpers';

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
  private snapshotSupport: Snapshot;
  private panel?: vscode.WebviewPanel;

  constructor() {
    this.snapshotSupport = new Snapshot(undefined, inlineKeys);
  }

  public parse(testPath: string, options?: SnapshotParserOptions): SnapshotSuite {
    try {
      const sBlocks = this.snapshotSupport.parse(testPath, options);
      const blocks = sBlocks.map((block) => ({
        ...block,
        isInline: inlineKeys.find((key) => block.node.name.includes(key)) ? true : false,
      }));
      const snapshotSuite = { testPath, blocks };
      return snapshotSuite;
    } catch (e) {
      console.warn('[SnapshotProvider] parse failed:', e);
      return { testPath, blocks: [] };
    }
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
    const content = await this.snapshotSupport.getSnapshotContent(
      testPath,
      new RegExp(`^${escapeRegExp(testFullName)} [0-9]+$`)
    );
    const noSnapshotFound = (): void => {
      vscode.window.showErrorMessage('no snapshot is found, please run test to generate first');
      return;
    };
    if (!content) {
      return noSnapshotFound();
    }
    let contentString: string | undefined;
    if (typeof content === 'string') {
      contentString = this.escapeContent(content);
    } else {
      const entries = Object.entries(content);
      switch (entries.length) {
        case 0:
          return noSnapshotFound();
        case 1:
          contentString = this.escapeContent(entries[0][1]);
          break;
        default: {
          const strings = entries.map(
            ([key, value]) => `<h3>${key}</h3>${this.escapeContent(value)}`
          );
          contentString = strings.join('<hr>');
          break;
        }
      }
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

    this.panel.webview.html = contentString ?? '';
    this.panel.title = testFullName;
  }
}
