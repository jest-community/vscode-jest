jest.unmock('../index')
import { isDefaultPathToJest } from './index'

describe('isDefaultPathToJest', () => {
  it('returns true when the value is null', () => {
    expect(isDefaultPathToJest(null)).toBe(true)
  })

  it('returns false otherwise', () => {
    expect(isDefaultPathToJest('')).toBe(false)
  })
})
