jest.unmock('../../src/JestExt/run-mode');

import {
  RunMode,
  RunModeEditor,
  RunModeIcons,
  runModeDescription,
  typeIcon,
} from '../../src/JestExt/run-mode';
import * as vscode from 'vscode';
import { updateSetting } from '../../src/Settings';

describe('RunMode', () => {
  const defaultRunModeConfig = { type: 'watch', revealOutput: 'on-run' };
  describe('constructor', () => {
    it.each`
      seq  | setting        | legacySettings        | expected
      ${1} | ${'watch'}     | ${undefined}          | ${{ type: 'watch', revealOutput: 'on-run' }}
      ${2} | ${'on-save'}   | ${undefined}          | ${{ type: 'on-save', revealOutput: 'on-run' }}
      ${3} | ${'on-demand'} | ${undefined}          | ${{ type: 'on-demand', revealOutput: 'on-run' }}
      ${4} | ${'deferred'}  | ${undefined}          | ${{ type: 'on-demand', revealOutput: 'on-run', deferred: true }}
      ${5} | ${'typo'}      | ${undefined}          | ${'error'}
      ${6} | ${'watch'}     | ${{ autoRun: 'off' }} | ${{ type: 'watch', revealOutput: 'on-run' }}
    `(
      'case $seq: creating a RunMode from predefined type: $setting',
      ({ setting, legacySettings, expected }) => {
        const runMode = new RunMode(setting, legacySettings);
        if (expected === 'error') {
          expect(runMode.config).toEqual(defaultRunModeConfig);
          expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        } else {
          expect(runMode.config).toEqual(expected);
        }
      }
    );
    it.each`
      seq  | setting                                      | legacySettings        | expected
      ${1} | ${{ type: 'watch', revealOutput: 'on-run' }} | ${undefined}          | ${{ type: 'watch', revealOutput: 'on-run' }}
      ${2} | ${{ type: 'watch' }}                         | ${undefined}          | ${{ type: 'watch' }}
      ${3} | ${{ type: 'on-save', testFileOnly: true }}   | ${undefined}          | ${{ type: 'on-save', testFileOnly: true }}
      ${4} | ${{ type: 'manual' }}                        | ${undefined}          | ${'error'}
      ${5} | ${{ type: 'watch', revealOutput: 'on-run' }} | ${{ autoRun: 'off' }} | ${{ type: 'watch', revealOutput: 'on-run' }}
    `(
      'case $seq: creating a RunMode from existing config without change: $setting',
      ({ setting, legacySettings, expected }) => {
        const runMode = new RunMode(setting, legacySettings);
        if (expected === 'error') {
          expect(runMode.config).toEqual(defaultRunModeConfig);
          expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        } else {
          expect(runMode.config).toEqual(expected);
        }
      }
    );
    describe(`migrating from existing settings`, () => {
      it.each`
        seq  | legacySettings                                            | expected
        ${1} | ${{ autoRun: 'off' }}                                     | ${{ type: 'on-demand', revealOutput: 'on-run' }}
        ${2} | ${{ autoRun: 'watch' }}                                   | ${{ type: 'watch', revealOutput: 'on-run' }}
        ${3} | ${{ autoRun: 'on-save' }}                                 | ${{ type: 'on-save', revealOutput: 'on-run' }}
        ${4} | ${{ autoRun: 'legacy' }}                                  | ${{ type: 'watch', revealOutput: 'on-run', runAllTestsOnStartup: true }}
        ${5} | ${{ autoRun: { watch: true, onStartup: ['all-tests'] } }} | ${{ type: 'watch', revealOutput: 'on-run', runAllTestsOnStartup: true }}
        ${6} | ${{ autoRun: { watch: false, onSave: 'test-src-file' } }} | ${{ type: 'on-save', revealOutput: 'on-run' }}
        ${7} | ${{ autoRun: { watch: false, onSave: 'test-file' } }}     | ${{ type: 'on-save', revealOutput: 'on-run', testFileOnly: true }}
        ${8} | ${{ autoRun: 'typo' }}                                    | ${'error'}
      `('case $seq: can create autoRun from autoRun settings', ({ legacySettings, expected }) => {
        const runMode = new RunMode(undefined, legacySettings);
        if (expected === 'error') {
          expect(runMode.config).toEqual(defaultRunModeConfig);
          expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        } else {
          expect(runMode.config).toEqual(expected);
        }
      });
      it.each`
        seq  | setting      | legacySettings                                                           | expected
        ${1} | ${undefined} | ${{ showCoverageOnLoad: true }}                                          | ${{ type: 'watch', revealOutput: 'on-run', coverage: true }}
        ${2} | ${'watch'}   | ${{ showCoverageOnLoad: true }}                                          | ${{ type: 'watch', revealOutput: 'on-run' }}
        ${3} | ${undefined} | ${{ autoRevealOutput: 'off' }}                                           | ${{ type: 'watch', revealOutput: 'on-demand' }}
        ${4} | ${undefined} | ${{ autoRevealOutput: 'on-run' }}                                        | ${{ type: 'watch', revealOutput: 'on-run' }}
        ${5} | ${undefined} | ${{ autoRevealOutput: 'on-exec-error' }}                                 | ${{ type: 'watch', revealOutput: 'on-exec-error' }}
        ${6} | ${undefined} | ${{ autoRevealOutput: 'something' }}                                     | ${'error'}
        ${7} | ${undefined} | ${{ showCoverageOnLoad: true }}                                          | ${{ type: 'watch', revealOutput: 'on-run', coverage: true }}
        ${8} | ${undefined} | ${{ showCoverageOnLoad: false }}                                         | ${{ type: 'watch', revealOutput: 'on-run' }}
        ${9} | ${undefined} | ${{ autoRun: 'off', autoRevealOutput: 'off', showCoverageOnLoad: true }} | ${{ type: 'on-demand', revealOutput: 'on-demand', coverage: true }}
      `(
        'case $seq: migrating other legacy settings to RunMode',
        ({ setting, legacySettings, expected }) => {
          const runMode = new RunMode(setting, legacySettings);
          if (expected === 'error') {
            expect(runMode.config).toEqual(defaultRunModeConfig);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
          } else {
            expect(runMode.config).toEqual(expected);
          }
        }
      );
    });
  });
  it('can exit defer mode', () => {
    const runMode = new RunMode({ type: 'watch', deferred: true });
    expect(runMode.config.deferred).toBe(true);
    runMode.exitDeferMode();
    expect(runMode.config.deferred).toBe(false);
    expect(runMode.isModified).toBe(true);
  });
  it('can toggle coverage', () => {
    const runMode = new RunMode({ type: 'watch' });
    expect(runMode.config.coverage).toBe(undefined);
    runMode.toggleCoverage();
    expect(runMode.config.coverage).toBe(true);
    expect(runMode.isModified).toBe(true);
  });

  describe('can popup a picker to change run mode', () => {
    let mockQuickPick: any;
    const createMockQuickPick = () => {
      let hideFunc: any;
      let exitFunction: any;
      let itemButtonFunction: any;
      const qp: any = {
        onDidTriggerButton: jest.fn().mockImplementation((cb) => {
          exitFunction = cb;
        }),
        onDidTriggerItemButton: jest.fn().mockImplementation((cb) => {
          itemButtonFunction = cb;
        }),
        onDidChangeActive: jest.fn(),
        onDidChangeSelection: jest.fn(),
        onDidHide: jest.fn().mockImplementation((cb) => {
          hideFunc = cb;
        }),
        dispose: jest.fn(),
        hide: jest.fn().mockImplementation(() => {
          hideFunc();
        }),
        show: jest.fn(),

        // convenience functions for mocking
        cancel: () => {
          const [backButton] = qp.buttons;
          exitFunction(backButton);
        },
        accept: (item: any) => {
          const [, acceptButton] = qp.buttons;
          qp.activeItems = [item];
          exitFunction(acceptButton);
        },
        triggerItemButton: (item: any, button: any) => {
          return itemButtonFunction({ item, button });
        },
      };
      return qp;
    };
    beforeEach(() => {
      mockQuickPick = createMockQuickPick();
      vscode.window.createQuickPick = jest.fn().mockReturnValue(mockQuickPick);
      (vscode.QuickInputButtons as jest.Mocked<any>) = { Back: {} };
      vscode.Uri.parse = jest.fn().mockReturnValue({ fsPath: 'test' });
      vscode.window.visibleTextEditors = [];
    });

    it('pop up a quick pick and returns a new runMode from selection', async () => {
      expect.hasAssertions();

      const runMode = new RunMode({ type: 'watch', runAllTestsOnStartup: true });
      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
      expect(mockQuickPick.show).toHaveBeenCalled();

      expect(mockQuickPick.items.length).toBe(3);
      expect(mockQuickPick.items.map((item) => item.label)).toEqual([
        expect.stringContaining('watch'),
        expect.stringContaining('on-save'),
        expect.stringContaining('on-demand'),
      ]);

      // the item matches the the current runMode should be active and its content should match the current runMode
      const current = mockQuickPick.items.find((item) => item.label.includes(runMode.config.type));
      expect(current.mode).toEqual(runMode.config);
      expect(current.description).toEqual(expect.stringContaining('current'));
      expect(mockQuickPick.activeItems).toEqual([current]);

      // select and accept the 'on-demand' mode
      const next = mockQuickPick.items.find((item) => item.label.includes('on-demand'));
      mockQuickPick.accept(next);

      expect(mockQuickPick.hide).toHaveBeenCalled();

      const newRunMode = await p;

      expect(newRunMode.config).toEqual(next.mode);
      expect(mockQuickPick.dispose).toHaveBeenCalled();
      expect(runMode).not.toBe(newRunMode);
      expect(newRunMode.isModified).toBe(true);
    });
    it('can quick toggle coverage and deferred', async () => {
      expect.hasAssertions();

      const runMode = new RunMode({ type: 'watch', coverage: true });

      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
      expect(mockQuickPick.show).toHaveBeenCalled();

      const current = mockQuickPick.items.find((item) => item.label.includes(runMode.config.type));
      expect(current.mode.coverage).toBe(true);
      expect(current.mode.deferred).toBeFalsy();

      const [coverageButton, deferredButton] = current.buttons;

      mockQuickPick.triggerItemButton(current, coverageButton);
      expect(current.mode.coverage).toBe(false);
      mockQuickPick.triggerItemButton(current, deferredButton);
      expect(current.mode.deferred).toBe(true);

      mockQuickPick.accept(current);

      const newRunMode = await p;

      expect(newRunMode.config).toEqual(current.mode);
      expect(mockQuickPick.dispose).toHaveBeenCalled();
      expect(runMode).not.toBe(newRunMode);
      expect(newRunMode.isModified).toBe(true);
    });
    it('can cancel quickPick without change runMode', async () => {
      expect.hasAssertions();

      const runMode = new RunMode({ type: 'watch', coverage: true });

      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
      expect(mockQuickPick.show).toHaveBeenCalled();

      mockQuickPick.cancel();
      const result = await p;
      expect(result).toBeUndefined();
    });
    describe('can open text editor to edit runMode', () => {
      let editSpy: any;
      let closeSpy: any;
      beforeEach(() => {
        editSpy = jest.spyOn(RunModeEditor.prototype, 'edit');
        closeSpy = jest.spyOn(RunModeEditor.prototype, 'close');
      });
      it('when content changed successfully', async () => {
        expect.hasAssertions();
        const runMode = new RunMode({ type: 'watch', coverage: true });
        const edited = { type: 'watch', coverage: false };
        editSpy.mockResolvedValueOnce(edited);

        const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
        expect(mockQuickPick.show).toHaveBeenCalled();
        const current = mockQuickPick.items.find((item) =>
          item.label.includes(runMode.config.type)
        );
        const [, , editButton] = current.buttons;
        await mockQuickPick.triggerItemButton(current, editButton);
        expect(editSpy).toHaveBeenCalled();

        mockQuickPick.accept(current);
        const newRunMode = await p;

        expect(newRunMode.config).toEqual(edited);
        expect(mockQuickPick.dispose).toHaveBeenCalled();
        expect(runMode).not.toBe(newRunMode);
        expect(newRunMode.isModified).toBe(true);
      });
      it('when content change is a pre-defined string', async () => {
        expect.hasAssertions();
        const runMode = new RunMode({ type: 'watch', coverage: true });
        const edited = 'deferred';
        editSpy.mockResolvedValueOnce(edited);

        const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
        expect(mockQuickPick.show).toHaveBeenCalled();
        const current = mockQuickPick.items.find((item) =>
          item.label.includes(runMode.config.type)
        );
        const [, , editButton] = current.buttons;
        await mockQuickPick.triggerItemButton(current, editButton);
        expect(editSpy).toHaveBeenCalled();

        // the "current" item should not have changed
        expect(current.mode.type).toBe(runMode.config.type);

        // the active item should be the "deferred" item
        const next = mockQuickPick.items.find((item) => item.label.includes('on-demand'));
        expect(next.mode.deferred).toEqual(true);
        expect(mockQuickPick.activeItems).toEqual([next]);

        mockQuickPick.accept(next);
        const newRunMode = await p;

        expect(newRunMode.config).toEqual(next.mode);
        expect(mockQuickPick.dispose).toHaveBeenCalled();
        expect(runMode).not.toBe(newRunMode);
        expect(newRunMode.isModified).toBe(true);
      });
      it('when user aborts the edit', async () => {
        expect.hasAssertions();
        const runMode = new RunMode({ type: 'watch', coverage: true });
        editSpy.mockResolvedValueOnce(undefined);

        const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
        expect(mockQuickPick.show).toHaveBeenCalled();
        const current = mockQuickPick.items.find((item) =>
          item.label.includes(runMode.config.type)
        );
        const [, , editButton] = current.buttons;
        await mockQuickPick.triggerItemButton(current, editButton);
        expect(editSpy).toHaveBeenCalled();

        mockQuickPick.accept(current);
        const newRunMode = await p;

        expect(newRunMode.config).toEqual(runMode.config);
        expect(mockQuickPick.dispose).toHaveBeenCalled();
        expect(runMode).not.toBe(newRunMode);
        expect(newRunMode.isModified).toBe(true);
      });
      it('when user abort the quick pick, the runMode editor should be closed as well', async () => {
        expect.hasAssertions();
        const runMode = new RunMode({ type: 'watch', coverage: true });
        editSpy.mockResolvedValueOnce(undefined);

        const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
        expect(mockQuickPick.show).toHaveBeenCalled();
        const current = mockQuickPick.items.find((item) =>
          item.label.includes(runMode.config.type)
        );
        const [, , editButton] = current.buttons;
        mockQuickPick.triggerItemButton(current, editButton);
        expect(editSpy).toHaveBeenCalled();

        mockQuickPick.cancel();
        const newRunMode = await p;

        expect(newRunMode).toBeUndefined();
        expect(closeSpy).toHaveBeenCalled();
        expect(mockQuickPick.dispose).toHaveBeenCalled();
        expect(runMode.isModified).toBe(false);
      });
    });
    it('can restore the original runMode', async () => {
      expect.hasAssertions();
      const original = new RunMode({ type: 'watch' });

      const runMode = new RunMode(original.config);
      runMode.toggleCoverage();

      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);
      expect(mockQuickPick.show).toHaveBeenCalled();

      expect(mockQuickPick.items.length).toBe(5);
      const restoreLabel = 'Restore original runMode';
      expect(mockQuickPick.items.map((item) => item.label)).toEqual([
        expect.stringContaining('watch'),
        expect.stringContaining('on-save'),
        expect.stringContaining('on-demand'),
        expect.anything(), // separator
        expect.stringContaining(restoreLabel),
      ]);

      // the item matches the the current runMode should be active and its content should match the current runMode
      const restoreItem = mockQuickPick.items.find((item) => item.label.includes(restoreLabel));
      expect(restoreItem.mode).toEqual(original.config);

      mockQuickPick.accept(restoreItem);

      expect(mockQuickPick.hide).toHaveBeenCalled();

      const newRunMode = await p;

      expect(newRunMode.config).toEqual(original.config);
      expect(mockQuickPick.dispose).toHaveBeenCalled();
      expect(runMode).not.toBe(newRunMode);
      expect(original).not.toBe(newRunMode);
      expect(newRunMode.isModified).toBe(false);
    });
    it('can disable the selection model and use active items exclusively', async () => {
      expect.hasAssertions();
      const runMode = new RunMode('watch');
      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);

      expect(mockQuickPick.show).toHaveBeenCalled();
      expect(mockQuickPick.selectedItems).toBeUndefined();

      // simulate clicking on the "on-save" item: change the selection
      const next = mockQuickPick.items.find((item) => item.label.includes('on-save'));
      const onSelect = mockQuickPick.onDidChangeSelection.mock.calls[0][0];
      onSelect([next]);

      // the selected items should still be empty
      expect(mockQuickPick.selectedItems).toEqual([]);

      mockQuickPick.cancel();
      await p;
    });
    it('can workaround issue microsoft/vscode#75005', async () => {
      expect.hasAssertions();
      const runMode = new RunMode('on-demand');
      const p = runMode.quickSwitch({ asAbsolutePath: jest.fn() } as any);

      const watchItem = mockQuickPick.items.find((item) => item.label.includes('watch'));
      const current = mockQuickPick.items.find((item) => item.label.includes(runMode.config.type));
      expect(mockQuickPick.activeItems).toEqual([current]);

      // toggle item button caused the quick pick to update its items, which then trigger the activeItems to be reset to the first item.
      // Even though we try to set the activeItems to the current item right away, it seems to be override by the quick pick reset action.
      // so the workaround is to force the activeItems to be the "actual" one for the next 2 onDidChangeActive events
      // this seems to be very hacky but it has been working since 2019. So let's hope it will continue to work.  :)

      const [coverageButton] = current.buttons;
      await mockQuickPick.triggerItemButton(current, coverageButton);

      const onDidChangeActive = mockQuickPick.onDidChangeActive.mock.calls[0][0];

      // 1st time: the activeItems should be override with the "actual" one
      mockQuickPick.activeItems = [watchItem];
      onDidChangeActive([watchItem]);
      expect(mockQuickPick.activeItems).toEqual([current]);

      // 2nd time: the activeItems should be override with the "actual" one
      mockQuickPick.activeItems = [watchItem];
      onDidChangeActive([watchItem]);
      expect(mockQuickPick.activeItems).toEqual([current]);

      // 3rd time and onwards should be back to normal operation
      mockQuickPick.activeItems = [watchItem];
      onDidChangeActive([watchItem]);
      expect(mockQuickPick.activeItems).toEqual([watchItem]);

      mockQuickPick.cancel();
      await p;
    });
  });
  it('can save runMode to settings.json', async () => {
    expect.hasAssertions();
    const runMode = new RunMode({ type: 'watch' });
    (updateSetting as jest.Mocked<any>) = jest.fn().mockResolvedValue(undefined);
    const ws: any = {};
    await runMode.save(ws);
    expect(updateSetting).toHaveBeenCalledWith(ws, 'runMode', runMode.config);
  });
});

