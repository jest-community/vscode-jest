jest.unmock('../../src/Coverage/CoverageMapProvider')

import { CoverageMapProvider } from '../../src/Coverage/CoverageMapProvider'
import { createCoverageMap } from 'istanbul-lib-coverage'
import { createSourceMapStore } from 'istanbul-lib-source-maps'

describe('CoverageMapProvider', () => {
  describe('constructor()', () => {
    it('should initialize the coverage map', () => {
      const expected: any = {}
      ;(createCoverageMap as jest.Mock<any>).mockReturnValueOnce(expected)
      const sut = new CoverageMapProvider()

      expect(sut.map).toBe(expected)
    })
  })

  describe('map', () => {
    it('should return the coverage map', () => {
      ;(createCoverageMap as jest.Mock<any>).mockImplementation(map => map)
      createSourceMapStore.mockReturnValueOnce({
        transformCoverage: map => ({ map }),
      })

      const expected: any = {}
      const sut = new CoverageMapProvider()
      sut.update(expected)

      expect(sut.map).toBe(expected)
    })

    it('should be a read-only property', () => {
      const sut = new CoverageMapProvider()

      // @ts-ignore: Writing to readonly property
      expect(() => (sut.map = {} as any)).toThrow(TypeError)
    })
  })

  describe('update()', () => {
    it('should transform the coverage map', () => {
      const expected: any = {}
      ;(createCoverageMap as jest.Mock<any>).mockImplementation(map => map)
      const transformCoverage = jest.fn().mockImplementationOnce(map => ({ map }))
      createSourceMapStore.mockReturnValueOnce({ transformCoverage })

      const sut = new CoverageMapProvider()
      sut.update(expected)

      expect(transformCoverage).toBeCalledWith(expected)
    })

    it('should store the transformed coverage map', () => {
      const expected: any = {}

      createSourceMapStore.mockReturnValueOnce({
        transformCoverage: () => ({ map: expected }),
      })

      const sut = new CoverageMapProvider()
      sut.update(expected)

      expect(sut.map).toBe(expected)
    })
  })

  describe('getFileCoverage()', () => {
    it('should return the file coverage if found', () => {
      const filePath = 'file.js'
      const expected: any = {}

      createSourceMapStore.mockReturnValueOnce({
        transformCoverage: () => ({
          map: {
            data: {
              [filePath]: expected,
            },
          },
        }),
      })

      const sut = new CoverageMapProvider()
      sut.update(undefined)

      expect(sut.getFileCoverage(filePath)).toBe(expected)
    })

    it('should return nothing when the file path is not found', () => {
      ;(createCoverageMap as jest.Mock<any>).mockReturnValueOnce({
        data: {},
      })
      const sut = new CoverageMapProvider()

      expect(sut.getFileCoverage('unknown')).toBeUndefined()
    })
  })
})
