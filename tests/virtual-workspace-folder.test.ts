jest.unmock('../src/virtual-workspace-folder');
jest.unmock('./test-helper');

import * as vscode from 'vscode';
import * as path from 'path';
import {
  VirtualWorkspaceFolder,
  isVirtualWorkspaceFolder,
  VirtualFolderBasedCache,
} from '../src/virtual-workspace-folder';
import { makeWorkspaceFolder, makeUri } from './test-helper';

describe('VirtualWorkspaceFolder', () => {
  const workspaceFolder = makeWorkspaceFolder(path.join(__dirname, 'my-workspace'));
  const vFolderName = 'v1';
  const vFolderRootPath = path.join('packages', 'v1'); // a relative path
  let virtualFolder;
  beforeEach(() => {
    jest.resetAllMocks();
    vscode.Uri.joinPath = jest
      .fn()
      .mockImplementation((uri, p) => ({ fsPath: path.join(uri.fsPath, p) }));
    vscode.Uri.file = jest.fn().mockImplementation((f) => ({ fsPath: f }));
    virtualFolder = new VirtualWorkspaceFolder(workspaceFolder, vFolderName, vFolderRootPath);
  });

  it('should have the correct name', () => {
    expect(virtualFolder.name).toEqual(vFolderName);
  });

  it('should have the correct uri', () => {
    expect(virtualFolder.uri.fsPath).toEqual(
      path.join(workspaceFolder.uri.fsPath, vFolderRootPath)
    );
  });

  it('can take both absolute or relative rootPath', () => {
    //make an absolute path
    const rootPath = path.join(workspaceFolder.uri.fsPath, 'packages', 'v1');
    const folder2 = new VirtualWorkspaceFolder(workspaceFolder, vFolderName, rootPath);
    expect(folder2.uri.fsPath).toEqual(virtualFolder.uri.fsPath);
  });
  it('if no rootPath is given, the uri is the same as the actual workspace folder', () => {
    const folder2 = new VirtualWorkspaceFolder(workspaceFolder, vFolderName);
    expect(folder2.uri.fsPath).toEqual(workspaceFolder.uri.fsPath);
  });
  it('should have the same index as the actual workspace folder', () => {
    workspaceFolder.index = 1;
    expect(virtualFolder.index).toEqual(workspaceFolder.index);
  });

  describe('should correctly determine if a uri is in the workspace', () => {
    it.each`
      case | pathComps                                | expected
      ${1} | ${['packages', 'v1', 'src', 'index.ts']} | ${true}
      ${2} | ${['packages', 'v2', 'src', 'index.ts']} | ${false}
      ${3} | ${['src', 'index.ts']}                   | ${false}
    `('case $case: can determine if a uri is in the workspace', ({ pathComps, expected }) => {
      const uri = makeUri(workspaceFolder.uri.fsPath, ...pathComps);
      expect(virtualFolder.isInWorkspace(uri)).toBe(expected);
    });
  });
  it('isVirtualWorkspaceFolder can determine if a workspace folder is virtual', () => {
    expect(isVirtualWorkspaceFolder(virtualFolder)).toBe(true);
    expect(isVirtualWorkspaceFolder(workspaceFolder)).toBe(false);
  });
});

const makeCacheItem = (workspaceFolder: vscode.WorkspaceFolder): any => ({ workspaceFolder });
type CacheItem = ReturnType<typeof makeCacheItem>;

