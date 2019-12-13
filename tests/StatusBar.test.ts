jest.unmock('../src/StatusBar')
jest.useFakeTimers()

const newStatusBarItem = () => ({
  text: '',
  command: '',
  show: jest.fn(),
  hide: jest.fn(),
  tooltip: '',
})

const statusBarItem = newStatusBarItem()

jest.mock('elegant-spinner', () => () => jest.fn())

import * as vscode from 'vscode'
import { StatusBar, StatusType, Status } from '../src/StatusBar'

const createStatusBarItem = jest.fn().mockReturnValue(statusBarItem)

const mockedChannel = { append: () => {}, clear: () => {} } as any
vscode.window.createOutputChannel = jest.fn(() => mockedChannel)
;((vscode.window.createStatusBarItem as unknown) as jest.Mock<{}>) = createStatusBarItem

describe('StatusBar', () => {
  let statusBar: StatusBar
  const updateStatusSpy = jest.spyOn(StatusBar.prototype as any, 'updateStatus')
  const renderSpy = jest.spyOn(StatusBar.prototype as any, 'render')
  beforeEach(() => {
    statusBar = new StatusBar()
    updateStatusSpy.mockClear()
    renderSpy.mockClear()
    statusBarItem.text = ''
  })

  const assertRender = (nth: number, request: any, type: StatusType) => {
    const n = nth < 0 ? renderSpy.mock.calls.length - 1 : nth
    const args = renderSpy.mock.calls[n]

    expect(args[0]).toEqual(request)
    expect((args[1] as any).type).toEqual(type)
  }

  describe('register', () => {
    it('should add 2 commands', () => {
      statusBar.register(() => undefined)
      expect(vscode.commands.registerCommand).toBeCalledTimes(2)

      const registerCommand = (vscode.commands.registerCommand as unknown) as jest.Mock<{}>
      const calls = registerCommand.mock.calls
      expect(calls.some(c => c[0].includes('show-summary-output'))).toBe(true)
      expect(calls.some(c => c[0].includes('show-active-output'))).toBe(true)
    })
  })

  describe('bind()', () => {
    it('returns binded helpers', () => {
      const source = 'testSource'
      const helpers = statusBar.bind(source)
      ;['initial', 'running', 'success', 'failed', 'stopped'].forEach(status => {
        helpers.update(status as Status)
        expect(updateStatusSpy).toHaveBeenCalledWith({ source, status })
      })
    })
  })

  describe('request()', () => {
    it('should update status', () => {
      statusBar.bind('testSource1').update('initial')

      expect(updateStatusSpy).toHaveBeenCalled()
    })
  })

  describe('updateStatus()', () => {
    it('should pick most relevant status', () => {
      // first instance failed, display it as folder status
      statusBar.bind('testSource1').update('failed')
      assertRender(0, { source: 'testSource1', status: 'failed' }, StatusType.active)

      // then second is running, this status is more important then previous, will display as workspace status
      statusBar.bind('testSource2').update('running')
      assertRender(1, { source: 'testSource2', status: 'running' }, StatusType.summary)

      // second is ok, display first instance fail as it is more important, will display as workspace status
      statusBar.bind('testSource2').update('success')
      assertRender(2, { source: 'testSource1', status: 'failed' }, StatusType.summary)
    })
    it('can display modes', () => {
      // first instance failed, display it as folder status
      statusBar.bind('testSource1').update('failed', 'some reason', ['watch', 'coverage'])
      expect(statusBarItem.text).toEqual('Jest: $(alert) some reason $(eye) $(color-mode)')

      statusBar.bind('testSource1').update('success', undefined, ['watch'])
      expect(statusBarItem.text).toEqual('Jest: $(check) $(eye)')
    })
  })

  describe('multiroot status', () => {
    const statusBarItem2 = newStatusBarItem()
    const editor: any = {
      document: { uri: 'whatever' },
    }
    const getStatusBarItems = () => {
      if (statusBarItem.tooltip.includes('summary')) {
        return { active: statusBarItem2, summary: statusBarItem }
      }
      return { active: statusBarItem, summary: statusBarItem2 }
    }
    const getWorkspaceFolder = jest.fn()
    ;((vscode.workspace.getWorkspaceFolder as unknown) as jest.Mock<{}>) = getWorkspaceFolder

    beforeEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      createStatusBarItem.mockReturnValueOnce(statusBarItem).mockReturnValueOnce(statusBarItem2)
      statusBar = new StatusBar()
      statusBarItem.text = ''
      statusBarItem2.text = ''
    })
    it('create 2 statusBarItem', () => {
      expect(createStatusBarItem).toBeCalledTimes(2)
    })
    it('only update active status for single root', () => {
      statusBar.bind('testSource').update('initial')
      const { active, summary } = getStatusBarItems()
      expect(active.text).toEqual('Jest: ...')
      expect(summary.text).toEqual('')
    })
    it('update both status for multiroot', () => {
      const { active, summary } = getStatusBarItems()

      statusBar.bind('testSource1').update('initial')
      expect(active.show).toBeCalledTimes(1)
      expect(active.text).toEqual('Jest: ...')

      statusBar.bind('testSource2').update('initial')
      expect(summary.show).toBeCalledTimes(1)
      expect(summary.text).toEqual('Jest-WS: ...')

      // without active folder, the active status will be hidden in multiroot
      expect(active.hide).toBeCalledTimes(1)
    })
    it('can show active status from active editor', () => {
      const { active } = getStatusBarItems()

      statusBar.bind('testSource1').update('initial')
      statusBar.bind('testSource2').update('initial')

      // without active folder, the active status will be hidden in multiroot
      expect(active.show).toBeCalledTimes(1)
      expect(active.hide).toBeCalledTimes(1)

      getWorkspaceFolder.mockReturnValue({ name: 'testSource1' })
      statusBar.onDidChangeActiveTextEditor(editor)

      expect(active.show).toBeCalledTimes(2)
      expect(active.hide).toBeCalledTimes(1)
    })
    it('can animate both running status', () => {
      getWorkspaceFolder.mockReturnValue({ name: 'testSource1' })
      statusBar.onDidChangeActiveTextEditor(editor)

      statusBar.bind('testSource1').update('running')
      statusBar.bind('testSource2').update('running')

      expect(renderSpy).toHaveBeenCalledTimes(2)

      const calls: any[][] = renderSpy.mock.calls
      expect(calls.every(c => c[0].status === 'running')).toBe(true)
      expect(calls.some(c => c[1].type === StatusType.active)).toBe(true)
      expect(calls.some(c => c[1].type !== StatusType.active)).toBe(true)
    })
    it('when hiding status, spinner should be stopped too', () => {
      const { active, summary } = getStatusBarItems()

      // sending 2 request without activeFolder should disable the active status
      statusBar.bind('testSource1').update('running')
      expect(active.show).toBeCalledTimes(1)
      expect(summary.show).toBeCalledTimes(0)

      jest.clearAllMocks()
      jest.clearAllTimers()

      statusBar.bind('testSource2').update('initial')
      expect(active.show).toBeCalledTimes(0)
      expect(summary.show).toBeCalledTimes(1)

      expect(active.hide).toBeCalledTimes(1)
    })
  })
})
