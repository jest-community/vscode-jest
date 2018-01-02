jest.unmock('../../src/JestProcessManagement/JestProcessManager')

import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from '../../src/JestProcessManagement/JestProcess'
import { JestProcessManager } from '../../src/JestProcessManagement/JestProcessManager'
import { EventEmitter } from 'events'

describe('JestProcessManager', () => {
  let projectWorkspaceMock
  const jestProcessMock = (JestProcess as any) as jest.Mock<any>

  beforeEach(() => {
    jest.clearAllMocks()
    projectWorkspaceMock = new ProjectWorkspace(null, null, null, null)
  })

  describe('when creating', () => {
    it('accepts Project Workspace as the argument', () => {
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })
      expect(jestProcessManager).not.toBe(null)
    })
  })

  describe('when starting jest process', () => {
    let exitHandler
    let eventEmitter

    beforeEach(() => {
      exitHandler = jest.fn()
      eventEmitter = new EventEmitter()
    })

    it('creates JestProcess', () => {
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })

      jestProcessManager.startJestProcess()

      expect(jestProcessMock.mock.instances.length).toBe(1)
    })

    it('returns an instance of JestProcess', () => {
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })

      const jestProcess = jestProcessManager.startJestProcess()

      expect(jestProcess).toBe(jestProcessMock.mock.instances[0])
    })

    it('passes the project workspace to the JestProcess instance', () => {
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })

      jestProcessManager.startJestProcess()

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('projectWorkspace', projectWorkspaceMock)
    })

    it('calls the onExit handler when JestProcess exits', () => {
      jestProcessMock.mockImplementation(() => ({
        onExit: callback => {
          eventEmitter.on('debuggerProcessExit', callback)
        },
      }))

      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })

      jestProcessManager.startJestProcess(exitHandler)

      eventEmitter.emit('debuggerProcessExit')

      expect(exitHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('when starting jest process in non-watch mode', () => {
    it('passes the watchMode flag set to false', () => {
      const jestProcessManager = new JestProcessManager({ projectWorkspace: projectWorkspaceMock })

      jestProcessManager.startJestProcess()

      expect(jestProcessMock.mock.calls[0][0]).toHaveProperty('watchMode', false)
    })
  })
})