describe('RunModeEditor', () => {
  let doc, editor;
  let onDidSaveTextDocument, onDidCloseTextDocument;
  const disposable = { dispose: jest.fn() };
  const schemaUri: any = { fsPath: 'schema' };
  const runModeFileUri: any = { toString: () => 'runMode.json' };

  beforeEach(() => {
    doc = {
      uri: runModeFileUri,
      lineAt: jest.fn().mockReturnValue({ range: { start: 0, end: 100 } }),
      save: jest.fn(),
      getText: jest.fn().mockReturnValue(''),
    };
    editor = { document: doc, edit: jest.fn() };
    vscode.window.showTextDocument = jest.fn().mockResolvedValue(editor);
    (vscode.workspace as jest.Mocked<any>) = {
      openTextDocument: jest.fn().mockResolvedValue(doc),
      onDidSaveTextDocument: jest.fn().mockImplementation((cb) => {
        onDidSaveTextDocument = cb;
        return disposable;
      }),
      onDidCloseTextDocument: jest.fn().mockImplementation((cb) => {
        onDidCloseTextDocument = cb;
        return disposable;
      }),
    };
    vscode.window.visibleTextEditors = [editor];
    vscode.languages.setTextDocumentLanguage = jest.fn().mockResolvedValue(undefined);
    vscode.Uri.parse = jest.fn().mockReturnValue(runModeFileUri);
  });
  it('can open the editor with the runMode content', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-save' });

    const runModeEditor = new RunModeEditor();
    const p = runModeEditor.edit(runMode.config, schemaUri);

    // Await a tick of the JavaScript event loop so that the promise is properly initialized.
    await new Promise((resolve) => setImmediate(resolve));

    // the editor should be opened with the runMode content
    const cb = editor.edit.mock.calls[0][0];
    const mockEditBuffer = { replace: jest.fn() };
    cb(mockEditBuffer);
    let content = mockEditBuffer.replace.mock.calls[0][1];
    // remove whitespace
    content = content.replace(/\s+/g, '');
    expect(content).toEqual(
      expect.stringContaining(`"jest.runMode":${JSON.stringify(runMode.config)}`)
    );

    // the doc should have jsonc languageId
    expect(vscode.languages.setTextDocumentLanguage).toHaveBeenCalledWith(doc, 'jsonc');

    // close without save - abort
    await onDidCloseTextDocument(doc);
    await expect(p).resolves.toBeUndefined();
  });
  it('can force close the editor', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-save' });

    const runModeEditor = new RunModeEditor();
    const p = runModeEditor.edit(runMode.config, schemaUri);

    // Await a tick of the JavaScript event loop so that the promise is properly initialized.
    await new Promise((resolve) => setImmediate(resolve));

    // force close the editor before the promise is resolved in edit()
    await runModeEditor.close();
    await expect(p).resolves.toBeUndefined();

    // a text editor should be presented
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.closeActiveEditor'
    );
  });
  it('edit with valid changes', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-save' });

    const runModeEditor = new RunModeEditor();
    const p = runModeEditor.edit(runMode.config, schemaUri);

    // Await a tick of the JavaScript event loop so that the promise is properly initialized.
    await new Promise((resolve) => setImmediate(resolve));

    // save the change
    const newConfig = { type: 'on-save', coverage: true, testFileOnly: true };
    doc.getText.mockReturnValueOnce(`{"jest.runMode": ${JSON.stringify(newConfig)}}`);
    await onDidSaveTextDocument(doc);

    await expect(p).resolves.toEqual(newConfig);
  });
  it('edit with invalid changes', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-save' });

    const runModeEditor = new RunModeEditor();
    const p = runModeEditor.edit(runMode.config, schemaUri);

    // Await a tick of the JavaScript event loop so that the promise is properly initialized.
    await new Promise((resolve) => setImmediate(resolve));

    // save the change
    const newConfig = { type: 'on-save', coverage: true, testFileOnly: true };
    doc.getText
      .mockReturnValueOnce('') // invalid json content
      .mockReturnValueOnce(`{"jest.runMode": ${JSON.stringify(newConfig)}}`);
    await onDidSaveTextDocument(doc);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();

    // save again with the valid json
    await onDidSaveTextDocument(doc);

    const edited = await p;
    expect(edited).toEqual(newConfig);
  });
  it('close editor without save', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-save' });

    const runModeEditor = new RunModeEditor();
    const p = runModeEditor.edit(runMode.config, schemaUri);

    // Await a tick of the JavaScript event loop so that the promise is properly initialized.
    await new Promise((resolve) => setImmediate(resolve));

    // close the doc without save
    await onDidCloseTextDocument(doc);

    await expect(p).resolves.toBeUndefined();
  });
});

