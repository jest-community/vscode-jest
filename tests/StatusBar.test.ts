jest.unmock('../src/StatusBar');
jest.unmock('../src/virtual-workspace-folder');
jest.unmock('./test-helper');
jest.useFakeTimers();

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "assertRender"] }] */

import * as vscode from 'vscode';
import { StatusBar, StatusType, ProcessState } from '../src/StatusBar';
import { TestStats } from '../src/types';
import { makeUri, makeWorkspaceFolder } from './test-helper';
import { VirtualWorkspaceFolder } from '../src/virtual-workspace-folder';
import { isInFolder } from '../src/workspace-manager';

const mockSummaryChannel = {
  append: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
} as any;
const makeStats = (success: number, fail: number, unknown: number): TestStats => ({
  success,
  fail,
  unknown,
});

describe('StatusBar', () => {
  let statusBar: StatusBar;
  let updateSpy;
  let renderSpy;
  // let mockActiveSBItem;
  // let mockSummarySBItem;
  let createFolderItemSpy;
  let createSummaryItemSpy;
  let mockSummarySBItems;
  let mockActiveSBItems;

  const mockIsInFolder = (...folderNames: string[] | undefined) => {
    (isInFolder as jest.Mocked<any>).mockImplementation(
      (_uri, folder) => folderNames && folderNames.find((n) => n === folder.name) !== undefined
    );
  };

  const setupWorkspace = (active: string, ...additional: string[]) => {
    const folders = [active, ...additional].map((ws) => makeWorkspaceFolder(ws));
    (vscode.workspace as any).workspaceFolders = folders;
    (vscode.window.activeTextEditor as any) = { document: { uri: makeUri('whatever') } };
    // default to be in the first folder
    mockIsInFolder(folders[0].name);
    return folders;
  };

  beforeEach(() => {
    jest.resetAllMocks();

    mockSummarySBItems = [];
    mockActiveSBItems = [];

    vscode.window.createOutputChannel = jest.fn(() => mockSummaryChannel);
    vscode.window.createStatusBarItem = jest.fn().mockImplementation((_, priority) => {
      let isVisible = false;
      const show = jest.fn().mockImplementation(() => (isVisible = true));
      const hide = jest.fn().mockImplementation(() => (isVisible = false));
      const newStatusBarItem = (type: StatusType) => ({
        text: '',
        command: '',
        show,
        hide,
        dispose: jest.fn(),
        tooltip: '',
        type,
        isVisible: () => isVisible,
      });
      if (priority === 2) {
        const item = newStatusBarItem(StatusType.active);
        mockActiveSBItems.push(item);
        return item;
      }
      if (priority === 1) {
        const item = newStatusBarItem(StatusType.summary);
        mockSummarySBItems.push(item);
        return item;
      }
      throw new Error(`unexpected createStatusBarItem priority ${priority}`);
    });
    (vscode.ThemeColor as jest.Mocked<any>).mockImplementation((id) => ({
      id,
    }));

    createFolderItemSpy = jest.spyOn(StatusBar.prototype as any, 'createFolderStatusBarItem');
    createSummaryItemSpy = jest.spyOn(StatusBar.prototype as any, 'createSummaryStatusBarItem');

    (isInFolder as jest.Mocked<any>).mockReturnValue(true);

    statusBar = new StatusBar();
    updateSpy = jest.spyOn(statusBar as any, 'handleUpdate');
    renderSpy = jest.spyOn(statusBar as any, 'render');
    updateSpy.mockClear();
    renderSpy.mockClear();
  });
  afterEach(() => {
    // restore the spy created with spyOn
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('should add 2 commands', () => {
      statusBar.register(() => undefined);
      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(2);

      const registerCommand = vscode.commands.registerCommand as unknown as jest.Mock<{}>;
      const calls = registerCommand.mock.calls;
      expect(calls.some((c) => c[0].includes('show-summary-output'))).toBe(true);
      expect(calls.some((c) => c[0].includes('show-active-output'))).toBe(true);
    });
    it('each command will show corresponding output', () => {
      const ext: any = { showOutput: jest.fn() };
      statusBar.register(() => ext);

      const calls = (vscode.commands.registerCommand as jest.Mock<any>).mock.calls;

      setupWorkspace('testSource1');
      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'initial' });

      let found = 0;
      for (const call of calls) {
        //invoke the command
        if (call[0].includes('show-summary-output')) {
          call[1]();
          expect(mockSummaryChannel.show).toHaveBeenCalled();
          found |= 0x1;
        } else if (call[0].includes('show-active-output')) {
          call[1]({ workspaceFolder: makeWorkspaceFolder('testSource1') });
          expect(ext.showOutput).toHaveBeenCalled();
          found |= 0x2;
        }
      }
      expect(found).toEqual(3);
    });
  });

  describe('bind()', () => {
    it('returns binded helpers for each workspace (source) to update its status', () => {
      const source = makeWorkspaceFolder('testSource');
      const helpers = statusBar.bind(source);
      ['initial', 'running', 'success', 'failed', 'stopped'].forEach((state) => {
        helpers.update({ state: state as ProcessState });
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceFolder: source }),
          { state }
        );
      });
    });
    it('will create status bar items for each workspace (source)', () => {
      const ws1 = makeWorkspaceFolder('ws1');
      const ws2 = makeWorkspaceFolder('ws2');
      statusBar.bind(ws1);
      statusBar.bind(ws2);
      expect(createFolderItemSpy).toHaveBeenCalledTimes(2);
      expect(createFolderItemSpy).toHaveBeenCalledWith(ws1);
      expect(createFolderItemSpy).toHaveBeenCalledWith(ws2);
    });
    it('will not duplicate status bar items for same workspace (source)', () => {
      const ws1 = makeWorkspaceFolder('ws1');
      statusBar.bind(ws1);
      expect(createFolderItemSpy).toHaveBeenCalledTimes(1);
      expect(createFolderItemSpy).toHaveBeenCalledWith(ws1);

      statusBar.bind(ws1);
      expect(createFolderItemSpy).toHaveBeenCalledTimes(1);
    });
    it('binding same workspace (source) multiple times will not create duplicate statusBarItem', () => {
      const ws1 = makeWorkspaceFolder('ws1');
      const ws2 = makeWorkspaceFolder('ws1');
      statusBar.bind(ws1);
      statusBar.bind(ws2);
      expect(createFolderItemSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('update()', () => {
    describe('single workspace', () => {
      beforeEach(() => {
        setupWorkspace('testSource1');
      });
      describe('will update both active and summary items', () => {
        const alertStats = { success: 1, fail: 2, unknown: 3 };
        const alertSummary = '$(pass) 1 $(error) 2 $(question) 3';
        const passStats = { success: 10, fail: 0, unknown: 0 };
        const emptyStatsString = `$(pass) 0 $(error) 0 $(question) 0`;

        it.each`
          seq  | update                                                    | active                    | summary             | backgroundColor
          ${1} | ${{ state: 'running' }}                                   | ${'$(sync~spin)'}         | ${emptyStatsString} | ${undefined}
          ${2} | ${{ state: 'done' }}                                      | ${''}                     | ${emptyStatsString} | ${undefined}
          ${3} | ${{ mode: ['auto-run-watch', 'coverage'] }}               | ${'$(eye) $(color-mode)'} | ${emptyStatsString} | ${undefined}
          ${4} | ${{ stats: alertStats }}                                  | ${''}                     | ${alertSummary}     | ${undefined}
          ${5} | ${{ mode: ['auto-run-off'], stats: passStats }}           | ${'$(wrench)'}            | ${'$(check)'}       | ${undefined}
          ${6} | ${{ state: 'exec-error' }}                                | ${'alert'}                | ${emptyStatsString} | ${'statusBarItem.errorBackground'}
          ${7} | ${{ state: 'initial' }}                                   | ${'...'}                  | ${emptyStatsString} | ${undefined}
          ${8} | ${{ state: 'stopped' }}                                   | ${'stopped'}              | ${emptyStatsString} | ${'statusBarItem.errorBackground'}
          ${9} | ${{ mode: ['auto-run-on-save-test'], stats: alertStats }} | ${'$(save)'}              | ${alertSummary}     | ${undefined}
        `('update: $update', ({ update, active, summary, backgroundColor }) => {
          statusBar.bind(makeWorkspaceFolder('testSource1')).update(update);
          expect(renderSpy).toHaveBeenCalledTimes(2);
          expect(mockActiveSBItems[0].text).toContain(active);
          expect(mockSummarySBItems[0].text).toContain(summary);
          if (backgroundColor) {
            expect(mockActiveSBItems[0].backgroundColor.id).toEqual(
              expect.stringContaining(backgroundColor)
            );
          } else {
            expect(mockActiveSBItems[0].backgroundColor).toBeUndefined();
          }
        });
        it.each`
          stats                                                 | summary
          ${{ success: 1, fail: 2, unknown: 3 }}                | ${'$(pass) 1 $(error) 2 $(question) 3'}
          ${{ success: 1, fail: 0, unknown: 0 }}                | ${'$(check)'}
          ${{ success: 3, fail: 1, unknown: 0 }}                | ${'$(pass) 3 $(error) 1 $(question) 0'}
          ${{ success: 0, fail: 0, unknown: 0 }}                | ${'$(pass) 0 $(error) 0 $(question) 0'}
          ${{ isDirty: true, success: 0, fail: 0, unknown: 0 }} | ${'$(sync-ignored) | $(pass) 0 $(error) 0 $(question) 0'}
        `('shows stats summary: $stats => $summary', ({ stats, summary }) => {
          statusBar.bind(makeWorkspaceFolder('testSource1')).update({ stats });
          expect(renderSpy).toHaveBeenCalledTimes(2);
          expect(mockActiveSBItems[0].text).not.toContain(`Jest: ${summary}`);
          expect(mockSummarySBItems[0].text).toContain(`Jest-WS: ${summary}`);
        });
        it('shows tooltip by the actual status', () => {
          statusBar
            .bind(makeWorkspaceFolder('testSource1'))
            .update({ mode: ['auto-run-on-save'], stats: { success: 1, fail: 2, unknown: 3 } });
          expect(mockActiveSBItems[0].tooltip).toContain('auto-run-on-save');
          expect(mockSummarySBItems[0].tooltip).toContain('success 1, fail 2, unknown 3');
        });
      });
    });
  });
  describe('multiroot workspace', () => {
    const editor: any = {
      document: { uri: 'whatever' },
    };

    beforeEach(() => {
      setupWorkspace('testSource1', 'testSource2');
    });

    it('will update both active and summary status', () => {
      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'initial' });
      const summaryItem = createSummaryItemSpy.mock.results[0].value;
      const item1 = createFolderItemSpy.mock.results[0].value;
      expect(item1.isVisible).toBeTruthy();
      expect(summaryItem.isVisible).toBeTruthy();

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), item1);
      expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), summaryItem);
    });
    it('when multiple workspace status updated', () => {
      const summaryItem = createSummaryItemSpy.mock.results[0].value;
      expect(summaryItem.isVisible).toBeFalsy();

      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'initial' });
      const item1 = createFolderItemSpy.mock.results[0].value;

      expect(item1.isVisible).toBeTruthy();
      expect(summaryItem.isVisible).toBeTruthy();
      expect(mockActiveSBItems[0].text).toEqual('Jest: ...');

      statusBar.bind(makeWorkspaceFolder('testSource2')).update({ state: 'initial' });
      const item2 = createFolderItemSpy.mock.results[1].value;
      expect(item2.isVisible).toBeFalsy();

      expect(summaryItem.isVisible).toBeTruthy();
      expect(mockSummarySBItems[0].text).toMatchInlineSnapshot(
        `"Jest-WS: $(pass) 0 $(error) 0 $(question) 0"`
      );
    });
    it('will not show active status if no active workspace can be determined', () => {
      vscode.window.activeTextEditor = undefined;
      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'initial' });
      const item1 = createFolderItemSpy.mock.results[0].value;
      expect(item1.isVisible).toBeFalsy();

      // with boh workspaces reported and no active text editor, can't determine the active workspace
      statusBar.bind(makeWorkspaceFolder('testSource2')).update({ state: 'initial' });
      const item2 = createFolderItemSpy.mock.results[1].value;
      expect(item2.isVisible).toBeFalsy();
    });
    describe('onDidChangeActiveTextEditor', () => {
      let item1, item2;
      beforeEach(() => {
        statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'initial' });
        statusBar.bind(makeWorkspaceFolder('testSource2')).update({ state: 'running' });
        item1 = createFolderItemSpy.mock.results[0].value;
        item2 = createFolderItemSpy.mock.results[1].value;
      });

      it('can switch to new active workspace status when active editor changed', () => {
        // active workspace is 'testSource1' so testSource1 status is displayed
        expect(item1.isVisible).toBeTruthy();
        expect(mockActiveSBItems[0].text).toEqual('Jest: ...');

        // now switch to testSource2, testSource2 status (running) should be displayed
        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValueOnce({ name: 'testSource2' });
        statusBar.onDidChangeActiveTextEditor(editor);
        expect(mockActiveSBItems[1].text).toEqual('Jest (testSource2): $(sync~spin)');
        expect(item1.isVisible).toBeFalsy();
        expect(item2.isVisible).toBeTruthy();
      });
      it('nothing will happen if switch to an empty editor', () => {
        vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(undefined);
        statusBar.onDidChangeActiveTextEditor({} as any);
        expect(item1.isVisible).toBeFalsy();
        expect(item2.isVisible).toBeFalsy();
      });
      it('if no folder matches, will hide all active items', () => {
        vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(undefined);
        statusBar.onDidChangeActiveTextEditor(editor);
        expect(item1.isVisible).toBeFalsy();
        expect(item2.isVisible).toBeFalsy();
      });
      it('if new text editor belongs to the same workspace, will not update', () => {
        // item1 (testSource1) is already visible
        expect(updateSpy).toHaveBeenCalled();
        expect(item1.isVisible).toBeTruthy();
        updateSpy.mockClear();

        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValueOnce({ name: 'testSource1' });
        statusBar.onDidChangeActiveTextEditor(editor);
        expect(item1.isVisible).toBeTruthy();
        expect(updateSpy).not.toHaveBeenCalled();
      });
    });
    describe('summary render', () => {
      beforeEach(() => {
        setupWorkspace('testSource1', 'testSource2', 'testSource3');
        statusBar.bind(makeWorkspaceFolder('testSource1')).update({
          state: 'initial',
          mode: ['auto-run-off'],
        });
        statusBar.bind(makeWorkspaceFolder('testSource2')).update({
          state: 'running',
          mode: ['auto-run-watch', 'coverage'],
        });
        statusBar.bind(makeWorkspaceFolder('testSource3')).update({
          state: 'done',
          mode: ['auto-run-on-save-test', 'coverage'],
        });
      });
      it.each`
        stats1                | stats2                | stats3                | expectedText
        ${makeStats(0, 0, 3)} | ${makeStats(1, 2, 0)} | ${makeStats(7, 1, 3)} | ${'$(pass) 8 $(error) 3 $(question) 6'}
        ${makeStats(0, 0, 3)} | ${makeStats(0, 0, 0)} | ${undefined}          | ${'$(pass) 0 $(error) 0 $(question) 3'}
        ${makeStats(0, 0, 0)} | ${makeStats(0, 0, 0)} | ${makeStats(1, 0, 0)} | ${'$(check)'}
      `('show total stats in statusBar', ({ stats1, stats2, stats3, expectedText }) => {
        statusBar.bind(makeWorkspaceFolder('testSource1')).update({ stats: stats1 });
        statusBar.bind(makeWorkspaceFolder('testSource2')).update({ stats: stats2 });
        statusBar.bind(makeWorkspaceFolder('testSource3')).update({ stats: stats3 });
        expect(mockSummarySBItems[0].text).toContain(expectedText);
      });
      describe('output channel', () => {
        it('display status in plain text', () => {
          mockSummaryChannel.append.mockClear();
          statusBar.bind(makeWorkspaceFolder('testSource1')).update({
            state: 'running',
            mode: ['auto-run-watch', 'coverage'],
            stats: makeStats(1, 2, 3),
          });
          const output = mockSummaryChannel.append.mock.calls[0][0];
          expect(output).toMatchInlineSnapshot(`
            "testSource1:		warning | success 1, fail 2, unknown 3; mode: auto-run-watch, coverage; state: running
            testSource2:		mode: auto-run-watch, coverage; state: running
            testSource3:		mode: auto-run-on-save-test, coverage; state: idle"
          `);
        });
      });
    });
  });
  describe('when no active workspace', () => {
    beforeEach(() => {
      (vscode.workspace as any).workspaceFolders = [];
      mockIsInFolder(undefined);
    });
    it('no active item will be shown even if only one workspace reported', () => {
      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'running' });
      const item1 = createFolderItemSpy.mock.results[0].value;
      expect(item1.isVisible).toBeFalsy();
      expect(renderSpy).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), item1);
    });
    it('active status bar should be hidden if multiple workspaces reported', () => {
      statusBar.bind(makeWorkspaceFolder('testSource1')).update({ state: 'running' });
      statusBar.bind(makeWorkspaceFolder('testSource2')).update({ state: 'done' });
      const item1 = createFolderItemSpy.mock.results[0].value;
      const item2 = createFolderItemSpy.mock.results[1].value;
      expect(item1.isVisible).toBeFalsy();
      expect(item2.isVisible).toBeFalsy();
    });
  });

  describe('virtual workspace folders', () => {
    let ws1, ws2, v1, v2, v3;
    let isInWorkspaceFolderSpy;
    beforeEach(() => {
      [ws1, ws2] = setupWorkspace('ws-1', 'ws-2');
      v1 = new VirtualWorkspaceFolder(ws1, 'v1');
      v2 = new VirtualWorkspaceFolder(ws1, 'v2');
      v3 = new VirtualWorkspaceFolder(ws2, 'v3');

      isInWorkspaceFolderSpy = jest.spyOn(VirtualWorkspaceFolder.prototype, 'isInWorkspaceFolder');
    });

    it.each`
      case | inWorkspaceFolder
      ${1} | ${[true, true]}
      ${2} | ${[true, false]}
      ${3} | ${[false, false]}
    `(
      'case $case: will only show status bar items if the uri is in the specific worksppace folder',
      ({ inWorkspaceFolder }) => {
        // active document are in both v1 and v2 folders
        (isInFolder as jest.Mocked<any>)
          .mockReturnValueOnce(inWorkspaceFolder[0])
          .mockReturnValueOnce(inWorkspaceFolder[1])
          .mockReturnValueOnce(false);

        statusBar.bind(v1).update({ state: 'running' });
        statusBar.bind(v2).update({ state: 'done' });
        statusBar.bind(v3).update({ state: 'initial' });
        // 3 items created
        expect(createFolderItemSpy.mock.results).toHaveLength(3);
        expect(isInFolder).toHaveBeenCalledTimes(3);

        // since the URI will match ws1, so only the virtual folders under ws1 will be visible
        expect(createFolderItemSpy.mock.results[0].value.isVisible).toEqual(inWorkspaceFolder[0]); // v1
        expect(createFolderItemSpy.mock.results[1].value.isVisible).toEqual(inWorkspaceFolder[1]); // v2
        expect(createFolderItemSpy.mock.results[2].value.isVisible).toBeFalsy(); //v3
      }
    );
    it('will display the correct status bar item when active editor changed', () => {
      const editor: any = { document: { uri: makeUri('test') } };

      statusBar.bind(v1).update({ state: 'running' });
      statusBar.bind(v2).update({ state: 'done' });
      statusBar.bind(ws2).update({ state: 'initial' });

      // active editor is in ws1
      vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(ws1);
      isInWorkspaceFolderSpy.mockReturnValueOnce(true).mockReturnValueOnce(true);

      statusBar.onDidChangeActiveTextEditor(editor);
      expect(createFolderItemSpy.mock.results[0].value.isVisible).toBeTruthy();
      expect(createFolderItemSpy.mock.results[1].value.isVisible).toBeTruthy();
      expect(createFolderItemSpy.mock.results[2].value.isVisible).toBeFalsy();

      // active editor is in ws2
      vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(ws2);
      statusBar.onDidChangeActiveTextEditor(editor);
      expect(createFolderItemSpy.mock.results[0].value.isVisible).toBeFalsy();
      expect(createFolderItemSpy.mock.results[1].value.isVisible).toBeFalsy();
      expect(createFolderItemSpy.mock.results[2].value.isVisible).toBeTruthy();
    });
  });

  describe('clear up functions', () => {
    let ws1, ws2, v1, v2, editor;
    beforeEach(() => {
      // setup 2 workspace folders with 2 virtual folders
      [ws1, ws2] = setupWorkspace('ws-1', 'ws-2');
      v1 = new VirtualWorkspaceFolder(ws1, 'v1');
      v2 = new VirtualWorkspaceFolder(ws1, 'v2');
      editor = { document: { uri: makeUri('test') } };
      mockIsInFolder(ws1.name, v1.name, v2.name);
    });
    it('when workspace folder is removed, the status bar item will be removed', () => {
      // active editor is in ws1
      vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(ws1);
      vscode.window.activeTextEditor = editor;

      statusBar.bind(ws2).update({ state: 'running' });
      statusBar.bind(v1).update({ state: 'running' });
      statusBar.bind(v2).update({ state: 'running' });

      // created 3 items total. v1 and v2 are visible
      expect(createFolderItemSpy.mock.results).toHaveLength(3);
      const [ws2Item, v1Item, v2Item] = createFolderItemSpy.mock.results.map((r) => r.value);
      expect(ws2Item.isVisible).toBeFalsy(); // ws2
      expect(v1Item.isVisible).toBeTruthy(); // v1
      expect(v2Item.isVisible).toBeTruthy(); // v2

      expect(ws2Item.workspaceFolder).toBe(ws2);
      const disposeSpy = jest.spyOn(ws2Item, 'dispose');

      // rmeove ws2 folder
      statusBar.removeWorkspaceFolder(ws2);
      expect(disposeSpy).toHaveBeenCalled();

      // switch active editor to ws2
      mockIsInFolder(ws2.name);
      statusBar.onDidChangeActiveTextEditor(editor);

      //now v1 and v2 are not visible
      expect(v1Item.isVisible).toBeFalsy(); // v1
      expect(v2Item.isVisible).toBeFalsy(); // v2
    });
    it('when dispose, all status bar items will be disposed', () => {
      vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(ws1);
      vscode.window.activeTextEditor = editor;

      statusBar.bind(ws2).update({ state: 'running' });
      statusBar.bind(v1).update({ state: 'running' });
      statusBar.bind(v2).update({ state: 'running' });

      const [ws2Spy, v1Spy, v2Spy] = createFolderItemSpy.mock.results.map((r) =>
        jest.spyOn(r.value, 'dispose')
      );

      statusBar.dispose();

      [ws2Spy, v1Spy, v2Spy].forEach((disposeSpy) => expect(disposeSpy).toHaveBeenCalled());
    });
  });
});
