/** 自動更新の判定とスケジューリング(spec.md 5.3) */

export const SCROLL_THRESHOLD_PX = 10
export const INPUT_IDLE_MS = 15_000

export type SkipReason = 'paused' | 'off-base-url' | 'loading' | 'audible' | 'scrolled' | 'active'

export type RefreshDecision = { refresh: true } | { refresh: false; reason: SkipReason }

/** スクリプト実行なしで分かる状態 */
export interface RefreshPreconditions {
  paused: boolean
  isOnBaseUrl: boolean
  isLoading: boolean
  isAudible: boolean
}

export interface RefreshState extends RefreshPreconditions {
  scrollY: number
  /** 最終操作時刻(ms)。未記録なら null */
  lastInputAt: number | null
  now: number
}

/** スクリプトを実行する前に判定できるスキップ理由を返す。なければ null */
export function precheckRefresh(s: RefreshPreconditions): SkipReason | null {
  if (s.paused) return 'paused'
  if (!s.isOnBaseUrl) return 'off-base-url'
  if (s.isLoading) return 'loading'
  if (s.isAudible) return 'audible'
  return null
}

export function shouldRefresh(s: RefreshState): RefreshDecision {
  const pre = precheckRefresh(s)
  if (pre) return { refresh: false, reason: pre }
  if (s.scrollY > SCROLL_THRESHOLD_PX) return { refresh: false, reason: 'scrolled' }
  if (s.lastInputAt !== null && s.now - s.lastInputAt < INPUT_IDLE_MS) {
    return { refresh: false, reason: 'active' }
  }
  return { refresh: true }
}

/**
 * 現在の URL がカラムの基準URLを表示しているか。
 * origin と pathname(末尾 / を除く)を比較し、/search のみ q パラメータも比較する。
 */
export function isOnBaseUrl(current: string, base: string): boolean {
  let a: URL
  let b: URL
  try {
    a = new URL(current)
    b = new URL(base)
  } catch {
    return false
  }
  const trim = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)
  if (a.origin !== b.origin || trim(a.pathname) !== trim(b.pathname)) return false
  if (trim(b.pathname) === '/search') {
    return a.searchParams.get('q') === b.searchParams.get('q')
  }
  return true
}

export interface RefreshTarget {
  readonly id: string
  getIntervalSec(): number
  getPreconditions(): RefreshPreconditions
  getScrollY(): Promise<number>
  getLastInputAt(): Promise<number | null>
  reload(): void
}

interface Entry {
  target: RefreshTarget
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * カラムごとに独立したタイマーで更新判定を行う。
 * - start() 時はカラム i の初回発火を interval × i / N 遅らせる
 * - スキップしても追いかけず、次回の発火を待つ
 */
export class RefreshScheduler {
  private readonly entries = new Map<string, Entry>()
  private running = false

  constructor(
    private readonly now: () => number = Date.now,
    private readonly onDecision?: (id: string, decision: RefreshDecision) => void
  ) {}

  isRunning(): boolean {
    return this.running
  }

  /** 対象カラムを差し替える。新規カラムは実行中なら 1 間隔後に初回判定する */
  setTargets(targets: readonly RefreshTarget[]): void {
    const ids = new Set(targets.map((t) => t.id))
    for (const [id, entry] of this.entries) {
      if (!ids.has(id)) {
        this.clear(entry)
        this.entries.delete(id)
      }
    }
    for (const target of targets) {
      const existing = this.entries.get(target.id)
      if (existing) {
        existing.target = target
        continue
      }
      const entry: Entry = { target, timer: null }
      this.entries.set(target.id, entry)
      if (this.running) this.schedule(entry, target.getIntervalSec() * 1000)
    }
  }

  /** カラムの更新間隔が変わったとき、変更時点から新しい間隔でタイマーを張り直す(分散は適用しない) */
  reschedule(id: string): void {
    const entry = this.entries.get(id)
    if (!entry || !this.running) return
    this.schedule(entry, entry.target.getIntervalSec() * 1000)
  }

  start(): void {
    if (this.running) return
    this.running = true
    const list = [...this.entries.values()]
    list.forEach((entry, i) => {
      const intervalMs = entry.target.getIntervalSec() * 1000
      this.schedule(entry, (intervalMs * i) / list.length)
    })
  }

  stop(): void {
    this.running = false
    for (const entry of this.entries.values()) this.clear(entry)
  }

  private schedule(entry: Entry, delayMs: number): void {
    this.clear(entry)
    entry.timer = setTimeout(() => void this.tick(entry), delayMs)
  }

  private clear(entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
  }

  private async tick(entry: Entry): Promise<void> {
    entry.timer = null
    if (!this.running || this.entries.get(entry.target.id) !== entry) return
    // 次回の発火を先に予約し、判定にかかる時間で間隔がずれないようにする
    this.schedule(entry, entry.target.getIntervalSec() * 1000)
    const decision = await this.decide(entry.target)
    if (decision.refresh && this.running && this.entries.get(entry.target.id) === entry) {
      entry.target.reload()
    }
    this.onDecision?.(entry.target.id, decision)
  }

  private async decide(target: RefreshTarget): Promise<RefreshDecision> {
    const pre = target.getPreconditions()
    const reason = precheckRefresh(pre)
    if (reason) return { refresh: false, reason }
    try {
      const [scrollY, lastInputAt] = await Promise.all([
        target.getScrollY(),
        target.getLastInputAt()
      ])
      return shouldRefresh({ ...target.getPreconditions(), scrollY, lastInputAt, now: this.now() })
    } catch {
      // スクリプトを実行できない(遷移中など)場合は安全側に倒してスキップする
      return { refresh: false, reason: 'loading' }
    }
  }
}