describe('runModeDescription', () => {
  it.each`
    seq  | config                                                   | description
    ${1} | ${{ type: 'watch' }}                                     | ${{ type: RunModeIcons['watch'] }}
    ${2} | ${{ type: 'watch', coverage: true }}                     | ${{ type: RunModeIcons['watch'], coverage: RunModeIcons['coverage'] }}
    ${3} | ${{ type: 'on-demand', coverage: true, deferred: true }} | ${{ type: RunModeIcons['on-demand'], coverage: RunModeIcons['coverage'], deferred: RunModeIcons['deferred'] }}
    ${4} | ${{ type: 'on-save' }}                                   | ${{ type: RunModeIcons['on-save'] }}
    ${5} | ${{ type: 'on-save', testFileOnly: true }}               | ${{ type: RunModeIcons['on-save-test-file-only'] }}
  `('case $seq: returns the correct RunModeDescription', ({ config, description }) => {
    expect(runModeDescription(config)).toEqual(description);
  });
});
describe('typeIcon', () => {
  it.each`
    seq  | config                               | icon
    ${1} | ${{ type: 'watch' }}                 | ${RunModeIcons['watch']}
    ${2} | ${{ type: 'watch', coverage: true }} | ${RunModeIcons['watch']}
    ${3} | ${{ type: 'watch', deferred: true }} | ${RunModeIcons['deferred']}
  `('case $seq: returns the correct RunModeIcon', ({ config, icon }) => {
    expect(typeIcon(config)).toEqual(icon);
  });
});
