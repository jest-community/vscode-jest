jest.unmock('../../src/Coverage/CoverageOverlay')

const vscodeProperties = {
  window: {
    visibleTextEditors: jest.fn(),
  },
}
jest.mock('vscode', () => {
  const vscode = {
    OverviewRulerLane: {},
    window: {
      createTextEditorDecorationType: jest.fn(),
    },
  }

  Object.defineProperty(vscode.window, 'visibleTextEditors', {
    get: () => vscodeProperties.window.visibleTextEditors(),
  })

  return vscode
})

import { CoverageOverlay } from '../../src/Coverage/CoverageOverlay'
import { DefaultFormatter } from '../../src/Coverage/Formatters/DefaultFormatter'
import { hasDocument } from '../../src/editor'
import { ICoverageFormatterSettings } from '../../src/Settings'

describe('CoverageOverlay', () => {
  const coverageMapProvider: any = {}

  const settings: ICoverageFormatterSettings = {
    gutterFormatter: {
      uncoveredLine: {
        backgroundColor: '',
        gutterIconPath: './images/GutterFormatter/uncovered-gutter-icon.svg',
      },
      partiallyCoveredLine: {
        backgroundColor: '',
        gutterIconPath: './images/GutterFormatter/partially-covered-gutter-icon.svg',
      },
      coveredLine: {
        backgroundColor: '',
        gutterIconPath: './images/GutterFormatter/covered-gutter-icon.svg',
      },
    },
  }

  describe('constructor', () => {
    it('should set the default visibility', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider, settings)

      expect(sut.enabled).toBe(CoverageOverlay.defaultVisibility)
    })

    it('should set the visibility if provided', () => {
      const enabled = !CoverageOverlay.defaultVisibility
      const sut = new CoverageOverlay(null, coverageMapProvider, settings, enabled)

      expect(sut.enabled).toBe(enabled)
    })

    it('should set the default overlay formatter', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider, settings)

      expect(DefaultFormatter).toBeCalledWith(coverageMapProvider)
      expect(sut.formatter).toBeInstanceOf(DefaultFormatter)
    })
  })

  describe('enabled', () => {
    describe('get', () => {
      it('should return the overlay visibility', () => {
        const expected = true
        const sut = new CoverageOverlay(null, coverageMapProvider, settings, expected)

        expect(sut.enabled).toBe(expected)
      })
    })

    describe('set', () => {
      it('should set the overlay visibility', () => {
        const expected = true
        const sut = new CoverageOverlay(null, coverageMapProvider, settings, !expected)
        sut.updateVisibleEditors = jest.fn()
        sut.enabled = expected

        expect(sut.enabled).toBe(expected)
      })

      it('should refresh the overlays in visible editors', () => {
        const sut = new CoverageOverlay(null, coverageMapProvider, settings)
        sut.updateVisibleEditors = jest.fn()
        sut.enabled = true

        expect(sut.updateVisibleEditors).toBeCalled()
      })
    })
  })

  describe('toggleVisibility()', () => {
    it('should enable the overlay when disabled', () => {
      const enabled = false
      const sut = new CoverageOverlay(null, coverageMapProvider, settings, enabled)
      sut.updateVisibleEditors = jest.fn()
      sut.toggleVisibility()

      expect(sut.enabled).toBe(true)
    })

    it('should disable the overlay when enabled', () => {
      const enabled = true
      const sut = new CoverageOverlay(null, coverageMapProvider, settings, enabled)
      sut.updateVisibleEditors = jest.fn()
      sut.toggleVisibility()

      expect(sut.enabled).toBe(false)
    })

    it('should refresh the overlays in visible editors', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider, settings)
      sut.updateVisibleEditors = jest.fn()
      sut.toggleVisibility()

      expect(sut.updateVisibleEditors).toBeCalled()
    })
  })

  describe('updateVisibleEditors()', () => {
    it('should update each editor', () => {
      const editors = [{}, {}, {}]
      vscodeProperties.window.visibleTextEditors.mockReturnValueOnce(editors)

      const sut = new CoverageOverlay(null, coverageMapProvider, settings)
      sut.update = jest.fn()
      sut.updateVisibleEditors()

      for (let i = 0; i < editors.length; i += 1) {
        expect((sut.update as jest.Mock<any>).mock.calls[i]).toEqual([editors[i]])
      }
    })
  })

  describe('update()', () => {
    it('should do nothing if the editor does not have a valid document', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider, settings)
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(false)

      const editor: any = {}
      sut.update(editor)

      expect(sut.formatter.format).not.toBeCalled()
      expect(sut.formatter.clear).not.toBeCalled()
    })

    it('should add the overlay when enabled', () => {
      const enabled = true
      const sut = new CoverageOverlay(null, coverageMapProvider, settings, enabled)
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(true)

      const editor: any = {}
      sut.update(editor)

      expect(sut.formatter.format).toBeCalledWith(editor)
    })

    it('should remove the overlay when disabled', () => {
      const enabled = false
      const sut = new CoverageOverlay(null, coverageMapProvider, settings, enabled)
      ;(hasDocument as jest.Mock<{}>).mockReturnValueOnce(true)

      const editor: any = {}
      sut.update(editor)

      expect(sut.formatter.clear).toBeCalledWith(editor)
    })
  })
})
