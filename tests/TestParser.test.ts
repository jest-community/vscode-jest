jest.unmock('../src/TestParser')

import { getParser, parseTest } from '../src/TestParser'
import { parse as parseTypeScript } from 'jest-test-typescript-parser'
import { parse as parseJavaScript } from 'jest-editor-support'

describe('getParser()', () => {
  it('should return the TypeScript parser if the file ends with ".ts"', () => {
    expect(getParser('file.ts')).toBe(parseTypeScript)
  })

  it('should return the TypeScript parser if the file ends with ".tsx"', () => {
    expect(getParser('file.tsx')).toBe(parseTypeScript)
  })

  it('should return the JavaScript parser if the file is not TypeScript', () => {
    expect(getParser('file.js')).toBe(parseJavaScript)
  })
})

describe('parseTest()', () => {
  it('should return the parsed TypeScript', () => {
    const filePath = 'file.ts'
    const expected = {} as any
    ;(parseTypeScript as jest.Mock<Function>).mockImplementationOnce(() => expected)
    expect(parseTest(filePath)).toBe(expected)

    expect(parseTypeScript).toBeCalledWith(filePath)
  })

  it('should return the parsed JavaScript', () => {
    const filePath = 'file.js'
    const expected = {} as any
    ;(parseJavaScript as jest.Mock<Function>).mockImplementationOnce(() => expected)
    expect(parseTest(filePath)).toBe(expected)

    expect(parseJavaScript).toBeCalledWith(filePath)
  })
})
