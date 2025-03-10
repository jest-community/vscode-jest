import * as vscode from 'vscode';
import { ExtErrorDef } from '../errors';
import { outputManager } from '../output-manager';

/**
 * This class write out Jest run output to vscode.Terminal
 */

export interface JestExtOutput {
  write: (msg: string, opt?: OutputOptions) => string;
}

/**
 * simple class to manage the pending data before the terminal is
 * visible.
 * The default is to keep max 100 output batch (each push counts 1), when exceeding
 * it will remove the first 10 batches. We could make this configurable
 * if needed.
 */
export class PendingOutput {
  private pendingOutput: string[];
  constructor(private maxLength = 100) {
    this.pendingOutput = [];
  }
  push(output: string): void {
    if (this.pendingOutput.length >= this.maxLength) {
      // truncate the first few blocks to make room for the new output
      const cutoff = Math.max(Math.floor(this.maxLength / 10), 1);
      this.pendingOutput = this.pendingOutput.slice(cutoff);
    }
    this.pendingOutput.push(output);
  }
  clear(): void {
    this.pendingOutput = [];
  }
  toString(): string {
    return this.pendingOutput.join('');
  }
}

/** terminal per workspace */
export class ExtOutputTerminal implements JestExtOutput {
  private pendingMessages: PendingOutput;
  private ptyIsOpen: boolean;
  private writeEmitter = new vscode.EventEmitter<string>();
  private _terminal?: vscode.Terminal;
  private enabled: boolean;
  public revealOnError: boolean;

  private pty: vscode.Pseudoterminal = {
    onDidWrite: this.writeEmitter.event,
    open: () => {
      this.writeEmitter.fire(`${this.name}\r\n`);
      const pending = this.pendingMessages.toString();
      if (pending) {
        this.writeEmitter.fire(pending);
        this.pendingMessages.clear();
      }
      this.ptyIsOpen = true;
    },
    close: () => {
      this.ptyIsOpen = false;
      this.enabled = false;
      this._terminal = undefined;
    },
  };
  constructor(
    private name: string,
    enabled?: boolean
  ) {
    this.ptyIsOpen = false;
    this.pendingMessages = new PendingOutput();
    this.enabled = enabled ?? false;
    this.revealOnError = true;
  }

  /**
   * indicate the terminal can be revealed if needed.
   * This allows the terminal to be created in a "background" mode, i.e. it will not force the terminal to be shown if the panels are hidden or
   * if there are other active terminal
   * @returns
   */
  enable(): void {
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    this.createTerminalIfNeeded();
  }

  /** delay creating terminal until we are actually running the tests */
  private createTerminalIfNeeded() {
    if (!this.enabled || this._terminal) {
      return;
    }
    vscode.window.terminals.forEach((t) => {
      if (t.name === this.name) {
        t.dispose();
      }
    });
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

    if (isErrorOutputType(opt) && (this.enabled || this.revealOnError)) {
      outputManager.showOutputOn('exec-error', this);
    }
    return text;
  }
  show(): void {
    this.enable();
    this._terminal?.show(true);
  }
  close(): void {
    this.enabled = false;
    this._terminal?.dispose();
  }
  dispose(): void {
    this.writeEmitter.dispose();
    this._terminal?.dispose();
  }

  /**
   * Clear the terminal
   */
  clear(): void {
    this.write('\x1bc');
  }
}
export class JestOutputTerminal extends ExtOutputTerminal {
  constructor(workspaceName: string, visible?: boolean) {
    super(`Jest (${workspaceName})`, visible);
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
export type AnsiSeqType = keyof typeof AnsiSeq;

export const ansiEsc = (type: AnsiSeqType, text: string): string => {
  return `${AnsiSeq[type]}${text}${AnsiSeq.end}`;
};

export type OutputOptionShort =
  | 'error'
  | 'warn'
  | 'new-line'
  | 'bold'
  | 'info'
  | 'success'
  | 'lite';
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
const applyAnsiSeq = (text: string, opt: OutputOptionShort, useLite = false): string => {
  switch (opt) {
    case 'error':
    case 'warn':
    case 'info':
    case 'success':
      if (useLite) {
        return `${AnsiSeq[opt]}${text}${AnsiSeq.end}${AnsiSeq.lf}`;
      }
      return `${AnsiSeq.lf}${AnsiSeq[opt]}[${opt}] ${text}${AnsiSeq.end}${AnsiSeq.lf}`;
    case 'bold':
      return `${AnsiSeq[opt]}${text}${AnsiSeq.end}`;
    case 'new-line':
      return `${AnsiSeq.lf}${text}${AnsiSeq.lf}`;
    default:
      return text;
  }
};

export const toAnsi = (msg: string, options?: OutputOptions, useLite = false): string => {
  let text = msg.replace(/\n/g, '\r\n');
  if (!options) {
    return text;
  }
  if (Array.isArray(options)) {
    return options.reduce((t, opt) => toAnsi(t, opt, useLite || options.includes('lite')), msg);
  }

  if (typeof options === 'string') {
    text = applyAnsiSeq(text, options, useLite);
  } else {
    text = applyAnsiSeq(text, options.type, useLite);
    text = `${text}${AnsiSeq.lf}${AnsiSeq.info}[info]${AnsiSeq.end} ${options.desc}, please see: ${options.helpLink}${AnsiSeq.lf}`;
  }
  return text;
};
