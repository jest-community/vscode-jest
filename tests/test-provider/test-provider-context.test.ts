import '../manual-mocks';

jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('./test-helper');

import * as vscode from 'vscode';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';

describe('JestTestProviderContext', () => {
  it('when try to getTag not in any profiles, throw error', () => {
    const whatever: any = {};
    const profile: any = { tag: { id: 'run' } };
    const context = new JestTestProviderContext(whatever, whatever, [profile]);
    expect(context.getTag('run')).toEqual(profile.tag);
    expect(() => context.getTag('debug')).toThrow();
  });
  describe('requestFrom', () => {
    let context: JestTestProviderContext;
    let mockCollection;

    const makeCollection = (items: any[]) => {
      const collection: any = {
        items: items ?? [],
        get: (id) => collection.items.find((i) => i.id === id),
        forEach: (callback) => {
          collection.items.forEach(callback);
        },
      };
      return collection;
    };
    const makeItem = (id: string, children?: any[]) => ({ id, children: makeCollection(children) });

    beforeEach(() => {
      jest.resetAllMocks();

      (vscode.TestRunRequest as jest.Mocked<any>) = jest.fn((include, exclude, profile) => ({
        include,
        exclude,
        profile,
      }));

      const item1 = makeItem('id1', [makeItem('id1-1'), makeItem('id1-2')]);
      const item2 = makeItem('id2');
      mockCollection = makeCollection([item1, item2]);

      const controller: any = { items: mockCollection };
      const profiles: any[] = [{ label: 'test' }];
      context = new JestTestProviderContext({} as any, controller, profiles);
    });

    it('should return a new request with included items found in the controller', () => {
      const item1 = makeItem('id1-2');
      const item2 = makeItem('id2');

      const request: any = { include: [item1, item2], profile: { label: 'test' } };
      const newRequest = context.requestFrom(request);
      expect(newRequest.include?.map((i) => i.id)).toEqual(['id1-2', 'id2']);
      expect(newRequest.exclude).toBeUndefined();
      expect(newRequest.profile.label).toBe('test');
      expect(newRequest).not.toBe(request);
    });

    it('should throw an error if an included item is not found in the controller', () => {
      const item1 = makeItem('id3');

      const request: any = { include: [item1], profile: { label: 'test' } };
      expect(() => context.requestFrom(request)).toThrow('failed to find item');
    });

    it('should return a new request with excluded items found in the controller', () => {
      const item1 = makeItem('id1');
      const item2 = makeItem('id1-2');

      const request: any = { include: [item1], exclude: [item2], profile: { label: 'test' } };
      const newRequest = context.requestFrom(request);
      expect(newRequest.include?.map((i) => i.id)).toEqual(['id1']);
      expect(newRequest.exclude?.map((i) => i.id)).toEqual(['id1-2']);
      expect(newRequest.profile.label).toBe('test');
      expect(newRequest).not.toBe(request);
    });

    it('should throw an error if an excluded item is not found in the controller', () => {
      const item1 = makeItem('id1');
      const item2 = makeItem('id1-3');

      const request: any = { include: [item1], exclude: [item2], profile: { label: 'test' } };
      expect(() => context.requestFrom(request)).toThrow('failed to find item');
    });

    it('should throw an error if the profile is not found in the context', () => {
      const item1 = makeItem('id1');

      const request: any = { include: [item1], profile: { label: 'new-profile' } };
      expect(() => context.requestFrom(request)).toThrow('failed to find profile');
    });
  });
});
