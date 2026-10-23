import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../../src/shared/formatRelativeTime'

describe('formatRelativeTime', () => {
  const now = 10_000_000
  it.each([
    [null, '未更新'],
    [now, 'たった今'],
    [now - 59_000, 'たった今'],
    [now - 120_000, '2分前'],
    [now - 3_600_000, '1時間前'],
    [now - 86_400_000 * 2, '2日前']
  ])('%s → %s', (ts, expected) => {
    expect(formatRelativeTime(ts, now)).toBe(expected)
  })
})
