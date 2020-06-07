jest.unmock('../../src/Coverage/CoverageCodeLensProvider');

const rangeConstructor = jest.fn();
jest.mock('vscode', () => {
  class CodeLens {
    range: any;
    command: any;

    constructor(range, command) {
      this.range = range;
      this.command = command;
    }
  }

  const EventEmitter = jest.fn();

  class Position {
    lineNumber: string;
    character: string;

    constructor(lineNumber, character) {
      this.lineNumber = lineNumber;
      this.character = character;
    }
  }

  class Range {
    start: Position;
    end: Position;

    constructor(start, end) {
      rangeConstructor();
      this.start = start;
      this.end = end;
    }
  }

  return {
    CodeLens,
    Position,
    Range,
    EventEmitter,
  };
});
import * as vscode from 'vscode';
import { CoverageCodeLensProvider } from '../../src/Coverage/CoverageCodeLensProvider';

describe('CoverageCodeLensProvider', () => {
  let mockJestExt;
  let provider;

  beforeEach(() => {
    mockJestExt = {
      coverageMapProvider: { getFileCoverage: jest.fn() },
      coverageOverlay: { enabled: true },
    };
    const mockGetExt = jest.fn().mockReturnValue(mockJestExt);
    provider = new CoverageCodeLensProvider(mockGetExt);
  });
  describe('provideCodeLenses', () => {
    const doc = { fileName: 'file.js' };
    const coverage = {
      toSummary: () => ({
        toJSON: () => ({
          branches: { pct: 10 },
          lines: { pct: 46.15 },
        }),
      }),
    };

    test('do nothing when no coverage', () => {
      mockJestExt.coverageMapProvider.getFileCoverage = () => null;
      const result = provider.provideCodeLenses(doc);
      expect(result).toBeUndefined();
    });

    test('can summarize', () => {
      mockJestExt.coverageMapProvider.getFileCoverage = () => coverage;
      const result = provider.provideCodeLenses(doc);
      expect(result).toHaveLength(1);
      expect(result[0].command.title).toEqual('branches: 10%, lines: 46.15%');
    });
    test('do nothing when coverage is disabled', () => {
      mockJestExt.coverageMapProvider.getFileCoverage = () => coverage;
      mockJestExt.coverageOverlay.enabled = false;
      const result = provider.provideCodeLenses(doc);
      expect(result).toBeUndefined();
    });
    test('provides trigger to update codeLens on demand', () => {
      const fireMock = jest.fn();
      const event: any = { whatever: true };
      (vscode.EventEmitter as jest.Mocked<any>).mockImplementation(() => ({
        event,
        fire: fireMock,
      }));
      provider = new CoverageCodeLensProvider(mockJestExt);
      expect(provider.onDidChangeCodeLenses).toEqual(event);

      provider.coverageChanged();
      expect(fireMock).toBeCalled();
    });
  });
});
