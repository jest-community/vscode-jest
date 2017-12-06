jest.unmock('../../src/Coverage')
jest.unmock('../../src/Coverage/overlay')
jest.mock('vscode', () => {
  const vscode = require.requireActual('vscode')
  vscode.commands = {
    registerCommand: jest.fn(),
  }
  return vscode
})

import { registerToggleCoverageOverlay, isVisible, toggleCoverageOverlay } from '../../src/Coverage'
import * as vscode from 'vscode'
import { extensionName } from '../../src/appGlobals'

describe('Code Coverage', () => {
  describe('registerToggleCoverageOverlay', () => {
    it('should register the command', () => {
      registerToggleCoverageOverlay()
      expect(vscode.commands.registerCommand).toBeCalledWith(`${extensionName}.coverage.toggle`, toggleCoverageOverlay)
    })

    it('should set the code coverage visibility to false by default', () => {
      registerToggleCoverageOverlay()
      expect(isVisible()).toBe(false)
    })

    it('should set the code coverage visibility when provided', () => {
      registerToggleCoverageOverlay(true)
      expect(isVisible()).toBe(true)
    })
  })
})
