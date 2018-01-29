declare module 'istanbul-lib-coverage' {
  class CoverageMap {
    data: { [fileName: string]: FileCoverage }
    fileCoverageFor(file: string): FileCoverage
    files(): string[]
    merge(map: CoverageMap): void
  }

  class FileCoverage {
    getUncoveredLines(): string[]
    toSummary(): CoverageSummary
    b: HitCount
    branchMap: BranchMap
    path: string
  }

  interface HitCount {
    [key: string]: number[]
  }

  interface BranchMap {
    [key: string]: BranchData
  }

  interface BranchData {
    loc: Location
    locations: Location[]
  }

  interface Location {
    end: Position
    start: Position
  }

  interface Position {
    line: number
    column: number
  }

  interface Metric {
    total: number
    covered: number
    skipped: number
    pct: number
  }

  class CoverageSummary {
    toJSON(): {
      lines: Metric
      statements: Metric
      branches: Metric
      functions: Metric
    }
  }

  function createCoverageMap(map?: CoverageMap | Object): CoverageMap
}
