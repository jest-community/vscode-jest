jest.unmock('../src/StatusBar');
jest.useFakeTimers();

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "assertRender"] }] */
const newStatusBarItem = (type: StatusType) => ({
  text: '',
  command: '',
  show: jest.fn(),
  hide: jest.fn(),
  tooltip: '',
  type,
});

import * as vscode from 'vscode';
import { StatusBar, StatusType, ProcessState } from '../src/StatusBar';
import { TestStats } from '../src/types';

const mockSummaryChannel = { append: jest.fn(), clear: jest.fn() } as any;
const makeStats = (success: number, fail: number, unknown: number): TestStats => ({
  success,
  fail,
  unknown,
});

describe('StatusBar', () => {
  let statusBar: StatusBar;
  let updateSpy;
  let renderSpy;
  let mockActiveSBItem;
  let mockSummarySBItem;

  const setupWorkspace = (active: string, ...additional: string[]) => {
    const folders = [active, ...additional].map((ws) => ({ name: ws }));
    (vscode.workspace as any).workspaceFolders = folders;
    (vscode.window.activeTextEditor as any) = { document: { uri: 'whatever' } };
    vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValue(folders[0]);
  };

  beforeEach(() => {
    jest.resetAllMocks();

    mockActiveSBItem = newStatusBarItem(StatusType.active);
    mockSummarySBItem = newStatusBarItem(StatusType.summary);

    vscode.window.createOutputChannel = jest.fn(() => mockSummaryChannel);
    vscode.window.createStatusBarItem = jest.fn().mockImplementation((_, priority) => {
      if (priority === 2) {
        return mockActiveSBItem;
      }
      if (priority === 1) {
        return mockSummarySBItem;
      }
      throw new Error(`unexpected createStatusBarItem priority ${priority}`);
    });

    statusBar = new StatusBar();
    updateSpy = jest.spyOn(statusBar as any, 'handleUpdate');
    renderSpy = jest.spyOn(statusBar as any, 'render');
    updateSpy.mockClear();
    renderSpy.mockClear();
  });

  describe('register', () => {
    it('should add 2 commands', () => {
      statusBar.register(() => undefined);
      expect(vscode.commands.registerCommand).toBeCalledTimes(2);

      const registerCommand = vscode.commands.registerCommand as unknown as jest.Mock<{}>;
      const calls = registerCommand.mock.calls;
      expect(calls.some((c) => c[0].includes('show-summary-output'))).toBe(true);
      expect(calls.some((c) => c[0].includes('show-active-output'))).toBe(true);
    });
  });

  describe('bind()', () => {
    it('returns binded helpers for each workspace (source) to update its status', () => {
      const source = 'testSource';
      const helpers = statusBar.bind(source);
      ['initial', 'running', 'success', 'failed', 'stopped'].forEach((state) => {
        helpers.update({ state: state as ProcessState });
        expect(updateSpy).toHaveBeenCalledWith(source, { state });
      });
    });
  });

  describe('update()', () => {
    describe('single workspace', () => {
      beforeEach(() => {
        setupWorkspace('testSource1');
      });
      describe('will update both active and summary items', () => {
        const alertStats = { success: 1, fail: 2, unknown: 3 };
        const passStats = { success: 10, fail: 0, unknown: 0 };
        const emptyStatsString = `$(pass) 0 $(error) 0 $(question) 0`;

        it.each`
          seq  | update                                          | active                    | summary
          ${1} | ${{ state: 'running' }}                         | ${'$(sync~spin)'}         | ${emptyStatsString}
          ${2} | ${{ state: 'done' }}                            | ${''}                     | ${emptyStatsString}
          ${3} | ${{ mode: ['auto-run-watch', 'coverage'] }}     | ${'$(eye) $(color-mode)'} | ${emptyStatsString}
          ${4} | ${{ stats: alertStats }}                        | ${''}                     | ${'$(pass) 1 $(error) 2 $(question) 3'}
          ${5} | ${{ mode: ['auto-run-off'], stats: passStats }} | ${'$(wrench)'}            | ${'$(check)'}
        `('update: $update', ({ update, active, summary }) => {
          statusBar.bind('testSource1').update(update);
          expect(renderSpy).toBeCalledTimes(2);
          expect(mockActiveSBItem.text).toContain(active);
          expect(mockSummarySBItem.text).toContain(summary);
        });
        it.each`
          stats                                                 | summary
          ${{ success: 1, fail: 2, unknown: 3 }}                | ${'$(pass) 1 $(error) 2 $(question) 3'}
          ${{ success: 1, fail: 0, unknown: 0 }}                | ${'$(check)'}
          ${{ success: 3, fail: 1, unknown: 0 }}                | ${'$(pass) 3 $(error) 1 $(question) 0'}
          ${{ success: 0, fail: 0, unknown: 0 }}                | ${'$(pass) 0 $(error) 0 $(question) 0'}
          ${{ isDirty: true, success: 0, fail: 0, unknown: 0 }} | ${'$(sync-ignored) | $(pass) 0 $(error) 0 $(question) 0'}
        `('shows stats summary: $stats => $summary', ({ stats, summary }) => {
          statusBar.bind('testSource1').update({ stats });
          expect(renderSpy).toBeCalledTimes(2);
          expect(mockActiveSBItem.text).not.toContain(`Jest: ${summary}`);
          expect(mockSummarySBItem.text).toContain(`Jest-WS: ${summary}`);
        });
        it('shows tooltip by the actual status', () => {
          statusBar
            .bind('testSource1')
            .update({ mode: ['auto-run-on-save'], stats: { success: 1, fail: 2, unknown: 3 } });
          expect(mockActiveSBItem.tooltip).toContain('auto-run-on-save');
          expect(mockSummarySBItem.tooltip).toContain('success 1, fail 2, unknown 3');
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
      statusBar.bind('testSource1').update({ state: 'initial' });
      expect(mockActiveSBItem.text).toEqual('Jest: ...');
      expect(mockActiveSBItem.show).toBeCalled();
      expect(mockSummarySBItem.text).toEqual('Jest-WS: $(pass) 0 $(error) 0 $(question) 0');
      expect(mockSummarySBItem.show).toBeCalled();
    });
    it('when multiple workspace status updated', () => {
      statusBar.bind('testSource1').update({ state: 'initial' });
      expect(mockActiveSBItem.show).toBeCalledTimes(1);
      expect(mockActiveSBItem.text).toEqual('Jest: ...');
      expect(mockSummarySBItem.show).toBeCalledTimes(1);

      statusBar.bind('testSource2').update({ state: 'initial' });
      expect(mockSummarySBItem.show).toBeCalledTimes(2);
      expect(mockSummarySBItem.text).toMatchInlineSnapshot(
        `"Jest-WS: $(pass) 0 $(error) 0 $(question) 0"`
      );

      expect(mockActiveSBItem.hide).toBeCalledTimes(0);
    });
    it('will not show active status if no active workspace can be determined', () => {
      vscode.window.activeTextEditor = undefined;
      statusBar.bind('testSource1').update({ state: 'initial' });
      expect(mockActiveSBItem.show).toBeCalledTimes(1);
      mockActiveSBItem.show.mockClear();

      // with boh workspaces reported and no active text editor, can't determine the active workspace
      statusBar.bind('testSource2').update({ state: 'initial' });
      expect(mockActiveSBItem.show).toBeCalledTimes(0);
      expect(mockActiveSBItem.hide).toBeCalledTimes(1);
    });
    describe('onDidChangeActiveTextEditor', () => {
      beforeEach(() => {
        statusBar.bind('testSource1').update({ state: 'initial' });
        statusBar.bind('testSource2').update({ state: 'running' });
        mockActiveSBItem.show.mockClear();
      });

      it('can switch to new active workspace status when active editor changed', () => {
        // active workspace is 'testSource1' so testSource1 status is displayed
        expect(mockActiveSBItem.text).toEqual('Jest: ...');

        // now switch to testSource2, testSource2 status (running) should be displayed
        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValueOnce({ name: 'testSource2' });
        statusBar.onDidChangeActiveTextEditor(editor);
        expect(mockActiveSBItem.text).toEqual('Jest: $(sync~spin)');
        expect(mockActiveSBItem.show).toHaveBeenCalledTimes(1);
      });
      it('nothing will happen if switch to an empty editor', () => {
        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValueOnce({ name: 'testSource2' });
        statusBar.onDidChangeActiveTextEditor({} as any);
        expect(mockActiveSBItem.show).not.toHaveBeenCalled();
      });
      it('nothing will happen if switch switch to an the editor under the same workspace', () => {
        vscode.workspace.getWorkspaceFolder = jest
          .fn()
          .mockReturnValueOnce({ name: 'testSource1' });
        statusBar.onDidChangeActiveTextEditor(editor);
        expect(mockActiveSBItem.show).not.toHaveBeenCalled();
      });
    });
    describe('summary render', () => {
      beforeEach(() => {
        setupWorkspace('testSource1', 'testSource2', 'testSource3');
        statusBar.bind('testSource1').update({
          state: 'initial',
          mode: ['auto-run-off'],
        });
        statusBar.bind('testSource2').update({
          state: 'running',
          mode: ['auto-run-watch', 'coverage'],
        });
        statusBar.bind('testSource3').update({
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
        statusBar.bind('testSource1').update({ stats: stats1 });
        statusBar.bind('testSource2').update({ stats: stats2 });
        statusBar.bind('testSource3').update({ stats: stats3 });
        expect(mockSummarySBItem.text).toContain(expectedText);
      });
      describe('output channel', () => {
        it('display status in plain text', () => {
          mockSummaryChannel.append.mockClear();
          statusBar.bind('testSource1').update({
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
      vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValueOnce(undefined);
    });
    it('will still show active if only one workspace reported', () => {
      statusBar.bind('testSource1').update({ state: 'running' });
      expect(mockActiveSBItem.show).toBeCalledTimes(1);
      expect(mockActiveSBItem.hide).not.toBeCalled();
    });
    it('active status bar should be hidden if multiple workspaces reported', () => {
      statusBar.bind('testSource1').update({ state: 'running' });
      statusBar.bind('testSource2').update({ state: 'done' });
      expect(mockActiveSBItem.hide).toBeCalledTimes(1);
    });
  });

  describe('StatusBarItem', () => {
    const registerCommand = vscode.commands.registerCommand as unknown as jest.Mock<{}>;

    afterEach(() => {
      (vscode.workspace as any).workspaceFolders = [];
      vscode.window.activeTextEditor = undefined;
    });

    it('responds to clicks for one active WorkspaceFolder', () => {
      const getExtensionByName = jest.fn();
      statusBar.register(getExtensionByName);

      const statusBarClickHandler = registerCommand.mock.calls.find((c) =>
        c[0].includes('show-active-output')
      )[1];
      expect(statusBarClickHandler).toBeDefined();
      (vscode.workspace as any).workspaceFolders = [
        { name: 'testproject', uri: vscode.Uri.file(''), index: 0 },
      ];
      statusBarClickHandler();
      expect(getExtensionByName).toBeCalledWith('testproject');
    });

    it('responds to clicks for two WorkspaceFolders but only one active', () => {
      const getExtensionByName = jest.fn();
      statusBar.register(getExtensionByName);

      const statusBarClickHandler = registerCommand.mock.calls.find((c) =>
        c[0].includes('show-active-output')
      )[1];
      expect(statusBarClickHandler).toBeDefined();
      (vscode.workspace as any).workspaceFolders = [
        { name: 'testproject1', uri: vscode.Uri.file(''), index: 0 },
        { name: 'testproject2', uri: vscode.Uri.file(''), index: 1 },
        { name: 'testproject3', uri: vscode.Uri.file(''), index: 2 },
      ];
      const projectUrl = vscode.Uri.file('projecturl');
      vscode.window.activeTextEditor = {
        document: { uri: projectUrl },
      } as unknown as vscode.TextEditor;
      vscode.workspace.getWorkspaceFolder = (url) =>
        url === projectUrl ? vscode.workspace.workspaceFolders[1] : undefined;
      statusBarClickHandler();
      expect(getExtensionByName).toBeCalledWith(vscode.workspace.workspaceFolders[1].name);
    });
  });
});
