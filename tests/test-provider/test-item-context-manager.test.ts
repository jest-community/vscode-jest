jest.unmock('../../src/test-provider/test-item-context-manager');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { extensionName } from '../../src/appGlobals';
import { TestItemContextManager } from '../../src/test-provider/test-item-context-manager';

describe('TestItemContextManager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe('can set itemContext', () => {
    it.each`
      case | context                                                   | withItemKey            | withoutItemKey
      ${1} | ${{ key: 'jest.autoRun', value: true, itemIds: ['a'] }}   | ${'jest.autoRun.on'}   | ${'jest.autoRun.off'}
      ${2} | ${{ key: 'jest.autoRun', value: false, itemIds: ['a'] }}  | ${'jest.autoRun.off'}  | ${'jest.autoRun.on'}
      ${2} | ${{ key: 'jest.coverage', value: true, itemIds: ['a'] }}  | ${'jest.coverage.on'}  | ${'jest.coverage.off'}
      ${2} | ${{ key: 'jest.coverage', value: false, itemIds: ['a'] }} | ${'jest.coverage.off'} | ${'jest.coverage.on'}
    `('case $case: setContext for $expectedKey', ({ context, withItemKey, withoutItemKey }) => {
      const workspace: any = { name: 'ws' };
      const manager = new TestItemContextManager();
      manager.setItemContext({ workspace, ...context });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        withItemKey,
        context.itemIds
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', withoutItemKey, []);
    });
    it('can manage itemContext for multiple workspaces', () => {
      const ws1: any = { name: 'ws1' };
      const ws2: any = { name: 'ws2' };
      const manager = new TestItemContextManager();
      manager.setItemContext({
        workspace: ws1,
        key: 'jest.autoRun',
        value: true,
        itemIds: ['a', 'b'],
      });
      manager.setItemContext({ workspace: ws2, key: 'jest.autoRun', value: true, itemIds: ['c'] });
      manager.setItemContext({ workspace: ws2, key: 'jest.autoRun', value: false, itemIds: ['d'] });
      manager.setItemContext({
        workspace: ws2,
        key: 'jest.coverage',
        value: true,
        itemIds: ['c'],
      });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'jest.autoRun.on', [
        'a',
        'b',
        'c',
      ]);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'jest.autoRun.off',
        ['d']
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'jest.coverage.on',
        ['c']
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'jest.coverage.off',
        []
      );
    });
  });
  describe('can register item menu commands', () => {
    it('toggle-autoRun menu commands', () => {
      const manager = new TestItemContextManager();
      const disposableList = manager.registerCommands();
      expect(disposableList).toHaveLength(4);

      const commands = [
        `${extensionName}.test-item.auto-run.toggle-on`,
        `${extensionName}.test-item.auto-run.toggle-off`,
      ];
      const calls = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls.filter(
        (call) => commands.includes(call[0])
      );

      // set some itemContext then trigger the menu
      const extCmd = `${extensionName}.with-workspace.toggle-auto-run`;
      const workspace: any = { name: 'ws' };
      manager.setItemContext({ workspace, key: 'jest.autoRun', value: true, itemIds: ['a'] });
      expect(calls).toHaveLength(2);
      calls.forEach((call) => {
        const callBack = call[1];
        callBack({ id: 'a' });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(extCmd, workspace);

        (vscode.commands.executeCommand as jest.Mocked<any>).mockClear();
        callBack({ id: 'b' });
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(extCmd, workspace);
      });
    });
    it('toggle-coverage menu commands', () => {
      const manager = new TestItemContextManager();
      const disposableList = manager.registerCommands();
      expect(disposableList).toHaveLength(4);

      const commands = [
        `${extensionName}.test-item.coverage.toggle-on`,
        `${extensionName}.test-item.coverage.toggle-off`,
      ];
      const calls = (vscode.commands.registerCommand as jest.Mocked<any>).mock.calls.filter(
        (call) => commands.includes(call[0])
      );

      // set some itemContext then trigger the menu
      const extCmd = `${extensionName}.with-workspace.toggle-coverage`;
      const workspace: any = { name: 'ws' };
      manager.setItemContext({ workspace, key: 'jest.coverage', value: false, itemIds: ['a'] });
      expect(calls).toHaveLength(2);
      calls.forEach((call) => {
        const callBack = call[1];
        callBack({ id: 'a' });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(extCmd, workspace);

        (vscode.commands.executeCommand as jest.Mocked<any>).mockClear();
        callBack({ id: 'b' });
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(extCmd, workspace);
      });
    });
  });
});
