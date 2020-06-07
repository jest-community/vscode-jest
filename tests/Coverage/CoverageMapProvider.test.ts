jest.unmock('../../src/Coverage/CoverageMapProvider');

import { CoverageMapProvider } from '../../src/Coverage/CoverageMapProvider';
import { createCoverageMap } from 'istanbul-lib-coverage';
import { createSourceMapStore } from 'istanbul-lib-source-maps';

const createSourceMapStoreMock = createSourceMapStore as jest.Mock<any>;
const createCoverageMapMock = createCoverageMap as jest.Mock<any>;
describe('CoverageMapProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe('constructor()', () => {
    it('should initialize the coverage map', () => {
      const expected: any = {};
      (createCoverageMap as jest.Mock<any>).mockReturnValueOnce(expected);
      const sut = new CoverageMapProvider();

      expect(sut.map).toBe(expected);
    });
  });

  describe('map', () => {
    it('should return the coverage map', async () => {
      expect.hasAssertions();

      createCoverageMapMock.mockImplementation((map) => map);
      createSourceMapStoreMock.mockReturnValueOnce({
        transformCoverage: (map) => Promise.resolve(map),
      });

      const expected: any = {};
      const sut = new CoverageMapProvider();
      await sut.update(expected);

      expect(sut.map).toBe(expected);
    });

    it('should be a read-only property', () => {
      const sut = new CoverageMapProvider();

      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore: Writing to readonly property
      expect(() => (sut.map = {} as any)).toThrow(TypeError);
    });
  });

  describe('update()', () => {
    it('should transform the coverage map', async () => {
      expect.hasAssertions();

      const expected: any = {};
      (createCoverageMap as jest.Mock<any>).mockImplementation((map) => map);
      const transformCoverage = jest.fn().mockImplementationOnce((map) => ({ map }));
      createSourceMapStoreMock.mockReturnValueOnce({ transformCoverage });

      const sut = new CoverageMapProvider();
      await sut.update(expected);

      expect(transformCoverage).toBeCalledWith(expected);
    });

    it('should store the transformed coverage map', async () => {
      const expected: any = {};

      createSourceMapStoreMock.mockReturnValueOnce({
        transformCoverage: () => Promise.resolve(expected),
      });

      const sut = new CoverageMapProvider();
      await sut.update(expected);

      expect(sut.map).toBe(expected);
    });
    it('can preserve the previous maps', async () => {
      expect.hasAssertions();

      const createTestMap = (mapName: string, fileNames: string[]) => ({
        files: () => fileNames,
        fileCoverageFor: (name: string) => ({ name, from: mapName }),
      });

      const map1: any = createTestMap('map1', ['f1', 'f2']);
      const map2: any = createTestMap('map2', ['f1', 'f3']);
      createCoverageMapMock.mockImplementation((m) => m || { data: {} });

      createSourceMapStoreMock.mockReturnValue({
        transformCoverage: (m) => Promise.resolve(m),
      });

      const sut = new CoverageMapProvider();
      await sut.update(map1);
      await sut.update(map2);

      // expect f2 is override by map2, while the f1 and f3 remains in the map as expected.
      expect(sut.getFileCoverage('f1')).toEqual({ name: 'f1', from: 'map2' });
      expect(sut.getFileCoverage('f2')).toEqual({ name: 'f2', from: 'map1' });
      expect(sut.getFileCoverage('f3')).toEqual({ name: 'f3', from: 'map2' });
    });
  });

  describe('getFileCoverage()', () => {
    it('should return the file coverage if found', async () => {
      expect.hasAssertions();
      const filePath = 'file.js';
      const expected: any = {};

      createSourceMapStoreMock.mockReturnValueOnce({
        transformCoverage: () =>
          Promise.resolve({
            data: {
              [filePath]: expected,
            },
          }),
      });

      const sut = new CoverageMapProvider();
      await sut.update(undefined);

      expect(sut.getFileCoverage(filePath)).toBe(expected);
    });

    it('should return nothing when the file path is not found', () => {
      createCoverageMapMock.mockReturnValueOnce({
        data: {},
      });
      const sut = new CoverageMapProvider();

      expect(sut.getFileCoverage('unknown')).toBeUndefined();
    });
  });
  describe('onVisibilityChange', () => {
    it('visibility = false => the internal maps and store will be reset', () => {
      const sut = new CoverageMapProvider();
      expect(createCoverageMapMock).toBeCalledTimes(1);
      expect(createSourceMapStoreMock).toBeCalledTimes(1);

      sut.onVisibilityChanged(false);
      expect(createCoverageMapMock).toBeCalledTimes(2);
      expect(createSourceMapStoreMock).toBeCalledTimes(2);
    });
    it('visibility = true => no-op', () => {
      const sut = new CoverageMapProvider();
      jest.clearAllMocks();

      sut.onVisibilityChanged(true);
      expect(createCoverageMapMock).toBeCalledTimes(0);
      expect(createSourceMapStoreMock).toBeCalledTimes(0);
    });
  });
});
