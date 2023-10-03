jest.unmock('../../src/JestExt/output-terminal');
jest.unmock('../../src/errors');

import * as vscode from 'vscode';
import {
  ansiEsc,
  AnsiSeq,
  JestOutputTerminal,
  PendingOutput,
  toAnsi,
} from '../../src/JestExt/output-terminal';
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
  it('will not create terminal until it is enabled', () => {
    const output = new JestOutputTerminal('workspace');
    output.write('abc');
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    output.enable();
    expect(vscode.window.createTerminal).toHaveBeenCalled();
  });
  it('can be create with enabled by default', () => {
    const output = new JestOutputTerminal('workspace', true);
    output.write('abc');
    expect(vscode.window.createTerminal).toHaveBeenCalled();
  });
  it('if terminal already opened, close and create a new one', () => {
    const a = { name: 'Jest (a)', dispose: jest.fn() };
    const b = { name: 'Jest (b)', dispose: jest.fn() };
    (vscode.window.terminals as any) = [a, b];
    const t = new JestOutputTerminal('a');
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    expect(a.dispose).not.toHaveBeenCalled();

    t.enable();
    t.write('something');
    expect(vscode.window.createTerminal).toHaveBeenCalled();
    expect(a.dispose).toHaveBeenCalled();
    expect(b.dispose).not.toHaveBeenCalled();
  });
  it('can buffer output until terminal opened', () => {
    const output = new JestOutputTerminal('a');
    output.write('text 1');
    output.enable();
    expect(mockEmitter.fire).not.toHaveBeenCalled();

    // after open, the buffered text should be sent again
    const { pty } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[0][0];
    pty.open();
    expect(mockEmitter.fire).toHaveBeenCalledWith('text 1');

    output.write('text 2');
    expect(mockEmitter.fire).toHaveBeenCalledWith('text 2');
  });
  it('if user close the terminal, it will be reopened on the next write', () => {
    const output = new JestOutputTerminal('a');
    output.enable();
    output.write('1');
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    const { pty } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[0][0];

    // simulate users close the terminal
    pty.close();

    // user writes again
    output.write('1');
    output.enable();
    // terminal should be opened again with the same pty
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
    const { pty: pty2 } = (vscode.window.createTerminal as jest.Mocked<any>).mock.calls[1][0];
    expect(pty2).toBe(pty);
  });
  it('will show terminal when writing error messages', () => {
    const output = new JestOutputTerminal('a');

    output.write('1');
    expect(mockTerminal.show).not.toHaveBeenCalled();

    output.write('2', 'error');
    expect(mockTerminal.show).toHaveBeenCalledTimes(1);

    output.write('2', errors.GENERIC_ERROR);
    expect(mockTerminal.show).toHaveBeenCalledTimes(2);
  });
  it('will not show terminal when writing error messages if revalOnError is false', () => {
    const output = new JestOutputTerminal('a');
    output.revealOnError = false;

    output.write('an error', 'error');
    expect(mockTerminal.show).not.toHaveBeenCalled();

    output.revealOnError = true;
    output.write('an error', 'error');
    expect(mockTerminal.show).toHaveBeenCalledTimes(1);
  });
  it('will properly dispose terminal and emitter', () => {
    const output = new JestOutputTerminal('a');
    output.enable();
    output.write('1');
    output.dispose();
    expect(mockTerminal.dispose).toHaveBeenCalled();
    expect(mockEmitter.dispose).toHaveBeenCalled();
  });
  it('can close the terminal', () => {
    const output = new JestOutputTerminal('a');
    output.enable();
    output.write('1');
    output.close();
    expect(mockTerminal.dispose).toHaveBeenCalled();
    expect(mockEmitter.dispose).not.toHaveBeenCalled();
  });
  it('can clear the terminal', () => {
    const output = new JestOutputTerminal('a');
    output.write = jest.fn().mockImplementation(() => 'test');
    output.clear();
    expect(output.write).toHaveBeenCalledWith('\x1bc');
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

describe('PendingOutput', () => {
  it('can limit output not to exceed max size', () => {
    const pOut = new PendingOutput(3);
    ['1', '2', '3'].forEach((s) => pOut.push(s));
    expect(pOut.toString()).toEqual('123');
    pOut.push('4');
    expect(pOut.toString()).toEqual('234');
  });
});
