jest.unmock('../../src/setup-wizard/wizard-helper');
jest.unmock('../../src/setup-wizard/types');
jest.unmock('./test-helper');
jest.unmock('../test-helper');
jest.unmock('../../src/helpers');

const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

import * as vscode from 'vscode';

import * as path from 'path';
import * as os from 'os';

import {
  showActionMenu,
  showActionInputBox,
  getConfirmation,
  getWizardSettings,
  createSaveConfig,
  showActionMessage,
  validateCommandLine,
  selectWorkspaceFolder,
  validateRootPath,
} from '../../src/setup-wizard/wizard-helper';
import { ActionMessageType, WizardStatus } from '../../src/setup-wizard/types';
import { throwError } from './test-helper';
import { makeWorkspaceFolder } from '../test-helper';
import { createJestSettingGetter } from '../../src/Settings';

describe('QuickInput Proxy', () => {
  const mockOnDidTriggerButton = jest.fn();
  const triggerButton = async (button: any) => {
    const callBack = mockOnDidTriggerButton.mock.calls[0][0];
    await callBack(button);
  };
  const mockOnDidTriggerItemButton = jest.fn();
  const triggerItemButton = async (button: any) => {
    const callBack = mockOnDidTriggerItemButton.mock.calls[0][0];
    await callBack({ button });
  };

  const mockButton = (action?: () => Promise<WizardStatus>): any => ({
    iconPath: {},
    action: action || (() => Promise.resolve('success')),
  });

  describe('showActionMenu', () => {
    const mockShow = jest.fn();
    const mockDispose = jest.fn();
    let handleSelection;

    let mockQuickPick: any;

    const mockItem = (label: string, action: () => Promise<WizardStatus>): any => ({
      label,
      action,
    });
    const triggerSelection = async (selected: any) => {
      await handleSelection(Array.isArray(selected) ? selected : [selected]);
    };

    beforeEach(() => {
      jest.resetAllMocks();
      mockQuickPick = {
        show: mockShow,
        dispose: mockDispose,
        onDidChangeSelection: (callback) => {
          handleSelection = callback;
        },
        onDidTriggerButton: mockOnDidTriggerButton,
        onDidTriggerItemButton: mockOnDidTriggerItemButton,
      };
      vscode.window.createQuickPick = jest.fn().mockReturnValue(mockQuickPick);
    });
    it('manages an internal quickPick', async () => {
      expect.hasAssertions();

      const options = {
        title: 'a title',
        value: 'a value',
        placeholder: 'something',
        rightButtons: [mockButton()],
      };
      const items = [];
      const p = showActionMenu(items, options);
      expect(mockShow).toHaveBeenCalledTimes(1);
      await triggerSelection(mockItem('selected-item', () => Promise.resolve('success')));

      await p;

      expect(mockQuickPick.title).toEqual(options.title);
      expect(mockQuickPick.value).toEqual(options.value);
      expect(mockQuickPick.placeholder).toEqual(options.placeholder);
      expect(mockQuickPick.items).toBe(items);
      expect(mockQuickPick.buttons).toBe(options.rightButtons);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it.each`
      action                                           | expected
      ${() => Promise.resolve('success')}              | ${'success'}
      ${() => Promise.resolve({ value: 'an object' })} | ${{ value: 'an object' }}
      ${() => Promise.resolve(1)}                      | ${1}
      ${undefined}                                     | ${undefined}
    `('will return resolved action item: $expected', async ({ action, expected }) => {
      expect.hasAssertions();

      const p = showActionMenu([]);

      // trigger selection
      const item = mockItem('selected-item', action);
      await triggerSelection(item);
      const result = await p;

      expect(result).toEqual(expected);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it('can only select 1 item', async () => {
      expect.hasAssertions();

      const p = showActionMenu([]);

      // trigger incorrect selection
      const item1 = mockItem('selected-item-1', jest.fn());
      const item2 = mockItem('selected-item-2', jest.fn());
      await expect(triggerSelection([item1, item2])).rejects.toThrow();

      // trigger correct selection
      await triggerSelection([item1]);
      await p;
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it.each`
      action                                   | expected
      ${() => throwError('item throws')}       | ${new Error('item throws')}
      ${() => Promise.reject('item rejected')} | ${'item rejected'}
    `('reject when action returns $expected', async ({ action, expected }) => {
      expect.hasAssertions();

      const p = showActionMenu([]);

      // trigger selection
      await triggerSelection(mockItem('selected-item', action));
      await expect(p).rejects.toEqual(expected);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it.each`
      enableBackButton | expected
      ${true}          | ${undefined}
      ${false}         | ${'success'}
    `('can have a back button: $enableBackButton', async ({ enableBackButton, expected }) => {
      expect.hasAssertions();

      const p = showActionMenu([], { enableBackButton });

      if (enableBackButton) {
        expect(mockQuickPick.buttons).toEqual([vscode.QuickInputButtons.Back]);
        await triggerButton(vscode.QuickInputButtons.Back);
      } else {
        expect(mockQuickPick.buttons).toBeUndefined();
        await triggerSelection(mockItem('whatever', () => Promise.resolve(expected)));
      }

      const result = await p;

      expect(result).toEqual(expected);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    describe('can have action buttons', () => {
      it.each`
        action                              | expected
        ${() => Promise.resolve('success')} | ${'success'}
        ${() => Promise.resolve('abort')}   | ${'abort'}
      `('when button action resolved: $expected', async ({ action, expected }) => {
        expect.hasAssertions();

        const button = mockButton(action);
        const p = showActionMenu([], { rightButtons: [button] });

        expect(mockShow).toHaveBeenCalledTimes(1);
        await triggerButton(button);
        const result = await p;

        expect(result).toEqual(expected);
        expect(mockDispose).toHaveBeenCalledTimes(1);
      });
      it.each`
        action                              | expected
        ${() => throwError('throw error')}  | ${new Error('throw error')}
        ${() => Promise.reject('rejected')} | ${'rejected'}
      `('when button action failed: $expected', async ({ action, expected }) => {
        expect.hasAssertions();

        const button = mockButton(action);
        const p = showActionMenu([], { rightButtons: [button] });

        expect(mockShow).toHaveBeenCalledTimes(1);
        await triggerButton(button);
        await expect(p).rejects.toEqual(expected);
        expect(mockDispose).toHaveBeenCalledTimes(1);
      });
    });
    describe('allowNoAction', () => {
      it('no action button', async () => {
        expect.hasAssertions();

        const button1 = mockButton();
        const button2 = mockButton();
        button2.action = undefined;
        const items = [{ id: 1, label: 'item-1', buttons: [button1, button2] }];

        // without allowNoAction, throw exception
        let p = showActionMenu(items);
        await triggerItemButton(button2);
        await expect(p).resolves.toBeUndefined();

        mockOnDidTriggerItemButton.mockClear();

        // works with allowNoAction
        p = showActionMenu(items, { allowNoAction: true });
        // no ops
        await triggerItemButton(button2);
        // triggr button1 to exit
        await triggerItemButton(button1);

        await expect(p).resolves.toEqual('success');
      });
      it('no action item', async () => {
        expect.hasAssertions();

        const exitButton = mockButton();
        const item = { id: 1, label: 'item-1', buttons: [exitButton] };

        // without allowNoAction, throw exception
        let p = showActionMenu([item]);
        await triggerSelection(item);
        await expect(p).resolves.toBeUndefined();

        mockOnDidTriggerItemButton.mockClear();

        // works with allowNoAction
        p = showActionMenu([item], { allowNoAction: true });
        // no ops
        await triggerSelection(item);
        // triggr button1 to exit
        await triggerItemButton(exitButton);
        await expect(p).resolves.toEqual('success');
      });
    });

    it('can have item action button', async () => {
      expect.hasAssertions();

      const bAction = jest.fn().mockReturnValue('success');
      const button = mockButton(bAction);
      const items = [{ id: 1, label: 'item-1', buttons: [button] }];
      const p = showActionMenu(items, { allowNoAction: true });

      expect(mockShow).toHaveBeenCalledTimes(1);
      await triggerItemButton(button);
      const result = await p;

      expect(result).toEqual('success');
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it.each`
      selectItemIdx | isValidIndex
      ${undefined}  | ${false}
      ${-1}         | ${false}
      ${0}          | ${true}
      ${1}          | ${true}
      ${100}        | ${false}
    `(
      'can change quickPick selection programatically with $selectItemIdx => $isValidIndex',
      async ({ selectItemIdx, isValidIndex }) => {
        expect.hasAssertions();

        const items = [
          mockItem('item-1', () => Promise.resolve('success')),
          mockItem('item-2', () => Promise.resolve('abort')),
          mockItem('item-3', () => Promise.resolve('error')),
        ];
        const p = showActionMenu(items, { selectItemIdx });

        expect(mockShow).toHaveBeenCalledTimes(1);

        // exit the menu with the button that returns undefined
        await triggerButton(mockButton(() => Promise.resolve(undefined)));
        await p;

        expect(mockDispose).toHaveBeenCalledTimes(1);
        if (isValidIndex) {
          expect(mockQuickPick.selectedItems).toEqual([items[selectItemIdx]]);
        } else {
          expect(mockQuickPick.selectedItems).toBeUndefined();
        }
      }
    );
    describe('can be verbose', () => {
      let options;
      beforeEach(() => {
        console.log = jest.fn();
        options = {
          verbose: true,
          enableBackButton: true,
        };
      });
      it('logging which menu item is selected', async () => {
        expect.hasAssertions();

        const item = mockItem('item-1', () => Promise.resolve('success'));
        const p = showActionMenu([item], options);

        await triggerSelection(item);
        await expect(p).resolves.toEqual('success');

        expect(mockShow).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching('item-1'));
      });
      it('when back button is triggered', async () => {
        expect.hasAssertions();

        const item = mockItem('item-1', () => Promise.resolve('success'));
        const p = showActionMenu([item], options);

        await triggerButton(vscode.QuickInputButtons.Back);
        await expect(p).resolves.toEqual(undefined);

        expect(mockDispose).toHaveBeenCalledTimes(1);
      });
    });
  });
  describe('showActionInputBox', () => {
    const mockShow = jest.fn();
    const mockOnDidAccept = jest.fn();
    const mockOnDidHide = jest.fn();
    const mockDispose = jest.fn();
    let mockInputBox: any;

    const triggerInput = async (input?: string) => {
      mockInputBox.value = input;
      const callBack = (input ? mockOnDidAccept : mockOnDidHide).mock.calls[0][0];
      await callBack();
    };

    const options = {
      prompt: 'a title',
      value: 'initial vlaue',
      title: 'an inputBox',
      rightButtons: [mockButton()],
    };

    beforeEach(() => {
      jest.resetAllMocks();
      mockInputBox = {
        show: mockShow,
        dispose: mockDispose,
        onDidAccept: mockOnDidAccept,
        onDidHide: mockOnDidHide,
        onDidTriggerButton: mockOnDidTriggerButton,
      };
      vscode.window.createInputBox = jest.fn().mockReturnValue(mockInputBox);
    });
    it('returns input string', async () => {
      expect.hasAssertions();

      const inputValue = 'something';
      const p = showActionInputBox(options);

      expect(mockShow).toHaveBeenCalledTimes(1);
      await triggerInput(inputValue);
      const result = await p;
      expect(result).toEqual(inputValue);
      expect(mockInputBox.title).toEqual(options.title);
      expect(mockInputBox.prompt).toEqual(options.prompt);
      expect(mockInputBox.buttons).toEqual(options.rightButtons);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it('"escape" input returns undefined', async () => {
      expect.hasAssertions();

      const p = showActionInputBox(options);
      await triggerInput();
      const result = await p;

      expect(result).toBeUndefined();

      expect(mockShow).toHaveBeenCalledTimes(1);
      expect(mockInputBox.title).toEqual(options.title);
      expect(mockInputBox.prompt).toEqual(options.prompt);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it('hide after accept should have no impact', async () => {
      expect.hasAssertions();

      const inputValue = 'something2';
      const p = showActionInputBox(options);

      expect(mockShow).toHaveBeenCalledTimes(1);
      await triggerInput(inputValue);
      await triggerInput();

      const result = await p;
      expect(result).toEqual(inputValue);
      expect(mockInputBox.title).toEqual(options.title);
      expect(mockInputBox.prompt).toEqual(options.prompt);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    it.each`
      enableBackButton | expected
      ${true}          | ${undefined}
      ${false}         | ${'input string'}
    `('with back button: $enableBackButton', async ({ enableBackButton, expected }) => {
      expect.hasAssertions();

      const p = showActionInputBox({ ...options, rightButtons: undefined, enableBackButton });

      if (enableBackButton) {
        expect(mockInputBox.buttons).toEqual([vscode.QuickInputButtons.Back]);
        await triggerButton(vscode.QuickInputButtons.Back);
      } else {
        expect(mockInputBox.buttons).toEqual([]);
        await triggerInput(expected);
      }

      const result = await p;

      expect(result).toEqual(expected);
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
    describe('on button click', () => {
      it.each`
        action                              | expected
        ${() => Promise.resolve('success')} | ${'success'}
        ${() => Promise.resolve('abort')}   | ${'abort'}
      `('return resolved action result: $expected', async ({ action, expected }) => {
        expect.hasAssertions();

        const button = mockButton(action);
        const p = showActionInputBox({ ...options, rightButtons: [button] });
        await triggerButton(button);

        const result = await p;
        expect(mockShow).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expected);
        expect(mockDispose).toHaveBeenCalledTimes(1);
      });
      it.each`
        action                                    | expected
        ${() => Promise.reject('button rejects')} | ${'button rejects'}
        ${() => throwError('button throws')}      | ${new Error('button throws')}
      `('rejects if action failed: $expected', async ({ action, expected }) => {
        expect.hasAssertions();

        const button = mockButton(action);
        const p = showActionInputBox({ ...options, rightButtons: [button] });
        await triggerButton(button);

        await expect(p).rejects.toEqual(expected);
        expect(mockShow).toHaveBeenCalledTimes(1);
        expect(mockDispose).toHaveBeenCalledTimes(1);
      });
    });
    describe('can be verbose', () => {
      let verboseOptions;
      beforeEach(() => {
        console.log = jest.fn();
        verboseOptions = {
          prompt: 'a title',
          value: 'initial vlaue',
          title: 'an inputBox',
          verbose: true,
          enableBackButton: true,
        };
      });
      it('logging which user enters data', async () => {
        expect.hasAssertions();

        const p = showActionInputBox(verboseOptions);
        await triggerInput('some value');

        await expect(p).resolves.toEqual('some value');

        expect(mockShow).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching('some value'));
      });
      it('when back button is triggered', async () => {
        const p = showActionInputBox(verboseOptions);
        await triggerButton(vscode.QuickInputButtons.Back);

        await expect(p).resolves.toEqual(undefined);

        expect(mockShow).toHaveBeenCalledTimes(1);
      });
    });
  });
});
describe('showActionMessage', () => {
  const getShowMessageMock = (type: ActionMessageType): jest.Mocked<any> =>
    type === 'info'
      ? vscode.window.showInformationMessage
      : type === 'warning'
      ? vscode.window.showWarningMessage
      : vscode.window.showErrorMessage;

  beforeEach(() => {
    jest.resetAllMocks();
    vscode.window.showInformationMessage = jest.fn();
    vscode.window.showWarningMessage = jest.fn();
    vscode.window.showErrorMessage = jest.fn();
  });
  const mockItem = (title: string, action: () => any) => ({
    id: 0,
    title,
    action,
  });
  describe.each([['info'], ['warning'], ['error']])('showActionMessage type %s', (msgType: any) => {
    it.each`
      action                              | expected
      ${() => Promise.resolve('success')} | ${'success'}
      ${() => Promise.resolve(5)}         | ${5}
      ${() => Promise.resolve(true)}      | ${true}
    `('click on action-button returns $expected', async ({ action, expected }) => {
      expect.hasAssertions();
      const item = mockItem('item-1', action);
      const mock = getShowMessageMock(msgType);
      mock.mockReturnValueOnce(item);
      const result = await showActionMessage(msgType, 'a message', item);

      expect(result).toEqual(expected);
      expect(mock).toHaveBeenCalledTimes(1);
      const [message, { modal }, ...items] = mock.mock.calls[0];
      expect(message).toEqual('a message');
      expect(modal).toBeTruthy();
      expect(items).toEqual([item]);
    });
    it('returns undefined if user cancel', async () => {
      expect.hasAssertions();
      const mock = getShowMessageMock(msgType);
      mock.mockReturnValueOnce(undefined);

      const result = await showActionMessage(
        msgType,
        'a message',
        mockItem('button-1', () => Promise.resolve('success'))
      );
      expect(result).toBeUndefined();
    });
  });
  describe('getConfirmation', () => {
    it.each`
      yes        | no             | type         | onCancel
      ${'Yes'}   | ${'No'}        | ${'info'}    | ${'no'}
      ${'Yes'}   | ${'No'}        | ${'warning'} | ${'yes'}
      ${'Yes'}   | ${'No'}        | ${'error'}   | ${'no'}
      ${'To be'} | ${'Not to be'} | ${'info'}    | ${'yes'}
      ${'To be'} | ${'Not to be'} | ${'info'}    | ${'no'}
      ${'To be'} | ${'Not to be'} | ${'info'}    | ${'no'}
    `(
      'can get binary answer $yes/$no with $type panel onCancel=$onCancel',
      async ({ type, yes, no, onCancel }) => {
        expect.hasAssertions();
        let buttonIndex: number;
        const mock = getShowMessageMock(type);
        mock.mockImplementation((...args) => {
          const [message, { modal }, ...buttons] = args;
          expect(message).toEqual('get a confirmation');
          expect(modal).toBeTruthy();
          expect(buttons).toHaveLength(2);
          expect(buttons.map((b) => b.title)).toEqual([yes, no]);
          const onCancelIndex = onCancel === 'yes' ? 0 : 1;
          expect(buttons[onCancelIndex].isCloseAffordance).toBeTruthy();
          expect(buttons[1 - onCancelIndex].isCloseAffordance).toBeFalsy();

          return Promise.resolve(buttons[buttonIndex]);
        });
        buttonIndex = 0;
        await expect(
          getConfirmation(type, 'get a confirmation', yes, no, onCancel)
        ).resolves.toBeTruthy();
        buttonIndex = 1;
        await expect(
          getConfirmation(type, 'get a confirmation', yes, no, onCancel)
        ).resolves.not.toBeTruthy();
      }
    );
    it('escape is treated as no', async () => {
      expect.hasAssertions();
      const mock = getShowMessageMock('info');
      mock.mockImplementation(() => Promise.resolve());
      await expect(
        getConfirmation('info', 'get a confirmation', 'Absolutely', 'Nope', 'no')
      ).resolves.toBeFalsy();
      await expect(getConfirmation('info', 'get a confirmation')).resolves.toBeFalsy();
    });
  });
});

describe('validateCommandLine', () => {
  it.each`
    cmdLine                            | isValid
    ${''}                              | ${false}
    ${'npm test'}                      | ${false}
    ${'npm test --'}                   | ${true}
    ${'npm test -- --runInBand'}       | ${true}
    ${'npm test --runInBand --'}       | ${true}
    ${'yarn test'}                     | ${true}
    ${'yarn test --runInBand'}         | ${true}
    ${'whatever npm test --runInBand'} | ${true}
  `('npm without "--" is invalid', ({ cmdLine, isValid }) => {
    if (isValid) {
      expect(validateCommandLine(cmdLine)).toBeUndefined();
    } else {
      expect(validateCommandLine(cmdLine)).not.toBeUndefined();
    }
  });
});

const canRunTest = (isWin32: boolean) =>
  (isWin32 && os.platform() === 'win32') || (!isWin32 && os.platform() !== 'win32');

describe('getWizardSettings', () => {
  const workspace: any = {
    name: 'a workspace',
    uri: { fsPath: `${path.sep}workspace` },
  };
  let vscodeSettings: { [key: string]: any };
  const mockConfigGet = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    vscodeSettings = {};
    (createJestSettingGetter as jest.Mocked<any>).mockReturnValue(mockConfigGet);
    vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
      get: mockConfigGet,
    });
    mockConfigGet.mockImplementation((name) => vscodeSettings[name]);
  });
  it('extracted from vscode settings and launch config', () => {
    getWizardSettings(workspace);
    expect(createJestSettingGetter).toHaveBeenCalled();
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('launch', workspace.uri);
  });
  it.each`
    seq  | settings                                                 | expectedSettings
    ${1} | ${{}}                                                    | ${{}}
    ${5} | ${{ jestCommandLine: ' ' }}                              | ${{}}
    ${6} | ${{ jestCommandLine: 'jest' }}                           | ${{ jestCommandLine: 'jest' }}
    ${7} | ${{ jestCommandLine: '"../dir with space" --whatever' }} | ${{ jestCommandLine: '"../dir with space" --whatever' }}
    ${8} | ${{ configurations: [] }}                                | ${{ configurations: [] }}
    ${9} | ${{ configurations: undefined }}                         | ${{}}
  `('extract settings - $seq', ({ settings, expectedSettings }) => {
    vscodeSettings = settings;
    expect(getWizardSettings(workspace)).toEqual(expectedSettings);
  });
  it.each`
    isWin32  | rootPath                      | absoluteRootPath
    ${false} | ${undefined}                  | ${undefined}
    ${false} | ${'../parent'}                | ${'/parent'}
    ${false} | ${'/root'}                    | ${'/root'}
    ${false} | ${'"/root with space/dir"'}   | ${'/root with space/dir'}
    ${false} | ${'dir with space/tests'}     | ${'/workspace/dir with space/tests'}
    ${true}  | ${undefined}                  | ${undefined}
    ${true}  | ${'..\\parent'}               | ${'\\parent'}
    ${true}  | ${'\\root'}                   | ${'\\root'}
    ${true}  | ${'"\\root with space\\dir"'} | ${'\\root with space\\dir'}
    ${true}  | ${'dir with space\\tests'}    | ${'\\workspace\\dir with space\\tests'}
  `(
    'compute absoluteRootPath: $rootPath => $absoluteRootPath',
    ({ isWin32, rootPath, absoluteRootPath }) => {
      if (!canRunTest(isWin32)) {
        return;
      }
      vscodeSettings['rootPath'] = rootPath;
      expect(getWizardSettings(workspace)).toEqual({ rootPath, absoluteRootPath });
    }
  );
});

describe('createSaveConfig', () => {
  const context: any = {
    message: jest.fn(),
    workspace: { uri: {} },
  };
  const mockUpdate = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    vscode.workspace.getConfiguration = jest.fn().mockReturnValue({ update: mockUpdate });
  });
  it('always save with full config name and workspace scope', async () => {
    expect.hasAssertions();
    mockUpdate.mockReturnValueOnce(Promise.resolve());
    const saveConfig = createSaveConfig(context);
    const entry = { name: 'jest.jestCommandLine', value: 'whatever' };
    await saveConfig(entry);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      entry.name,
      entry.value,
      vscode.ConfigurationTarget.WorkspaceFolder
    );
  });
  it('can save multiple entries', async () => {
    expect.hasAssertions();
    mockUpdate.mockReturnValue(Promise.resolve());
    const saveConfig = createSaveConfig(context);
    const entry1 = { name: 'jest.jestCommandLine', value: 'x' };
    const entry2 = { name: 'launch.configurations', value: [1, 2, 3] };
    await saveConfig(entry1, entry2);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      entry1.name,
      entry1.value,
      vscode.ConfigurationTarget.WorkspaceFolder
    );
    expect(mockUpdate).toHaveBeenNthCalledWith(
      2,
      entry2.name,
      entry2.value,
      vscode.ConfigurationTarget.WorkspaceFolder
    );
  });
  it('will save to workspace target if no workspace is given', async () => {
    expect.hasAssertions();
    mockUpdate.mockReturnValue(Promise.resolve());
    context.workspace = undefined;
    const saveConfig = createSaveConfig(context);
    const entry = { name: 'jest.disabledWorkspaceFolders', value: '[]' };
    await saveConfig(entry);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      entry.name,
      entry.value,
      vscode.ConfigurationTarget.Workspace
    );
  });
  it('when save failed, throws error', async () => {
    expect.hasAssertions();
    mockUpdate
      .mockReturnValueOnce(Promise.resolve())
      .mockReturnValueOnce(Promise.reject('failed'))
      .mockReturnValueOnce(Promise.resolve());
    const saveConfig = createSaveConfig(context);
    const entry1 = { name: 'entry-1', value: '1' };
    const entry2 = { name: 'entry-2', value: [1, 2, 3] };
    const entry3 = { name: 'entry-3', value: 42 };
    await expect(saveConfig(entry1, entry2, entry3)).rejects.toEqual('failed');

    expect(mockUpdate).toHaveBeenCalledTimes(3);
  });
});

describe('selectWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it.each`
    desc                    | workspaceFolders                                              | callCount
    ${'single-workspace'}   | ${[makeWorkspaceFolder('single-root')]}                       | ${0}
    ${'multiple-workspace'} | ${[makeWorkspaceFolder('ws-1'), makeWorkspaceFolder('ws-2')]} | ${1}
    ${'no-workspace'}       | ${undefined}                                                  | ${0}
  `('will only prompt to picker if multi-root: $desc', async ({ workspaceFolders, callCount }) => {
    expect.hasAssertions();
    (vscode.workspace as any).workspaceFolders = workspaceFolders;
    (vscode.window.showQuickPick as jest.Mocked<any>).mockResolvedValueOnce(undefined);
    await selectWorkspaceFolder();
    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(callCount);
  });
});

describe('validateRootPath', () => {
  const workspace = makeWorkspaceFolder('ws1');
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it.each`
    case | rootPath              | expectedPath
    ${1} | ${'sub-folder'}       | ${path.resolve(workspace.uri.fsPath, 'sub-folder')}
    ${2} | ${'"sub folder"'}     | ${path.resolve(workspace.uri.fsPath, 'sub folder')}
    ${3} | ${'/root/sub-folder'} | ${'/root/sub-folder'}
    ${4} | ${''}                 | ${workspace.uri.fsPath}
  `('case $case', ({ rootPath, expectedPath }) => {
    validateRootPath(workspace, rootPath);
    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });
});