describe('VirtualFolderBasedCache', () => {
  let cache: VirtualFolderBasedCache<CacheItem>;

  beforeEach(() => {
    cache = new VirtualFolderBasedCache();
  });

  it('can add, get and delete items by folder name', () => {
    const item = makeCacheItem(makeWorkspaceFolder('folder1'));
    cache.addItem(item);
    expect(cache.getItemByFolderName('folder1')).toBe(item);
    expect(cache.size).toBe(1);

    cache.deleteItemByFolder(item.workspaceFolder);
    expect(cache.size).toBe(0);
    expect(cache.getItemByFolderName('folder1')).toBeUndefined();
    expect(cache.getItemsByActualFolderName('folder1')).toBeUndefined();
  });
  it('adding existing item will replace the old one', () => {
    const item = makeCacheItem(makeWorkspaceFolder('folder1'));
    cache.addItem(item);
    expect(cache.getItemByFolderName('folder1')).toBe(item);
    expect(cache.size).toBe(1);

    const item2 = makeCacheItem(makeWorkspaceFolder('folder1'));
    cache.addItem(item2);
    expect(cache.getItemByFolderName('folder1')).toBe(item2);
    expect(cache.size).toBe(1);
  });

  describe('with virtual folders', () => {
    let item1, item2, item3;
    beforeEach(() => {
      item1 = makeCacheItem(makeWorkspaceFolder('folder1'));
      item2 = makeCacheItem(new VirtualWorkspaceFolder(item1.workspaceFolder, 'folder2'));
      item3 = makeCacheItem(new VirtualWorkspaceFolder(item1.workspaceFolder, 'folder3'));
    });

    it('can retrieve items by actual folder name', () => {
      cache.addItem(item1);
      cache.addItem(item2);
      cache.addItem(item3);
      expect(cache.size).toBe(3);

      expect(cache.getItemsByActualFolderName('folder1')).toEqual([item1, item2, item3]);
      expect(cache.getItemByFolderName('folder1')).toBe(item1);
      expect(cache.getItemByFolderName('folder2')).toBe(item2);
      expect(cache.getItemByFolderName('folder3')).toBe(item3);
    });
    it('can retrieve items by actual folder name, even if the actualFolder is not in cache', () => {
      cache.addItem(item2);
      cache.addItem(item3);
      expect(cache.size).toBe(2);

      expect(cache.getItemsByActualFolderName('folder1')).toEqual([item2, item3]);
      expect(cache.getItemByFolderName('folder1')).toBeUndefined();
      expect(cache.getItemByFolderName('folder2')).toBe(item2);
      expect(cache.getItemByFolderName('folder3')).toBe(item3);
    });

    it('deletiing the virtual folder item will also remove the byActualFolderName entry', () => {
      cache.addItem(item2);
      cache.addItem(item3);
      expect(cache.size).toBe(2);

      expect(cache.getItemsByActualFolderName('folder1')).toEqual([item2, item3]);
      cache.deleteItemByFolder(item2.workspaceFolder);
      expect(cache.getItemsByActualFolderName('folder1')).toEqual([item3]);
      expect(cache.getItemByFolderName('folder2')).toBeUndefined();
    });
    it('can delete items by atualFolder', () => {
      cache.addItem(item2);
      cache.addItem(item3);
      expect(cache.getItemByFolderName('folder2')).toBe(item2);
      expect(cache.getItemByFolderName('folder3')).toBe(item3);
      expect(cache.size).toBe(2);

      cache.deleteItemByFolder(item1.workspaceFolder);
      expect(cache.getItemByFolderName('folder2')).toBeUndefined();
      expect(cache.getItemByFolderName('folder3')).toBeUndefined();
      expect(cache.size).toBe(0);
    });
  });

  it('can reset the cache', () => {
    const item = makeCacheItem(makeWorkspaceFolder('folder1'));
    cache.addItem(item);
    cache.reset();
    expect(cache.size).toBe(0);
  });
  it('can return all cached items', () => {
    const item1 = makeCacheItem(makeWorkspaceFolder('folder1'));
    const item2 = makeCacheItem(new VirtualWorkspaceFolder(item1.workspaceFolder, 'folder2'));
    const item3 = makeCacheItem(new VirtualWorkspaceFolder(item1.workspaceFolder, 'folder3'));
    cache.addItem(item1);
    cache.addItem(item2);
    cache.addItem(item3);
    expect(cache.getAllItems()).toEqual([item1, item2, item3]);
  });
});
