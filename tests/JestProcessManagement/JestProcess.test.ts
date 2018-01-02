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

    it('creates and instance of jest-editor-support runner', () => {
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
})
