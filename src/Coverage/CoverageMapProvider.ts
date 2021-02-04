import { createSourceMapStore, MapStore } from 'istanbul-lib-source-maps';
import { createCoverageMap, CoverageMap, CoverageMapData } from 'istanbul-lib-coverage';

export class CoverageMapProvider {
  private mapStore: MapStore;

  /**
   * Transformed coverage map
   */
  private _map: CoverageMap;

  constructor() {
    this.reset();
  }

  reset(): void {
    this._map = createCoverageMap();
    this.mapStore = createSourceMapStore();
  }
  get map(): CoverageMap {
    return this._map;
  }

  async update(obj?: CoverageMap | CoverageMapData): Promise<void> {
    const map = createCoverageMap(obj);
    const transformed = await this.mapStore.transformCoverage(map);
    if (this._map) {
      transformed.files().forEach((fileName) => {
        this.setFileCoverage(fileName, transformed);
      });
    } else {
      this._map = transformed;
    }
  }

  setFileCoverage(filePath: string, map: CoverageMap): void {
    this._map.data[filePath] = map.fileCoverageFor(filePath);
  }
  public getFileCoverage(filePath: string): any {
    return this._map.data[filePath];
  }
  public onVisibilityChanged(visible: boolean): void {
    if (!visible) {
      this.reset();
    }
  }
}
