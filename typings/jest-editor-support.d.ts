import * as editor from 'jest-editor-support'
import { ChildProcess } from 'child_process'
declare module 'jest-editor-support' {
  interface SpawnOptions {
    shell?: boolean
  }

  interface Options {
    createProcess?(workspace: ProjectWorkspace, args: string[], options?: SpawnOptions): ChildProcess
    testNamePattern?: string
    testFileNamePattern?: string
    shell?: boolean
  }

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
