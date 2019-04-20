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
import { StatusBar } from '../src/StatusBar'

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

  describe('register', () => {
    it('should add 2 commands', () => {
      statusBar.register(() => undefined)
      expect(vscode.commands.registerCommand).toBeCalledTimes(2)

      const registerCommand = (vscode.commands.registerCommand as unknown) as jest.Mock<{}>
      let found = 0
      registerCommand.mock.calls.forEach(c => {
        // tslint:disable no-bitwise
        if (c[0].includes('show-summary-output')) {
          found |= 0x1
        }
        if (c[0].includes('show-active-output')) {
          found |= 0x2
        }
      })
      expect(found).toEqual(3)
    })
  })

  describe('bind()', () => {
    it('returns binded helpers', () => {
      const source = 'testSource'
      const helpers = statusBar.bind(source)
      ;['initial', 'running', 'success', 'failed', 'stopped'].forEach(status => {
        helpers[status]()
        expect((statusBar as any).queue).toContainEqual({ source, status })
      })
    })
  })

  describe('enqueue()', () => {
    it('should unshift queue with new item', () => {
      statusBar.bind('testSource1').initial()
      statusBar.bind('testSource2').initial()

      expect((statusBar as any).queue[0]).toEqual({ source: 'testSource2', status: 'initial' })
    })

    it('should filter all previous items in queue with same source', () => {
      statusBar.bind('testSource1').initial()
      statusBar.bind('testSource1').running()

      expect((statusBar as any).queue).not.toContainEqual({ source: 'testSource1', status: 'initial' })
    })

    it('should update status', () => {
      statusBar.bind('testSource1').initial()

      expect(updateStatusSpy).toHaveBeenCalled()
    })
  })

  describe('updateStatus()', () => {
    it('should pick most relevant status', () => {
      // first instance failed, display it as folder status
      statusBar.bind('testSource1').failed()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource1', status: 'failed' }, 0)

      // then second is running, this status is more important then previous, will display as workspace status
      statusBar.bind('testSource2').running()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource2', status: 'running' }, 1)

      // second is ok, display first instance fail as it is more important, will display as workspace status
      statusBar.bind('testSource2').success()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource1', status: 'failed' }, 1)
    })
  })

  describe('render()', () => {
    it('should update statusBarItem.text', () => {
      ;(statusBar as any).render({ source: 'testSource1', status: 'initial' }, 0)
      expect(statusBarItem.text).toBe('Jest: ... ')
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
      statusBar.bind('testSource').initial()
      const { active, summary } = getStatusBarItems()
      expect(active.text).toEqual('Jest: ... ')
      expect(summary.text).toEqual('')
    })
    it('update both status for multiroot', () => {
      const { active, summary } = getStatusBarItems()

      statusBar.bind('testSource1').initial()
      expect(active.show).toBeCalledTimes(1)
      expect(active.text).toEqual('Jest: ... ')

      statusBar.bind('testSource2').initial()
      expect(summary.show).toBeCalledTimes(1)
      expect(summary.text).toEqual('Jest-WS: ...')

      // without active folder, the active status will be hidden in multiroot
      expect(active.hide).toBeCalledTimes(1)
    })
    it('can show active status from active editor', () => {
      const { active } = getStatusBarItems()

      statusBar.bind('testSource1').initial()
      statusBar.bind('testSource2').initial()

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

      statusBar.bind('testSource1').running()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource1', status: 'running' }, 0)
      statusBar.bind('testSource2').running()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource2', status: 'running' }, 1)

      expect(renderSpy).toHaveBeenCalledTimes(2)

      renderSpy.mockClear()

      jest.advanceTimersByTime(150)

      expect(renderSpy).toHaveBeenCalledTimes(2)
      renderSpy.mock.calls.forEach((c: any) => {
        expect(c[0].status).toEqual('running')
        if (c[0].source === 'testSource1') {
          expect(c[1]).toEqual(0)
        } else {
          expect(c[1]).toEqual(1)
        }
      })
    })
  })
})
