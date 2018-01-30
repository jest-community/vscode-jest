jest.unmock('../../src/JestProcessManagement/JestProcess')

import { Runner, ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from '../../src/JestProcessManagement/JestProcess'
import { EventEmitter } from 'events'

describe('JestProcess', () => {
  let projectWorkspaceMock
  let jestProcess
  const runnerMock = (Runner as any) as jest.Mock<any>
  let runnerMockImplementation
  let eventEmitter

  beforeEach(() => {
    jest.clearAllMocks()
    projectWorkspaceMock = new ProjectWorkspace(null, null, null, null)
    runnerMockImplementation = {
      on: jest.fn(() => this),
      start: jest.fn(),
    }
  })

  describe('when creating', () => {
    beforeEach(() => {
      runnerMock.mockImplementation(() => runnerMockImplementation)
    })

    it('accepts a project workspace argument', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      expect(jestProcess).not.toBe(null)
    })

    it('accepts watchMode boolean argument', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: true,
      })
      expect(jestProcess).not.toBe(null)
    })

    it('records watchMode in the watchMode property', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: true,
      })
      expect(jestProcess.watchMode).toBe(true)
    })

    it('creates an instance of jest-editor-support runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      expect(runnerMock.mock.instances.length).toBe(1)
    })

    it('passes the workspace argument to the jest-editor-support Runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      expect(runnerMock.mock.calls[0][0]).toBe(projectWorkspaceMock)
    })

    it('starts the jest-editor-support runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      expect(runnerMockImplementation.start).toHaveBeenCalledTimes(1)
    })

    it('passes the watchMode argument == false to the start command when it is not provided', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      expect(runnerMockImplementation.start.mock.calls[0][0]).toBe(false)
    })

    it('passes the watchMode argument == false to the start command when it is false', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: false,
      })
      expect(runnerMockImplementation.start.mock.calls[0][0]).toBe(false)
    })

    it('passes the watchMode argument == true to the start command when it is true', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: true,
      })
      expect(runnerMockImplementation.start.mock.calls[0][0]).toBe(true)
    })
  })

  describe('when jest-editor-support runner exits', () => {
    let onExit

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      runnerMockImplementation = {
        ...runnerMockImplementation,
        on: (event, callback) => {
          eventEmitter.on(event, callback)
        },
      }
      runnerMock.mockImplementation(() => runnerMockImplementation)
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      onExit = jest.fn()
      jestProcess.onExit(onExit)
    })

    it('calls the callback provided to onExit', () => {
      eventEmitter.emit('debuggerProcessExit')

      expect(onExit).toHaveBeenCalledTimes(1)
    })

    it('calls the callback with the argument being the instance of the jest process', () => {
      eventEmitter.emit('debuggerProcessExit')

      expect(onExit.mock.calls[0][0]).toBe(jestProcess)
    })

    it('only responds to first debuggerProcessExit event from the runner', () => {
      eventEmitter.emit('debuggerProcessExit')
      eventEmitter.emit('debuggerProcessExit')

      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  describe('when subscribing to regular jest-editor-support events', () => {
    let eventHandler
    const jestEditorSupportedEvent = 'jest-editor-supported-event'

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      runnerMockImplementation = {
        ...runnerMockImplementation,
        on: (event, callback) => {
          eventEmitter.on(event, callback)
        },
      }
      runnerMock.mockImplementation(() => runnerMockImplementation)
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
      eventHandler = jest.fn()
    })

    it('simply forwards the events to event emitter', () => {
      jestProcess.onJestEditorSupportEvent(jestEditorSupportedEvent, eventHandler)
      eventEmitter.emit(jestEditorSupportedEvent)

      expect(eventHandler).toHaveBeenCalledTimes(1)
    })

    it('forwards any argument to the provider event handler', () => {
      jestProcess.onJestEditorSupportEvent(jestEditorSupportedEvent, eventHandler)
      eventEmitter.emit(jestEditorSupportedEvent, 'arg1', { value: 'arg2' })

      expect(eventHandler).toHaveBeenCalledTimes(1)
      expect(eventHandler.mock.calls[0][0]).toBe('arg1')
      expect(eventHandler.mock.calls[0][1]).toEqual({ value: 'arg2' })
    })
  })

  describe('when stopping', () => {
    const closeProcessMock = jest.fn()

    beforeEach(() => {
      runnerMockImplementation = {
        ...runnerMockImplementation,
        closeProcess: closeProcessMock,
      }
      runnerMock.mockImplementation(() => runnerMockImplementation)
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
      })
    })

    it('calls closeProcess on the underlying runner from jest-editor-support', () => {
      jestProcess.stop()

      expect(closeProcessMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('when process is created with keepAlive set to true', () => {
    let onExit

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      runnerMockImplementation = {
        ...runnerMockImplementation,
        on: (event, callback) => {
          eventEmitter.on(event, callback)
        },
        removeAllListeners: jest.fn(() => eventEmitter.removeAllListeners()),
        closeProcess: jest.fn(),
      }
      runnerMock.mockImplementation(() => runnerMockImplementation)
      onExit = jest.fn()
    })

    it('provides public attribute providing the keepAlive setting', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })

      expect(jestProcess.keepAlive).toBeTruthy()

      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: false,
      })

      expect(jestProcess.keepAlive).toBeFalsy()
    })

    it('creates new instance of jest-editor-support runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMock.mock.instances.length).toBe(2)
    })

    it('limits number of restarts (keepAlive boundary)', () => {
      const limit = JestProcess.keepAliveLimit
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      Array.from(Array(limit + 1).keys()).forEach(_ => {
        eventEmitter.emit('debuggerProcessExit')
      })
      expect(runnerMock.mock.instances.length).toBe(limit)
    })

    it('does not restart the process if stopped explicitely', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      eventEmitter.emit('debuggerProcessExit')
      jestProcess.stop()
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMock.mock.instances.length).toBe(3)
    })

    it('passes the workspace argument to the jest-editor-support Runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMock.mock.calls[1][0]).toBe(projectWorkspaceMock)
    })

    it('starts the jest-editor-support runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMockImplementation.start).toHaveBeenCalledTimes(2)
    })

    it('passes the watchMode argument to the new runner instance when it is false', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: false,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMockImplementation.start.mock.calls[1][0]).toBe(false)
    })

    it('passes the watchMode argument to the new runner instance when it is true', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        watchMode: true,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')
      expect(runnerMockImplementation.start.mock.calls[1][0]).toBe(true)
    })

    it('removes all event listeners from the previous instance of the runner', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      eventEmitter.emit('debuggerProcessExit')

      expect(runnerMockImplementation.removeAllListeners).toHaveBeenCalledTimes(1)
    })

    it('does not call the exit callback if number of restart attempts did not reach JestProcess.keepAliveLimit', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      for (let i = 0; i < JestProcess.keepAliveLimit - 1; i++) {
        eventEmitter.emit('debuggerProcessExit')
      }
      expect(onExit).not.toHaveBeenCalled()
    })

    it('call the exit callback if number of restart attempts is equal or greater than JestProcess.keepAliveLimit', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })
      jestProcess.onExit(onExit)
      for (let i = 0; i < JestProcess.keepAliveLimit; i++) {
        eventEmitter.emit('debuggerProcessExit')
      }
      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  describe('restoring jest events', () => {
    let jestEvents

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      jestEvents = new Map<
        string,
        {
          callback: (...args: any[]) => void
          count: number
        }
      >()

      runnerMockImplementation = {
        ...runnerMockImplementation,
        on: (event, callback) => {
          if (event === 'debuggerProcessExit') {
            eventEmitter.on(event, callback)
          }
          let count = 0
          if (jestEvents.has(event)) {
            count = jestEvents.get(event).count
          }
          jestEvents.set(event, {
            callback: callback,
            count: count + 1,
          })
        },
        removeAllListeners: jest.fn(() => eventEmitter.removeAllListeners()),
        closeProcess: jest.fn(),
      }
      runnerMock.mockImplementation(() => runnerMockImplementation)
    })

    it('restores the previously registered jest event', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })

      const handler = () => {}

      jestProcess.onJestEditorSupportEvent('event', handler)
      eventEmitter.emit('debuggerProcessExit')

      expect(jestEvents.has('event')).toBeTruthy()
      expect(jestEvents.get('event').count).toBe(2)
      expect(jestEvents.get('event').callback).toBe(handler)
    })

    it('restores the previously registered multiple jest events', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })

      const handler1 = () => {}
      const handler2 = () => {}

      jestProcess.onJestEditorSupportEvent('event1', handler1)
      jestProcess.onJestEditorSupportEvent('event2', handler2)
      eventEmitter.emit('debuggerProcessExit')

      expect(jestEvents.has('event1')).toBeTruthy()
      expect(jestEvents.get('event1').count).toBe(2)
      expect(jestEvents.get('event1').callback).toBe(handler1)

      expect(jestEvents.has('event2')).toBeTruthy()
      expect(jestEvents.get('event2').count).toBe(2)
      expect(jestEvents.get('event2').callback).toBe(handler2)
    })

    it('does not restore the previously registered jest event if keepAlive is false', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: false,
      })

      const handler = () => {}

      jestProcess.onJestEditorSupportEvent('event', handler)
      eventEmitter.emit('debuggerProcessExit')

      expect(jestEvents.get('event').count).toBe(1)
    })

    it('does not restore any events when explicitely stopped', () => {
      jestProcess = new JestProcess({
        projectWorkspace: projectWorkspaceMock,
        keepAlive: true,
      })

      const handler = () => {}

      jestProcess.onJestEditorSupportEvent('event', handler)
      jestProcess.stop()
      eventEmitter.emit('debuggerProcessExit')

      expect(jestEvents.get('event').count).toBe(1)
    })
  })
})
