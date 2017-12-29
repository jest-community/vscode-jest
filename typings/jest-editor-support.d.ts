import * as editor from 'jest-editor-support'
declare module 'jest-editor-support' {
  interface JestTotalResults {
    coverageMap: any
  }

  type FormattedTestResults = {
    testResults: TestResult[]
  }

  type TestResult = {
    name: string
  }

  interface SnapshotMetadata {
    node: {
      loc: editor.Node
    }
    name: string
    content: string
    count: number
    exists: boolean
  }

  class Snapshot {
    constructor(parser?: any, customMatchers?: Array<string>)
    getMetadata(filepath: string): Array<SnapshotMetadata>
  }
}
