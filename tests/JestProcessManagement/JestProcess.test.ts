jest.unmock('../../src/JestProcessManagement/JestProcess')

import { Runner, ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from '../../src/JestProcessManagement/JestProcess'
import { EventEmitter } from 'events'

describe('JestProcess', () => {
  let projectWorkspaceMock
  let jestProcess
  const mockRunner = (Runner as any) as jest.Mock<any>
  let eventEmitter: any

  beforeEach(() => {
    jest.clearAllMocks()
    projectWorkspaceMock = new ProjectWorkspace(null, null, null, null)
  })

  describe('when creating', () => {
    beforeEach(() => {
      eventEmitter = {
        on: jest.fn(() => eventEmitter),
        start: jest.fn(),
      }
      mockRunner.mockImplementation(() => eventEmitter)
      jestProcess = new JestProcess(projectWorkspaceMock)
    })

    it('accepts a project workspace argument', () => {
      expect(jestProcess).not.toBe(null)
    })

    it('creates and instance of jest-editor-support runner', () => {
      expect(mockRunner.mock.instances.length).toBe(1)
    })

    it('passes the workspace argument to the jest-editor-support Runner', () => {
      expect(mockRunner.mock.calls[0][0]).toBe(projectWorkspaceMock)
    })

    it('starts the jest-editor-support runner', () => {
      expect(eventEmitter.start).toHaveBeenCalledTimes(1)
    })
  })

  describe('when jest-editor-support runner exits', () => {
    let runnerMockImplementation
    let onExit

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      runnerMockImplementation = {
        on: (event, callback) => {
          eventEmitter.on(event, callback)
        },
        start: jest.fn(),
      }
      mockRunner.mockImplementation(() => runnerMockImplementation)
      jestProcess = new JestProcess(projectWorkspaceMock)
      onExit = jest.fn()
      jestProcess.onExit(onExit)
    })

    it('call the callback provided to onExit', () => {
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
    let runnerMockImplementation
    let eventHandler
    const jestEditorSupportedEvent = 'jest-editor-supported-event'

    beforeEach(() => {
      eventEmitter = new EventEmitter()
      runnerMockImplementation = {
        on: (event, callback) => {
          eventEmitter.on(event, callback)
        },
        start: jest.fn(),
      }
      mockRunner.mockImplementation(() => runnerMockImplementation)
      jestProcess = new JestProcess(projectWorkspaceMock)
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
