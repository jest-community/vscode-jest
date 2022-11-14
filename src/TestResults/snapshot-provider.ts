import { Snapshot, SnapshotMetadata } from 'jest-editor-support';

export type SnapshotStatus = 'exists' | 'missing' | 'inline';

export interface SnapshotNode {
  isInline: boolean;
  //TODO refactor jest-e-ditor-support to split metadata and api
  metadata: SnapshotMetadata;
}
export interface SnapshotSuite {
  testPath: string;
  nodes: SnapshotNode[];
}
export interface SnapshotResult {
  status: SnapshotStatus;
  content?: string;
}

const inlineKeys = ['toMatchInlineSnapshot', 'toThrowErrorMatchingInlineSnapshot'];
export class SnapshotProvider {
  private snapshots: Snapshot;

  constructor() {
    this.snapshots = new Snapshot(undefined, inlineKeys);
  }

  public async parse(testPath: string): Promise<SnapshotSuite> {
    try {
      const metadataList = await this.snapshots.getMetadataAsync(testPath);
      const nodes = metadataList.map((metadata) => ({
        // TODO use the node.name instead
        isInline: inlineKeys.find((key) => metadata.name.includes(key)) ? true : false,
        metadata,
      }));
      const snapshotSuite = { testPath, nodes };
      return snapshotSuite;
    } catch (e) {
      console.warn('[SnapshotProvider] getMetadataAsync failed:', e);
      return { testPath, nodes: [] };
    }
  }
}
