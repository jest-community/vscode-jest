jest.unmock('../../src/JestExt/output-terminal');
jest.unmock('../../src/errors');

import * as vscode from 'vscode';
import { ansiEsc, AnsiSeq, JestOutputTerminal, toAnsi } from '../../src/JestExt/output-terminal';
import * as errors from '../../src/errors';

describe('JestOutputTerminal', () => {
  let mockTerminal;
  let mockEmitter;

  beforeEach(() => {
    jest.resetAllMocks();

    mockTerminal = {
      dispose: jest.fn(),
      show: jest.fn(),
    };
    vscode.window.createTerminal = jest.fn().mockReturnValue(mockTerminal);
    (vscode.window.terminals as any) = [];

    mockEmitter = { fire: jest.fn(), event: jest.fn(), dispose: jest.fn() };
    (vscode.EventEmitter as jest.Mocked<any>).mockImplementation(() => mockEmitter);
  });
  it('delay creating terminal until the actual write occurs', () => {
    const output = new JestOutputTerminal('workspace');
    expect(vscode.window.createTerminal).not.toBeCalled();
    output.write('abc');
    expect(vscode.window.createTerminal).toBeCalled();
  });
  it('if terminal already opened, close and create a new one', () => {
    const a = { name: 'Jest (a)', dispose: jest.fn() };
    const b = { name: 'Jest (b)', dispose: jest.fn() };
    (vscode.window.terminals as any) = [a, b];
    const t = new JestOutputTerminal('a');
    expect(vscode.window.createTerminal).not.toBeCalled();
    expect(a.dispose).not.toBeCalled();

    t.write('something');
    expect(vscode.window.createTerminal).toBeCalled();
    expect(a.dispose).toBeCalled();
    expect(b.dispose).not.toBeCalled();
  });
  it('can buffer output until open', () => {
    const output = new JestOutputTerminal('a');
    output.write('text 1');
    expect(mockEmitter.fire).not.toBeCalled();

    // after open, the buffered text should be sent again
    const { pty } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[0][0];
    pty.open();
    expect(mockEmitter.fire).toBeCalledWith('text 1');

    output.write('text 2');
    expect(mockEmitter.fire).toBeCalledWith('text 2');
  });
  it('if user close the terminal, it will be reopened on the next write', () => {
    const output = new JestOutputTerminal('a');
    output.write('1');
    expect(vscode.window.createTerminal).toBeCalledTimes(1);
    const { pty } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[0][0];

    // simulate users close the terminal
    pty.close();
    expect(mockTerminal.dispose).toBeCalled();

    // user writes again
    output.write('1');
    // terminal should be opened again with the same pty
    expect(vscode.window.createTerminal).toBeCalledTimes(2);
    const { pty: pty2 } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[1][0];
    expect(pty2).toBe(pty);
  });
  it('will show terminal when writing error messages', () => {
    const output = new JestOutputTerminal('a');

    output.write('1');
    expect(mockTerminal.show).not.toBeCalled();

    output.write('2', 'error');
    expect(mockTerminal.show).toBeCalledTimes(1);

    output.write('2', errors.GENERIC_ERROR);
    expect(mockTerminal.show).toBeCalledTimes(2);
  });
  it('will properly dispose terminal and emitter', () => {
    const output = new JestOutputTerminal('a');
    output.write('1');
    output.dispose();
    expect(mockTerminal.dispose).toBeCalled();
    expect(mockEmitter.dispose).toBeCalled();
  });
  describe('can write output with options', () => {
    it.each`
      case | text                        | options
      ${1} | ${'regular text'}           | ${undefined}
      ${2} | ${'text with newline\r\n'}  | ${undefined}
      ${3} | ${'error text'}             | ${'error'}
      ${4} | ${'warning text'}           | ${'warn'}
      ${5} | ${'bold text'}              | ${'bold'}
      ${6} | ${'bold text with newLine'} | ${['bold', 'new-line']}
    `('can write with option: case $case', ({ text, options }) => {
      const output = new JestOutputTerminal('a');
      const t = output.write(text, options);
      expect(t).toMatchSnapshot();
    });
  });
});
describe('text format utility function', () => {
  it.each`
    options
    ${'error'}
    ${'warn'}
    ${'new-line'}
    ${'bold'}
    ${'info'}
    ${'success'}
    ${'lite'}
    ${['error', 'lite']}
    ${['bold', 'new-line']}
  `('toAnsi: format by output options: $options', ({ options }) => {
    const t = toAnsi('a message', options);
    expect(t).toMatchSnapshot();
  });
  it.each`
    desc         | escSeq
    ${'error'}   | ${AnsiSeq.error}
    ${'success'} | ${AnsiSeq.success}
    ${'warn'}    | ${AnsiSeq.warn}
    ${'info'}    | ${AnsiSeq.info}
    ${'bold'}    | ${AnsiSeq.bold}
    ${'lf'}      | ${AnsiSeq.lf}
  `('ansiEsc: format by ANSI escape sequence: $desc', ({ escSeq }) => {
    expect(ansiEsc(escSeq, 'whatever')).toMatchSnapshot();
  });
});
