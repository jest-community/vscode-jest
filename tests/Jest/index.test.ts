jest.unmock('../../src/Jest')
import { isWatchNotSupported } from '../../src/Jest'

describe('isWatchNotSupported', () => {
  it('returns true when matching the expected message', () => {
    const str = '\n--watch is not supported without git/hg, please use --watchAll \n'
    expect(isWatchNotSupported(str)).toBe(true)
  })

  it('returns false otherwise', () => {
    expect(isWatchNotSupported()).toBe(false)
  })
})
