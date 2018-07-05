jest.unmock('events')
jest.unmock('../src/messaging')

import * as messaging from '../src/messaging'
import { window, commands, Uri } from 'vscode'

describe('test system messaging', () => {
  const mockShowErrorMessage = window.showErrorMessage as jest.Mock<any>
  const mockShowWarningMessage = window.showWarningMessage as jest.Mock<any>
  const mockExecCommands = commands.executeCommand as jest.Mock<any>
  const mockUriParse = Uri.parse as jest.Mock<any>

  beforeEach(() => {
    jest.resetAllMocks()
  })
  it('can show system message without actions', () => {
    const validate = (mockF: jest.Mock<any>) => {
      expect(mockF.mock.calls.length).toBe(1)
      const args = mockF.mock.calls[0]
      expect(args.length).toBe(1)
      expect(args[0]).toBe('an error')
    }

    messaging.systemWarningMessage('an error')
    validate(mockShowWarningMessage)

    messaging.systemErrorMessage('an error')
    validate(mockShowErrorMessage)
  })

  it('can show system message with actions', () => {
    const action1: messaging.MessageAction = { title: 'action1', action: () => {} }
    const action2: messaging.MessageAction = { title: 'action2', action: () => {} }

    const validate = (mockF: jest.Mock<any>) => {
      expect(mockF.mock.calls.length).toBe(1)
      const args = mockF.mock.calls[0]
      expect(args.length).toBe(3)
      expect(args[0]).toBe('an error')
      expect(args[1]).toBe('action1')
      expect(args[2]).toBe('action2')
    }

    messaging.systemWarningMessage('an error', action1, action2)
    validate(mockShowWarningMessage)

    messaging.systemErrorMessage('an error', action1, action2)
    validate(mockShowErrorMessage)
  })
  it('can open troubleshooting url via action', () => {
    messaging.showTroubleshootingAction.action()
    expect(mockExecCommands.mock.calls.length).toBe(1)
    expect(mockUriParse.mock.calls[0][0]).toBe(messaging.TroubleShootingURL)
  })
})
