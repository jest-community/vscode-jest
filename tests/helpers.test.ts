jest.unmock('../src/helpers')
jest.mock('fs')

import { pathToJestPackageJSON, isCRATestCommand, pathToJest } from '../src/helpers'
import { existsSync, readFileSync } from 'fs'
import * as path from 'path'

const existsMock = existsSync as jest.Mock<boolean>
const readFileMock = readFileSync as jest.Mock<string>

describe('ModuleHelpers', () => {
  describe('pathToJest', () => {
    it('should return the set value', () => {
      const workspace: any = {
        pathToJest: 'abcd',
      }
      expect(pathToJest(workspace)).toBe(workspace.pathToJest)
    })

    it('should recognize CRA apps', () => {
      readFileMock.mockReturnValueOnce('{"scripts":{"test":"react-scripts test"}}')

      const workspace: any = {
        rootPath: '',
        pathToJest: '',
      }
      expect(pathToJest(workspace)).toBe('npm test --')
    })

    it('should default to `node_modules/.bin/jest`', () => {
      readFileMock.mockReturnValueOnce('{}')
      existsMock.mockReturnValueOnce(true)

      const defaultPath = path.normalize('node_modules/.bin/jest')
      const workspace: any = {
        rootPath: '',
        pathToJest: '',
      }
      expect(pathToJest(workspace)).toBe(defaultPath)
    })

    it('should fallback to `jest` if everything other fails', () => {
      readFileMock.mockReturnValueOnce('{}')
      existsMock.mockReturnValueOnce(false)

      const workspace: any = {
        rootPath: '',
        pathToJest: '',
      }
      expect(pathToJest(workspace)).toBe('jest')
    })
  })

  describe('pathToJestPackageJSON', () => {
    it('should return null when not found', () => {
      existsMock.mockReturnValueOnce(false).mockReturnValueOnce(false)

      const workspace: any = {
        rootPath: '',
        pathToJest: '',
      }
      expect(pathToJestPackageJSON(workspace)).toBe(null)
    })

    describe('pathToJest: <default>', () => {
      describe('rootPath: <default>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('node_modules', 'jest', 'package.json')
          existsMock.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: '',
            pathToJest: '',
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })

        it('should return package.json when React Scripts are installed as a dependency', () => {
          const expected = path.join('node_modules', 'react-scripts', 'node_modules', 'jest', 'package.json')
          existsMock.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: '',
            pathToJest: '',
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })
      })

      describe('rootPath: <string>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('..', '..', 'node_modules', 'jest', 'package.json')
          existsMock.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: path.join('..', '..'),
            pathToJest: '',
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })

        it('should return package.json when Jest-cli is installed as a dependency', () => {
          const expected = path.join('..', '..', 'node_modules', 'jest-cli', 'package.json')
          existsMock.mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: path.join('..', '..'),
            pathToJest: '',
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
          existsMock.mockImplementation(path => path === expected)

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
        existsMock.mockImplementation(path => path === expected)

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
        existsMock.mockImplementation(path => path === expected)

        const workspace: any = {
          rootPath: '',
          pathToJest: expected,
        }
        expect(pathToJestPackageJSON(workspace)).toBe(null)
      })
    })
  })

  describe('isCRATestCommand', () => {
    it('should return true for CRA', () => {
      expect(isCRATestCommand('react-scripts test --env=jsdom')).toBeTruthy()
    })
    it('should return false for other scripts', () => {
      expect(isCRATestCommand('custom-script')).toBeFalsy()
    })
  })
})
