import { createSourceMapStore, MapStore } from 'istanbul-lib-source-maps'
import { createCoverageMap, CoverageMap } from 'istanbul-lib-coverage'

export class CoverageMapProvider {
  private mapStore: MapStore

  /**
   * Transformed coverage map
   */
  private _map: CoverageMap

  constructor() {
    this._map = createCoverageMap()
    this.mapStore = createSourceMapStore()
  }

  get map(): CoverageMap {
    return this._map
  }

  update(obj: CoverageMap | object) {
    const map = createCoverageMap(obj)
    const transformed = this.mapStore.transformCoverage(map)
    this._map = transformed.map
  }

  public getFileCoverage(filePath: string) {
    return this._map.data[filePath]
  }
}
