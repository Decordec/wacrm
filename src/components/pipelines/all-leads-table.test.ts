import { describe, expect, it } from 'vitest'
import { followUpState } from './all-leads-table'

describe('followUpState', () => {
  const today = new Date(2026, 10, 27) // 27 Nov 2026

  it('flags past follow-ups on open leads as overdue', () => {
    expect(followUpState('2026-11-20', 'open', today)).toBe('overdue')
  })
  it('flags today', () => {
    expect(followUpState('2026-11-27', 'open', today)).toBe('today')
  })
  it('treats future dates as upcoming', () => {
    expect(followUpState('2026-12-02', undefined, today)).toBe('upcoming')
  })
  it('ignores closed leads and missing dates', () => {
    expect(followUpState('2026-11-20', 'won', today)).toBeNull()
    expect(followUpState('2026-11-20', 'lost', today)).toBeNull()
    expect(followUpState(null, 'open', today)).toBeNull()
  })
})
