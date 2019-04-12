jest.unmock('../src/StatusBar')
jest.useFakeTimers()

const statusBarItem = {
  text: '',
  command: '',
  show: jest.fn(),
}

jest.mock('vscode', () => ({
  window: {
    createStatusBarItem: () => statusBarItem,
  },
  StatusBarAlignment: {},
}))

jest.mock('elegant-spinner', () => () => jest.fn())

import { StatusBar } from '../src/StatusBar'

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

  describe('registerCommand()', () => {
    it('should set statusBarItem command', () => {
      statusBar.registerCommand('testCommand')
      expect(statusBarItem.command).toBe('testCommand')
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
      // first instance failed, display it
      statusBar.bind('testSource1').failed()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource1', status: 'failed' })

      // then second is running, this status is more important then previous
      statusBar.bind('testSource2').running()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource2', status: 'running' })

      // second is ok, display first instance fail as it is more important
      statusBar.bind('testSource2').success()
      expect(renderSpy).toHaveBeenLastCalledWith({ source: 'testSource1', status: 'failed' })
    })
  })

  describe('render()', () => {
    it('should update statusBarItem.text', () => {
      ;(statusBar as any).render({ source: 'testSource1', status: 'initial' })
      expect(statusBarItem.text).toBe('Jest: ... ')
    })
  })
})
