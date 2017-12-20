jest.unmock('../../src/DebugCodeLens/DebugCodeLens')
jest.mock('vscode', () => ({
  CodeLens: class {
    constructor() {}
  },
}))

import { DebugCodeLens } from '../../src/DebugCodeLens/DebugCodeLens'
import * as vscode from 'vscode'

describe('DebugCodeLens', () => {
  const range = {} as any
  const fileName = 'file.js'
  const testName = 'should specify the test file name'
  const sut = new DebugCodeLens(range, fileName, testName)

  it('should extend vscode.CodeLens', () => {
    expect(sut).toBeInstanceOf(vscode.CodeLens)
  })

  it('should specify the file name', () => {
    expect(sut.fileName).toBe(fileName)
  })

  it('should specify the test name', () => {
    expect(sut.testName).toBe(testName)
  })
})
