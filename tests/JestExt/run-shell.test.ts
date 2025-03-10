jest.unmock('../../src/JestExt/run-shell');

const mockPlatform = jest.fn();
jest.mock('os', () => ({ platform: mockPlatform }));
jest.mock('path', () => ({
  parse: (p: string) => {
    const parts = p.split('/');
    return { base: parts[parts.length - 1] };
  },
}));

// import * as vscode from 'vscode';
import { RunShell, LoginShells } from '../../src/JestExt/run-shell';

describe('RunnerShell', () => {
  beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });
  beforeEach(() => {});

  describe('can initialize from a shell setting', () => {
    it.each`
      case | platform    | setting                                | loginShell                             | useLoginShell | settingOverride
      ${1} | ${'win32'}  | ${'c:\\whatever\\powershell'}          | ${undefined}                           | ${'never'}    | ${undefined}
      ${2} | ${'win32'}  | ${undefined}                           | ${undefined}                           | ${'never'}    | ${undefined}
      ${3} | ${'darwin'} | ${'/bin/bash'}                         | ${LoginShells.bash}                    | ${false}      | ${undefined}
      ${4} | ${'darwin'} | ${'/usr/local/bin/zsh'}                | ${LoginShells.zsh}                     | ${false}      | ${undefined}
      ${5} | ${'darwin'} | ${{ path: '/bin/zsh', args: [] }}      | ${LoginShells.zsh}                     | ${false}      | ${'/bin/zsh'}
      ${6} | ${'darwin'} | ${{ path: 'bash', args: ['--login'] }} | ${{ path: 'bash', args: ['--login'] }} | ${true}       | ${undefined}
      ${7} | ${'linux'}  | ${undefined}                           | ${LoginShells.sh}                      | ${false}      | ${undefined}
      ${8} | ${'linux'}  | ${'whatever'}                          | ${undefined}                           | ${'never'}    | ${undefined}
      ${9} | ${'darwin'} | ${{ path: '/bin/zsh' }}                | ${LoginShells.zsh}                     | ${false}      | ${'/bin/zsh'}
    `('case $case', ({ platform, setting, loginShell, settingOverride, useLoginShell }) => {
      jest.clearAllMocks();
      mockPlatform.mockReturnValue(platform);
      const shell = new RunShell(setting);
      expect(shell.toSetting()).toEqual(settingOverride ?? setting);
      expect(shell.useLoginShell).toEqual(useLoginShell);

      // test loginShell
      shell.enableLoginShell();
      if (loginShell) {
        expect(shell.toSetting()).toEqual(loginShell);
        expect(shell.useLoginShell).toEqual(true);
      } else {
        expect(shell.useLoginShell).not.toEqual(true);
        expect(shell.toSetting()).toEqual(settingOverride ?? setting);
        expect(console.warn).toHaveBeenCalled();
      }
    });
  });
  it('if setting already a loginShell, will always return the loginShell', () => {
    mockPlatform.mockReturnValue('darwin');
    const setting = { path: '/bin/zsh', args: ['-l'] };
    const shell = new RunShell(setting);
    expect(shell.useLoginShell).toEqual(true);
    expect(shell.toSetting()).toEqual(setting);

    shell.enableLoginShell();
    expect(shell.toSetting()).toEqual(setting);
  });
});
