jest.unmock('../../src/decorations/prepareIconFile');
jest.mock('fs', () => {
  return {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import prepareIconFile from '../../src/decorations/prepareIconFile';

const context = {
  asAbsolutePath: (name: string) => name,
} as vscode.ExtensionContext;

beforeEach(() => {
  jest.resetAllMocks();
  (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(''));
  (fs.existsSync as jest.Mock).mockReturnValue(true);
});

describe('prepareIconFile', () => {
  it('is creating icon file from source file if it does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    prepareIconFile(context, 'state', '<svg />');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('generated-icons', 'state.svg'),
      '<svg />'
    );
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('does not write file if it exists and is the same', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('<svg />'));

    prepareIconFile(context, 'state', '<svg />');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(0);
  });

  it('can replace fill color', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('<svg fill="currentColor"></svg>'));
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    prepareIconFile(context, 'default', '<svg fill="currentColor"></svg>');
    expect((fs.writeFileSync as jest.Mock).mock.calls[0][1]).toBe(
      '<svg fill="currentColor"></svg>'
    );

    prepareIconFile(context, 'gray', '<svg fill="currentColor"></svg>', '#8C8C8C');
    expect((fs.writeFileSync as jest.Mock).mock.calls[1][1]).toBe('<svg fill="#8C8C8C"></svg>');

    prepareIconFile(context, 'red', '<svg fill="currentColor"></svg>', 'red');
    expect((fs.writeFileSync as jest.Mock).mock.calls[2][1]).toBe('<svg fill="red"></svg>');
  });
});
