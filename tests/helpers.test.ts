jest.unmock('../src/helpers')
jest.unmock('../src/Settings')

const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

const mockPlatform = jest.fn()
jest.mock('os', () => ({ platform: mockPlatform }))

const mockJoin = jest.fn()
const mockNormalize = jest.fn()
jest.mock('path', () => ({
  join: mockJoin,
  normalize: mockNormalize,
}))

import { isCreateReactAppTestCommand, pathToJest, pathToJestPackageJSON } from '../src/helpers'
import * as path from 'path'

describe('ModuleHelpers', () => {
  describe('pathToJestPackageJSON', () => {
    const defaultPathToJest = null
    const defaultSettings: any = {
      pathToJest: defaultPathToJest,
      rootPath: '',
    }

    beforeEach(() => {
      mockJoin.mockImplementation(require.requireActual('path').join)
      mockNormalize.mockImplementation(require.requireActual('path').normalize)
    })

    it('should return null when not found', () => {
      mockExistsSync.mockReturnValue(false)

      expect(pathToJestPackageJSON(defaultSettings)).toBe(null)
    })

    describe('pathToJest: <default>', () => {
      // tslint:disable no-shadowed-variable
      describe('rootPath: <default>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('node_modules', 'jest', 'package.json')
          mockExistsSync.mockImplementation(path => path === expected)

          expect(pathToJestPackageJSON(defaultSettings)).toBe(expected)
        })

        it('should return package.json when React Scripts are installed as a dependency', () => {
          const expected = path.join('node_modules', 'react-scripts', 'node_modules', 'jest', 'package.json')
          mockExistsSync.mockImplementation(path => path === expected)

          expect(pathToJestPackageJSON(defaultSettings)).toBe(expected)
        })
      })

      describe('rootPath: <string>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('..', '..', 'node_modules', 'jest', 'package.json')
          mockExistsSync.mockImplementation(path => path === expected)

          const workspace: any = {
            pathToJest: defaultPathToJest,
            rootPath: path.join('..', '..'),
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })

        it('should return package.json when Jest-cli is installed as a dependency', () => {
          const expected = path.join('..', '..', 'node_modules', 'jest-cli', 'package.json')
          mockExistsSync.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: path.join('..', '..'),
            pathToJest: defaultPathToJest,
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })

        it('should return package.json when React Scripts are installed as a dependency', () => {
          const expected = path.join(
            '..',
            '..',
            'node_modules',
            'react-scripts',
            'node_modules',
            'jest',
            'package.json'
          )
          mockExistsSync.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: path.join('..', '..'),
            pathToJest: '',
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })
      })
    })

    describe('pathToJest: npm test --', () => {
      it('will not find package.json', () => {
        const expected = null
        mockExistsSync.mockImplementation(path => path === expected)

        const workspace: any = {
          rootPath: '',
          pathToJest: 'npm test --',
        }
        expect(pathToJestPackageJSON(workspace)).toBe(null)
      })
    })

    describe(`pathToJest: ${path.join('"test scripts"', 'test')}`, () => {
      it('will not find package.json', () => {
        const expected = path.join('"test scripts"', 'test')
        mockExistsSync.mockImplementation(path => path === expected)

        const workspace: any = {
          rootPath: '',
          pathToJest: expected,
        }
        expect(pathToJestPackageJSON(workspace)).toBe(null)
      })
    })
  })

  describe('isCreateReactAppTestCommand', () => {
    it('should return true for CRA', () => {
      expect(isCreateReactAppTestCommand('react-scripts test --env=jsdom')).toBe(true)
    })

    it('should return false for other scripts', () => {
      expect(isCreateReactAppTestCommand('custom-script')).toBe(false)
    })
  })

  describe('pathToJest', () => {
    const defaultSettings: any = {
      pathToJest: null,
      rootPath: '',
    }

    it('returns "npm test --" when bootstrapped with create-react-app', () => {
      mockReadFileSync.mockReturnValueOnce(
        JSON.stringify({
          scripts: {
            test: 'react-scripts test',
          },
        })
      )

      expect(pathToJest(defaultSettings)).toBe('npm test --')
    })

    it('returns the normalized "pathToJest" setting when set by the user', () => {
      const expected = {}
      mockNormalize.mockReturnValueOnce(expected)

      const settings: any = {
        pathToJest: expected,
        rootPath: '',
      }

      expect(pathToJest(settings)).toBe(expected)
      expect(mockNormalize).toBeCalledWith(settings.pathToJest)
    })

    it('defaults to "node_modules/.bin/jest" when Jest is locally installed', () => {
      const expected = 'node_modules/.bin/jest'

      mockJoin.mockImplementation(require.requireActual('path').posix.join)
      mockPlatform.mockReturnValue('linux')
      mockNormalize.mockImplementationOnce(arg => arg)
      mockExistsSync.mockImplementation(path => path === expected)

      expect(pathToJest(defaultSettings)).toBe(expected)
    })

    it('defaults to "jest" when Jest is locally installed', () => {
      const expected = 'jest'

      mockJoin.mockImplementation(require.requireActual('path').posix.join)
      mockPlatform.mockReturnValue('linux')
      mockNormalize.mockImplementationOnce(arg => arg)
      mockExistsSync.mockImplementation(_ => false)

      expect(pathToJest(defaultSettings)).toBe(expected)
    })
  })
})
