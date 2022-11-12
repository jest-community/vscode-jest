import { Snapshot, SnapshotMetadata } from 'jest-editor-support';

export type SnapshotStatus = 'exists' | 'missing' | 'inline';
export interface SnapshotInfo {
  status: SnapshotStatus;
  metadata: SnapshotMetadata;
}
export class SnapshotProvider {
  private cache: Map<string, SnapshotInfo[]>;
  private snapshots: Snapshot;

  constructor() {
    this.snapshots = new Snapshot(undefined, [
      'toMatchInlineSnapshot',
      'toThrowErrorMatchingInlineSnapshot',
    ]);
    this.cache = new Map();
  }

  private getSnapshotStatus(snapshot: SnapshotMetadata): SnapshotStatus {
    if (snapshot.exists) {
      return 'exists';
    }
    if (snapshot.name.includes('inline')) {
      return 'inline';
    }
    return 'missing';
  }
  public getSuiteSnapshots(testPath: string): Promise<SnapshotInfo[] | undefined> {
    const infoList = this.cache.get(testPath);
    if (infoList) {
      return Promise.resolve(infoList);
    }
    return this.parse(testPath);
  }
  public removeSuiteSnapshots(testPath: string): void {
    this.cache.delete(testPath);
  }
  private async parse(testPath: string): Promise<SnapshotInfo[]> {
    try {
      const metadataList = await this.snapshots.getMetadataAsync(testPath);
      const infoList = metadataList.map((metadata) => ({
        status: this.getSnapshotStatus(metadata),
        metadata,
      }));
      this.cache.set(testPath, infoList);
      return infoList;
    } catch (e) {
      console.warn('[SnapshotProvider] getMetadataAsync failed:', e);
      this.cache.delete(testPath);
      return [];
    }
  }
  public resetCache(): void {
    this.cache.clear();
  }
}
