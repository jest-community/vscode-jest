import { TestReconciliationState } from './TestReconciliationState'

type Position = {
  /** Zero-based column number */
  column: number

  /** Zero-based line number */
  line: number
}

export type TestResult = {
  name: string
  start: Position
  end: Position

  status: TestReconciliationState
  shortMessage?: string
  terseMessage?: string

  /** Zero-based line number */
  lineNumberOfError?: number
}
