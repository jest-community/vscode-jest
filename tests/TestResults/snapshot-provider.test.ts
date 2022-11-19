jest.unmock('../../src/TestResults/snapshot-provider');

import * as vscode from 'vscode';
import { SnapshotProvider } from '../../src/TestResults/snapshot-provider';

const mockSnapshot = {
  parse: jest.fn(),
  getSnapshotContent: jest.fn(),
};
jest.mock('jest-editor-support', () => {
  const Snapshot = jest.fn(() => mockSnapshot);
  return { Snapshot };
});

const makeSnapshotNode = (name: string): any => ({
  node: { name },
});
describe('SnapshotProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('parse', () => {
    it.each`
      keyword                                 | isInline
      ${'toMatchSnapshot'}                    | ${false}
      ${'toThrowErrorMatchingSnapshot'}       | ${false}
      ${'toMatchInlineSnapshot'}              | ${true}
      ${'toThrowErrorMatchingInlineSnapshot'} | ${true}
    `('returns parsed result: $keyword', ({ keyword, isInline }) => {
      const parseBlocks = [makeSnapshotNode(keyword)];
      mockSnapshot.parse.mockReturnValue(parseBlocks);
      const provider = new SnapshotProvider();
      expect(provider.parse('a test file')).toEqual({
        testPath: 'a test file',
        blocks: [{ ...parseBlocks[0], isInline }],
      });
    });
    it('if parse failed, returns empty blocks', () => {
      mockSnapshot.parse.mockImplementation(() => {
        throw new Error('forced error');
      });
      const provider = new SnapshotProvider();
      expect(provider.parse('a test file')).toEqual({
        testPath: 'a test file',
        blocks: [],
      });
    });
  });
  describe('getSnapshotContent', () => {
    it.each`
      case | impl                                  | expected
      ${1} | ${() => Promise.resolve('something')} | ${'something'}
      ${2} | ${() => Promise.resolve()}            | ${undefined}
      ${3} | ${() => Promise.reject('error')}      | ${'throws'}
    `('$case: forward call to Snapshot', async ({ impl, expected }) => {
      mockSnapshot.getSnapshotContent.mockImplementation(impl);
      const provider = new SnapshotProvider();
      if (expected === 'throws') {
        await expect(provider.getContent('whatever', 'whatever')).rejects.toEqual('error');
      } else {
        await expect(provider.getContent('whatever', 'whatever')).resolves.toEqual(expected);
      }
    });
  });
  describe('previewSnapshot', () => {
    it('display content in a WebviewPanel', async () => {
      const content1 = '<test 1> result';
      const content2 = '<test 2> "some quoted text"';
      const content3 = "<test 3> 'single quote' & this";
      mockSnapshot.getSnapshotContent
        .mockReturnValueOnce(Promise.resolve(content1))
        .mockReturnValueOnce(Promise.resolve(content2))
        .mockReturnValueOnce(Promise.resolve(content3));
      const mockPanel = {
        reveal: jest.fn(),
        onDidDispose: jest.fn(),
        webview: { html: undefined },
        title: undefined,
      };
      (vscode.window.createWebviewPanel as jest.Mocked<any>).mockReturnValue(mockPanel);

      const provider = new SnapshotProvider();
      await provider.previewSnapshot('test-file', 'some test');
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.onDidDispose).toHaveBeenCalled();
      expect(mockPanel.webview.html).toMatchInlineSnapshot(`"<pre>&lt;test 1&gt; result</pre>"`);
      expect(mockPanel.title).toEqual(expect.stringContaining('some test'));

      //2nd time showing the content will reuse the panel
      (vscode.window.createWebviewPanel as jest.Mocked<any>).mockClear();
      await provider.previewSnapshot('test-file', 'some other test');
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(0);
      expect(mockPanel.webview.html).toMatchInlineSnapshot(
        `"<pre>&lt;test 2&gt; &quot;some quoted text&quot;</pre>"`
      );
      expect(mockPanel.title).toEqual(expect.stringContaining('some other test'));

      //if user close the panel, it will be recreated on the next request
      const callback = mockPanel.onDidDispose.mock.calls[0][0];
      callback();
      await provider.previewSnapshot('test-file', '3rd test');
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.webview.html).toMatchInlineSnapshot(
        `"<pre>&lt;test 3&gt; &#39;single quote&#39; &amp; this</pre>"`
      );
      expect(mockPanel.title).toEqual(expect.stringContaining('3rd test'));
    });
    it('show warning if no content is found', async () => {
      mockSnapshot.getSnapshotContent.mockReturnValueOnce(undefined);
      const provider = new SnapshotProvider();
      await provider.previewSnapshot('test-file', 'some test');
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });
  });
});
