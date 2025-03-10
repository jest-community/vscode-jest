jest.unmock('../src/quick-fix');
import * as vscode from 'vscode';
import { showQuickFix, QuickFixActionType } from '../src/quick-fix';

describe('showQuickFix', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    vscode.Uri.parse = jest.fn().mockImplementation((s) => s);
  });

  it.each`
    actionType          | command                             | args
    ${'help'}           | ${'vscode.open'}                    | ${'troubleshooting'}
    ${'wizard'}         | ${'with-workspace.setup-extension'} | ${['folderName', undefined]}
    ${'setup-cmdline'}  | ${'with-workspace.setup-extension'} | ${['folderName', { taskId: 'cmdLine' }]}
    ${'setup-monorepo'} | ${'with-workspace.setup-extension'} | ${['folderName', { taskId: 'monorepo' }]}
    ${'disable-folder'} | ${'with-workspace.disable'}         | ${['folderName']}
    ${'defer'}          | ${'with-workspace.change-run-mode'} | ${['folderName']}
    ${'help-long-run'}  | ${'vscode.open'}                    | ${'what-to-do-with-long-running-tests-warning'}
  `(
    'select actionType "$actionType" will execute command "$command"',
    async ({ actionType, command, args }) => {
      expect.hasAssertions();

      vscode.window.showQuickPick = jest
        .fn()
        .mockImplementationOnce((items) => Promise.resolve(items[0]));

      await showQuickFix('folderName', [actionType]);
      if (Array.isArray(args)) {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          expect.stringContaining(command),
          ...args
        );
      } else {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          expect.stringContaining(command),
          expect.stringContaining(args)
        );
      }
    }
  );
  it('can display multiple action types and execute the the selected item', async () => {
    expect.hasAssertions();
    const actionTypes: QuickFixActionType[] = ['help', 'wizard', 'disable-folder'];

    let items: any[] = [];
    vscode.window.showQuickPick = jest.fn().mockImplementationOnce((_items) => {
      items = _items;
      const wizardItem = items.find((i) => i.label.includes('Customize Extension'));
      return Promise.resolve(wizardItem);
    });

    await showQuickFix('a folder', actionTypes);
    expect(items).toHaveLength(3);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      expect.stringContaining('with-workspace.setup-extension'),
      'a folder',
      undefined
    );
  });

  it('should not execute any action if no item is selected', async () => {
    expect.hasAssertions();
    vscode.window.showQuickPick = jest.fn().mockResolvedValue(undefined);

    await showQuickFix('whatever', ['help']);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});
