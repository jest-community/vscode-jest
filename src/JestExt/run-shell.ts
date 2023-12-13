import * as vscode from 'vscode';
import { LoginShell } from 'jest-editor-support';
import { platform } from 'os';
import * as path from 'path';

// based on vscode setting configuration for "terminal.integrated.profiles.osx"
export const LoginShells: Record<string, LoginShell> = {
  bash: {
    path: 'bash',
    args: ['-l'],
  },
  zsh: {
    path: 'zsh',
    args: ['-l'],
  },
  fish: {
    path: 'fish',
    args: ['-l'],
  },
  sh: {
    path: '/bin/bash',
    args: ['-l'],
  },
};

export class RunShell {
  /** determine toSetting() output; if set to 'never', only the nonLoginShell will ever be returned */
  private _useLoginShell: boolean | 'never';
  private nonLoginShell?: string;
  private loginShell?: LoginShell;

  constructor(setting?: string | LoginShell) {
    this._useLoginShell = false;
    this.initFromSetting(setting);
  }

  private initFromSetting(setting?: string | LoginShell): void {
    if (setting) {
      if (typeof setting === 'string') {
        this._useLoginShell = false;
        this.nonLoginShell = setting;
        this.loginShell = this.getLoginShell(setting);
      } else {
        if (setting.args?.length > 0) {
          this._useLoginShell = true;
          this.nonLoginShell = undefined;
          this.loginShell = setting;
        } else {
          this._useLoginShell = false;
          this.nonLoginShell = setting.path;
          this.loginShell = this.getLoginShell(setting.path);
        }
      }
    } else {
      this._useLoginShell = false;
      this.nonLoginShell = undefined;
      this.loginShell = this.getLoginShell();
    }
    if (!this.loginShell) {
      this._useLoginShell = 'never';
    }
  }

  public get useLoginShell(): boolean | 'never' {
    return this._useLoginShell;
  }
  public enableLoginShell(): void {
    if (this._useLoginShell === 'never') {
      console.warn('will not enable loginShell for a "never-login-shell" RunShell', this);
      return;
    }
    this._useLoginShell = true;
  }

  /**
   * returns the shell setting based on useLoginShell flag. If there is no loginShell available,
   * for example on windows, the original setting will be returned
   */
  public toSetting(): undefined | string | LoginShell {
    if (!this._useLoginShell || this._useLoginShell === 'never') {
      return this.nonLoginShell;
    }
    return this.loginShell;
  }

  private getLoginShell(shellPath?: string): undefined | LoginShell {
    if (platform() === 'win32') {
      return;
    }
    const name = shellPath ? path.parse(shellPath).base : 'sh';
    const shell = LoginShells[name];
    if (!shell) {
      const msg = `no login-shell definition found for shell=${name} on ${platform()}`;
      console.warn(msg);
      vscode.window.showErrorMessage(`${msg}. Please report this issue.`);
    }
    return shell;
  }
}
