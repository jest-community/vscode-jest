import * as vscode from 'vscode';
import { ExtErrorDef } from '../errors';

/**
 * This class write out Jest run output to vscode.Terminal
 */

export interface JestExtOutput {
  write: (msg: string, opt?: OutputOptions) => string;
}

/** termerinal per workspace */
export class JestOutputTerminal implements JestExtOutput {
  private name;
  private pendingMessages: string[];
  private ptyIsOpen: boolean;
  private writeEmitter = new vscode.EventEmitter<string>();
  private pty: vscode.Pseudoterminal = {
    onDidWrite: this.writeEmitter.event,
    open: () => {
      this.writeEmitter.fire(`${this.name}: Test Run Output \r\n`);
      if (this.pendingMessages.length > 0) {
        this.writeEmitter.fire(this.pendingMessages.join(''));
        this.pendingMessages = [];
      }
      this.ptyIsOpen = true;
    },
    close: () => {
      this._terminal?.dispose();
      this._terminal = undefined;
    },
  };
  private _terminal?: vscode.Terminal;
  constructor(workspaceName: string) {
    this.name = `Jest (${workspaceName})`;
    vscode.window.terminals.forEach((t) => {
      if (t.name === this.name) {
        t.dispose();
      }
    });
    this.ptyIsOpen = false;
    this.pendingMessages = [];
  }

  /** delay creating terminal until we are actually running the tests */
  private createTerminalIfNeeded() {
    if (this._terminal) {
      return;
    }
    this._terminal = vscode.window.createTerminal({
      name: this.name,
      iconPath: new vscode.ThemeIcon('beaker'),
      isTransient: true,
      pty: this.pty,
    });
    this.ptyIsOpen = false;
  }
  private appendRaw(text: string): void {
    //ensure terminal is created
    this.createTerminalIfNeeded();

    if (this.ptyIsOpen) {
      this.writeEmitter.fire(text);
    } else {
      this.pendingMessages.push(text);
    }
  }

  write(msg: string, opt?: OutputOptions): string {
    const text = toAnsi(msg, opt);
    this.appendRaw(text);

    if (isErrorOutputType(opt)) {
      this.show();
    }
    return text;
  }
  show(): void {
    this._terminal?.show(true);
  }
  dispose(): void {
    this.writeEmitter.dispose();
    this._terminal?.dispose();
  }
}

export const AnsiSeq = {
  error: '\x1b[0;31m',
  success: '\x1b[0;32m',
  warn: '\x1b[0;33m',
  info: '\x1b[0;34m',
  bold: '\x1b[1m',
  end: '\x1b[0m',
  lf: '\r\n',
};

export type OutputOptionShort = 'error' | 'warn' | 'new-line' | 'bold';
export type OutputOptions =
  | Array<OutputOptionShort | ExtErrorDef>
  | OutputOptionShort
  | ExtErrorDef;

const isErrorOutputType = (options?: OutputOptions): boolean => {
  if (!options) {
    return false;
  }
  if (Array.isArray(options)) {
    return options.some((opt) => isErrorOutputType(opt) === true);
  }
  if (typeof options === 'string') {
    return options === 'error';
  }
  return options.type === 'error';
};
/** convert string to ansi-coded string based on the options */
const applyAnsiSeq = (text: string, opt: OutputOptionShort): string => {
  switch (opt) {
    case 'error':
    case 'warn':
      return `${AnsiSeq.lf}${AnsiSeq[opt]}[${opt}] ${text}${AnsiSeq.end}${AnsiSeq.lf}`;
    case 'bold':
      return `${AnsiSeq[opt]}${text}${AnsiSeq.end}`;
    case 'new-line':
      return `${AnsiSeq.lf}${text}${AnsiSeq.lf}`;
  }
};

export const toAnsi = (msg: string, options?: OutputOptions): string => {
  let text = msg.replace(/\n/g, '\r\n');
  if (!options) {
    return text;
  }
  if (Array.isArray(options)) {
    return options.reduce((t, opt) => toAnsi(t, opt), msg);
  }

  if (typeof options === 'string') {
    text = applyAnsiSeq(text, options);
  } else {
    text = applyAnsiSeq(text, options.type);
    text = `${text}${AnsiSeq.lf}${AnsiSeq.info}[info]${AnsiSeq.end} ${options.desc}, please see: ${options.helpLink}${AnsiSeq.lf}`;
  }
  return text;
};
