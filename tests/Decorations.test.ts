jest.unmock('../src/Decorations');

jest.mock('fs', () => {
  return {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});
jest.mock('vscode', () => {
  return {
    DecorationRangeBehavior: {
      ClosedClosed: {},
    },
    OverviewRulerLane: {
      Left: {},
    },
    window: {
      createTextEditorDecorationType: jest.fn(jest.fn),
    },
  };
});

import { Decorations } from '../src/Decorations';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

beforeEach(() => {
  jest.resetAllMocks();
  (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(''));
  (fs.existsSync as jest.Mock).mockReturnValue(true);
});

const defaultContextMock = {
  asAbsolutePath: (name: string) => name,
};

function testStatusStyle(property: string) {
  (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(''));

  it('should be decoration', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;

    const decorations = new Decorations({ asAbsolutePath: (name: string) => name });

    expect(decorations[property]).toBe(mock());
  });

  it('should have been created with proper attributes', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
    mock.mockImplementation((args) => args);

    const decoration = new Decorations(defaultContextMock)[property];

    expect(decoration.rangeBehavior).toBe(vscode.DecorationRangeBehavior.ClosedClosed);
    expect(decoration.overviewRulerLane).toBe(vscode.OverviewRulerLane.Left);
    expect(decoration.overviewRulerColor).toBeTruthy();
    expect(decoration.gutterIconPath).toBeTruthy();
  });
}

describe('Decorations', () => {
  it('is initializing a class with public fields and methods', () => {
    const decorations = new Decorations(defaultContextMock);

    expect(decorations).toBeInstanceOf(Decorations);
  });

  describe('resolvePath', () => {
    const context = {
      asAbsolutePath: (name: string) => `/path/to/${name}`,
    };

    it('returns absolute path', () => {
      const decorations = new Decorations(context);

      expect(decorations['resolvePath']('test', 'file')).toEqual(
        `/path/to/${path.join('test', 'file')}`
      );
    });
  });

  describe('prepareIcon', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(''));

    const decorations = new Decorations(defaultContextMock);
    const prepareIcon = (...args) => decorations['prepareIcon'].call(decorations, ...args);

    it('is creating icon file from source file if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      prepareIcon('state', '<svg />');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('out', 'icons', 'state.svg'),
        '<svg />'
      );
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('does not write file if it exists and is the same', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('<svg />'));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      prepareIcon('state', '<svg />');
      expect(fs.writeFileSync).toHaveBeenCalledTimes(0);
    });

    it('can replace fill color', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(
        Buffer.from('<svg fill="currentColor"></svg>')
      );
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      prepareIcon('default', '<svg fill="currentColor"></svg>');
      expect((fs.writeFileSync as jest.Mock).mock.calls[0][1]).toBe(
        '<svg fill="currentColor"></svg>'
      );

      prepareIcon('gray', '<svg fill="currentColor"></svg>', '#8C8C8C');
      expect((fs.writeFileSync as jest.Mock).mock.calls[1][1]).toBe('<svg fill="#8C8C8C"></svg>');

      prepareIcon('red', '<svg fill="currentColor"></svg>', 'red');
      expect((fs.writeFileSync as jest.Mock).mock.calls[2][1]).toBe('<svg fill="red"></svg>');
    });
  });

  describe('passing', () => {
    testStatusStyle('passing');
  });

  describe('failing', () => {
    testStatusStyle('failing');
  });

  describe('skip', () => {
    testStatusStyle('skip');
  });

  describe('unknown', () => {
    testStatusStyle('unknown');
  });

  describe('failingAssertionStyle', () => {
    const decorations = new Decorations(defaultContextMock);
    const failingAssertionStyle = (...args) =>
      decorations['failingAssertionStyle'].call(decorations, ...args);

    it('should create text editor decoration', () => {
      const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
      mock.mockReset();
      const decoration = failingAssertionStyle('');

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0][0].overviewRulerLane).toBe(vscode.OverviewRulerLane.Left);
      expect(decoration).toBe(mock({}));
    });

    it('should add text to decoration', () => {
      const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
      mock.mockReset();
      failingAssertionStyle('test text');

      expect(mock.mock.calls[0][0].light.after.contentText).toBe(' // test text');
      expect(mock.mock.calls[0][0].dark.after.contentText).toBe(' // test text');
    });
  });
});
