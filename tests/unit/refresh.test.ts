import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isOnBaseUrl,
  RefreshScheduler,
  shouldRefresh,
  type RefreshPreconditions,
  type RefreshState,
  type RefreshTarget
} from '../../src/main/columns/refresh'

const NOW = 1_000_000

function state(overrides: Partial<RefreshState> = {}): RefreshState {
  return {
    paused: false,
    isOnBaseUrl: true,
    isLoading: false,
    isAudible: false,
    scrollY: 0,
    lastInputAt: null,
    now: NOW,
    ...overrides
  }
}

describe('shouldRefresh', () => {
  it('全条件を満たせば更新する', () => {
    expect(shouldRefresh(state())).toEqual({ refresh: true })
    expect(shouldRefresh(state({ scrollY: 10, lastInputAt: NOW - 15_000 }))).toEqual({
      refresh: true
    })
  })

  it.each([
    ['paused', { paused: true }],
    ['off-base-url', { isOnBaseUrl: false }],
    ['loading', { isLoading: true }],
    ['audible', { isAudible: true }],
    ['scrolled', { scrollY: 11 }],
    ['active', { lastInputAt: NOW - 14_999 }]
  ] as const)('%s はスキップ', (reason, overrides) => {
    expect(shouldRefresh(state(overrides))).toEqual({ refresh: false, reason })
  })

  it('判定順は spec の擬似コードどおり', () => {
    expect(shouldRefresh(state({ paused: true, isOnBaseUrl: false, scrollY: 100 }))).toMatchObject({
      reason: 'paused'
    })
    expect(shouldRefresh(state({ isOnBaseUrl: false, isLoading: true }))).toMatchObject({
      reason: 'off-base-url'
    })
    expect(shouldRefresh(state({ isLoading: true, isAudible: true }))).toMatchObject({
      reason: 'loading'
    })
    expect(shouldRefresh(state({ isAudible: true, scrollY: 100 }))).toMatchObject({
      reason: 'audible'
    })
    expect(shouldRefresh(state({ scrollY: 100, lastInputAt: NOW }))).toMatchObject({
      reason: 'scrolled'
    })
  })
})

describe('isOnBaseUrl', () => {
  it.each([
    ['https://x.com/i/lists/1', 'https://x.com/i/lists/1', true],
    ['https://x.com/i/lists/1/', 'https://x.com/i/lists/1', true],
    ['https://x.com/i/lists/1?s=20', 'https://x.com/i/lists/1', true],
    ['https://x.com/user/status/123', 'https://x.com/i/lists/1', false],
    ['https://x.com/i/lists/2', 'https://x.com/i/lists/1', false],
    ['https://x.com/search?f=live&q=electron', 'https://x.com/search?q=electron&f=live', true],
    ['https://x.com/search?q=other&f=live', 'https://x.com/search?q=electron&f=live', false],
    ['https://example.com/i/lists/1', 'https://x.com/i/lists/1', false],
    ['', 'https://x.com/i/lists/1', false]
  ])('%s vs %s → %s', (current, base, expected) => {
    expect(isOnBaseUrl(current, base)).toBe(expected)
  })
})

class FakeTarget implements RefreshTarget {
  reloads: number[] = []
  pre: RefreshPreconditions = {
    paused: false,
    isOnBaseUrl: true,
    isLoading: false,
    isAudible: false
  }
  scrollY = 0
  lastInputAt: number | null = null
  constructor(
    readonly id: string,
    public intervalSec = 120
  ) {}
  getIntervalSec(): number {
    return this.intervalSec
  }
  getPreconditions(): RefreshPreconditions {
    return this.pre
  }
  getScrollY = vi.fn(async () => this.scrollY)
  getLastInputAt = vi.fn(async () => this.lastInputAt)
  reload(): void {
    this.reloads.push(Date.now())
  }
}

describe('RefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  const scheduler = (): RefreshScheduler => new RefreshScheduler(() => Date.now())

  it('初回発火を interval × i / N ずらし、以後は interval ごと', async () => {
    const targets = [0, 1, 2, 3].map((i) => new FakeTarget(`c${i}`))
    const s = scheduler()
    s.setTargets(targets)
    s.start()
    await vi.advanceTimersByTimeAsync(120_000 + 90_000)
    expect(targets.map((t) => t.reloads)).toEqual([
      [0, 120_000],
      [30_000, 150_000],
      [60_000, 180_000],
      [90_000, 210_000]
    ])
  })

  it('スキップしても追いかけず、次回の発火で判定する', async () => {
    const t = new FakeTarget('c0', 60)
    const s = scheduler()
    s.setTargets([t])
    t.scrollY = 100
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.reloads).toEqual([])
    t.scrollY = 0
    await vi.advanceTimersByTimeAsync(59_999)
    expect(t.reloads).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(t.reloads).toEqual([60_000])
  })

  it('スクリプト実行前の条件でスキップする場合はスクリプトを実行しない', async () => {
    const t = new FakeTarget('c0')
    t.pre = { ...t.pre, paused: true }
    const s = scheduler()
    s.setTargets([t])
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.getScrollY).not.toHaveBeenCalled()
    expect(t.reloads).toEqual([])
  })

  it('スクリプト実行に失敗したらスキップする', async () => {
    const t = new FakeTarget('c0')
    t.getScrollY.mockRejectedValueOnce(new Error('navigating'))
    const decisions: unknown[] = []
    const s = new RefreshScheduler(
      () => Date.now(),
      (_id, d) => decisions.push(d)
    )
    s.setTargets([t])
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.reloads).toEqual([])
    expect(decisions).toEqual([{ refresh: false, reason: 'loading' }])
  })

  it('stop 中は発火せず、start で分散を再適用して再開する', async () => {
    const targets = [new FakeTarget('a'), new FakeTarget('b')]
    const s = scheduler()
    s.setTargets(targets)
    s.start()
    await vi.advanceTimersByTimeAsync(1_000)
    s.stop()
    await vi.advanceTimersByTimeAsync(1_000_000)
    expect(targets.map((t) => t.reloads)).toEqual([[0], []])
    s.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(targets.map((t) => t.reloads)).toEqual([[0, 1_001_000], [1_061_000]])
  })

  it('実行中に追加したカラムは 1 間隔後に初回判定、削除したカラムは止まる', async () => {
    const a = new FakeTarget('a', 60)
    const b = new FakeTarget('b', 60)
    const s = scheduler()
    s.setTargets([a])
    s.start()
    await vi.advanceTimersByTimeAsync(10_000)
    s.setTargets([a, b])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(b.reloads).toEqual([70_000])
    s.setTargets([b])
    await vi.advanceTimersByTimeAsync(120_000)
    expect(a.reloads).toEqual([0, 60_000])
  })

  it('reschedule は変更時点から新しい間隔で張り直す', async () => {
    const t = new FakeTarget('c0', 120)
    const s = scheduler()
    s.setTargets([t])
    s.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.reloads).toEqual([0])
    t.intervalSec = 60
    s.reschedule('c0')
    await vi.advanceTimersByTimeAsync(130_000)
    expect(t.reloads).toEqual([0, 70_000, 130_000])
  })

  it('停止中の reschedule はタイマーを張らない', async () => {
    const t = new FakeTarget('c0', 60)
    const s = scheduler()
    s.setTargets([t])
    s.reschedule('c0')
    s.reschedule('unknown')
    await vi.advanceTimersByTimeAsync(600_000)
    expect(t.reloads).toEqual([])
  })
})
