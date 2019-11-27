jest.unmock('../../src/Coverage/CoverageCodeLensProvider')

// tslint:disable max-classes-per-file
const rangeConstructor = jest.fn()
jest.mock('vscode', () => {
  class CodeLens {
    range: any
    command: any

    constructor(range, command) {
      this.range = range
      this.command = command
    }
  }

  // class EventEmitter {
  //   fire() {}
  // }

  class Position {
    lineNumber: string
    character: string

    constructor(lineNumber, character) {
      this.lineNumber = lineNumber
      this.character = character
    }
  }

  class Range {
    start: Position
    end: Position

    constructor(start, end) {
      rangeConstructor(...arguments)
      this.start = start
      this.end = end
    }
  }

  return {
    CodeLens,
    Position,
    Range,
  }
})

import { CoverageCodeLensProvider } from '../../src/Coverage/CoverageCodeLensProvider'

// import * as vscode from 'vscode'

describe('CoverageCodeLensProvider', () => {
  let mockJestExt
  let provider

  beforeEach(() => {
    mockJestExt = {
      coverageMapProvider: { getFileCoverage: jest.fn() },
    }
    const mockGetExt = jest.fn().mockReturnValue(mockJestExt)
    provider = new CoverageCodeLensProvider(mockGetExt)
  })
  describe('provideCodeLenses', () => {
    const doc = { fileName: 'file.js' }

    test('do nothing when no coverage', () => {
      mockJestExt.coverageMapProvider.getFileCoverage = () => null
      const result = provider.provideCodeLenses(doc)
      expect(result).toBeUndefined()
    })

    test('can summarize', () => {
      const coverage = {
        toSummary: () => ({
          toJSON: () => ({
            branches: { pct: 10 },
            lines: { pct: 46.15 },
          }),
        }),
      }
      mockJestExt.coverageMapProvider.getFileCoverage = () => coverage
      const result = provider.provideCodeLenses(doc)
      expect(result).toHaveLength(1)
      expect(result[0].command.title).toEqual('branches: 10%, lines: 46.15%')
    })
  })
})
