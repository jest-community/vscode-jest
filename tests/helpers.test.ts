jest.unmock('../src/helpers')
jest.mock('fs')

import { pathToJestPackageJSON } from '../src/helpers'
import { existsSync } from 'fs'
import * as path from 'path'

const defaultPathToJest = 'node_modules/.bin/jest'

describe('ModuleHelpers', () => {
  describe('pathToJestPackageJSON', () => {
    it('should return null when not found', () => {
      ;(existsSync as jest.Mock<boolean>).mockReturnValueOnce(false).mockReturnValueOnce(false)

      const workspace: any = {
        rootPath: '',
        pathToJest: defaultPathToJest,
      }
      expect(pathToJestPackageJSON(workspace)).toBe(null)
    })

    describe('pathToJest: <default>', () => {
      describe('rootPath: <default>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('node_modules', 'jest', 'package.json')
          ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: '',
            pathToJest: defaultPathToJest,
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })

        it('should return package.json when React Scripts are installed as a dependency', () => {
          const expected = path.join('node_modules', 'react-scripts', 'node_modules', 'jest', 'package.json')
          ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

          const workspace: any = {
            rootPath: '',
            pathToJest: defaultPathToJest,
          }
          expect(pathToJestPackageJSON(workspace)).toBe(expected)
        })
      })

      describe('rootPath: <string>', () => {
        it('should return package.json when Jest is installed as a dependency', () => {
          const expected = path.join('..', '..', 'node_modules', 'jest', 'package.json')
          ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

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
          ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

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
        ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

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
        ;(existsSync as jest.Mock<boolean>).mockImplementation(path => path === expected)

        const workspace: any = {
          rootPath: '',
          pathToJest: expected,
        }
        expect(pathToJestPackageJSON(workspace)).toBe(null)
      })
    })
  })
})
