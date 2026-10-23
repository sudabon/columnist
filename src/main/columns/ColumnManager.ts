import { randomUUID } from 'node:crypto'
import type { BaseWindow, Session, WebContents } from 'electron'
import { LIST_PICKER_HINT, ZOOM_FACTOR_MAX, ZOOM_FACTOR_MIN } from '../../shared/constants'
import { IpcChannels } from '../../shared/ipcChannels'
import { parseColumnInput, parseListUrl } from '../../shared/parseColumnInput'
import type {
  AddColumnResult,
  Column,
  ColumnPatch,
  ColumnStatus,
  Defaults,
  DefaultsPatch,
  LayoutMetrics,
  NavigateAction
} from '../../shared/types'
import type { ConfigStore } from '../config/store'
import { computeLayout, scrollXToReveal } from '../window/layout'
import { ColumnView } from './ColumnView'
import type { RefreshScheduler } from './refresh'

export interface ColumnManagerDeps {
  window: BaseWindow
  session: Session
  store: ConfigStore
  scheduler: RefreshScheduler
  extraOrigins: readonly string[]
  send(channel: string, payload: unknown): void
  /** カラム構成が変わったとき(メニューの再構築用) */
  onColumnsChanged?(views: readonly ColumnView[]): void
}

export const ZOOM_STEP = 0.1

export type ZoomAction = 'in' | 'out' | 'reset'

/** ズームを1段階変えた値を返す。0.5〜1.5 に収め、浮動小数の誤差は小数第2位で丸める */
export function nextZoomFactor(current: number, action: ZoomAction): number {
  if (action === 'reset') return 1
  const next = Math.round((current + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP)) * 100) / 100
  return Math.min(ZOOM_FACTOR_MAX, Math.max(ZOOM_FACTOR_MIN, next))
}

/** カラムの生成・破棄・表示制御を行う。順序と設定値は ConfigStore を正とする */
export class ColumnManager {
  private readonly views = new Map<string, ColumnView>()
  private scrollX = 0
  /** キーボードフォーカスを持つカラム(なければ null) */
  private focusedId: string | null = null

  constructor(private readonly deps: ColumnManagerDeps) {}

  /** 保存済みのカラムを生成して表示する */
  init(): void {
    for (const column of this.deps.store.get().columns) this.createView(column)
    this.afterColumnsChanged()
  }

  list(): Column[] {
    return this.deps.store.get().columns
  }

  orderedViews(): ColumnView[] {
    return this.list()
      .map((c) => this.views.get(c.id))
      .filter((v): v is ColumnView => v !== undefined)
  }

  add(input: string): AddColumnResult {
    const parsed = parseColumnInput(input, { extraOrigins: this.deps.extraOrigins })
    if (!parsed.ok) return parsed
    return this.addParsed(parsed)
  }

  /** リスト選択画面で表示中のリストを追加する。url は押下時点の URL で、リストのページでなければエラー */
  addListFromPicker(url: string): AddColumnResult {
    const list = parseListUrl(url, this.deps.extraOrigins)
    if (!list) return { ok: false, error: LIST_PICKER_HINT }
    return this.addParsed({ type: 'list', url: list.url, title: `リスト ${list.id}` })
  }

  remove(id: string): void {
    const view = this.views.get(id)
    if (!view) return
    this.deps.store.update((draft) => ({
      ...draft,
      columns: draft.columns.filter((c) => c.id !== id)
    }))
    this.views.delete(id)
    if (this.focusedId === id) this.focusedId = null
    this.deps.window.contentView.removeChildView(view.view)
    view.destroy()
    this.afterColumnsChanged()
  }

  update(id: string, patch: ColumnPatch): void {
    const view = this.views.get(id)
    if (!view) return
    const before = view.data
    const config = this.deps.store.update((draft) => ({
      ...draft,
      columns: draft.columns.map((c) => (c.id === id ? { ...c, ...patch } : c))
    }))
    const column = config.columns.find((c) => c.id === id)
    if (!column) return
    view.setColumn(column)
    if (column.refreshIntervalSec !== before.refreshIntervalSec) this.deps.scheduler.reschedule(id)
    this.afterColumnsChanged()
  }

  /** ids が現在のカラム集合と完全に一致する場合のみ、その順に並べ替えて保存する */
  reorder(ids: readonly string[]): boolean {
    const current = this.list()
    const unique = new Set(ids)
    if (
      unique.size !== ids.length ||
      ids.length !== current.length ||
      !current.every((c) => unique.has(c.id))
    ) {
      return false
    }
    const order = new Map(ids.map((id, i) => [id, i]))
    this.deps.store.update((draft) => ({
      ...draft,
      columns: [...draft.columns].sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    }))
    this.afterColumnsChanged()
    return true
  }

  /** 全カラムの一時停止状態をまとめて切り替え、1回で保存する */
  setAllPaused(paused: boolean): void {
    const config = this.deps.store.update((draft) => ({
      ...draft,
      columns: draft.columns.map((c) => ({ ...c, paused }))
    }))
    for (const column of config.columns) this.views.get(column.id)?.setColumn(column)
    this.afterColumnsChanged()
  }

  getDefaults(): Defaults {
    return this.deps.store.get().defaults
  }

  /** 新規カラム用のデフォルト値を変更する。既存カラムの値は変えない */
  updateDefaults(patch: DefaultsPatch): Defaults {
    return this.deps.store.update((draft) => ({
      ...draft,
      defaults: { ...draft.defaults, ...patch }
    })).defaults
  }

  refresh(id: string | 'all'): void {
    const targets = id === 'all' ? this.orderedViews() : [this.views.get(id)]
    for (const view of targets) view?.reload()
  }

  navigate(id: string, action: NavigateAction): void {
    const view = this.views.get(id)
    if (!view) return
    if (action === 'back') view.goBack()
    else view.goHome()
  }

  /** 1つでも一時停止していないカラムがあれば全停止、全カラムが一時停止中なら全再開する */
  togglePauseAll(): void {
    this.setAllPaused(this.list().some((c) => !c.paused))
  }

  /** 左から index 番目(0 始まり)のカラム全体が見えるよう横スクロールし、フォーカスする */
  focusColumn(index: number): void {
    const views = this.orderedViews()
    const view = views[index]
    if (!view) return
    const target = scrollXToReveal({
      columns: views.map((v) => ({ width: v.data.width })),
      index,
      scrollX: this.scrollX,
      viewportWidth: this.deps.window.getContentBounds().width
    })
    if (target !== null && target !== this.scrollX) this.setScroll(target)
    view.webContents.focus()
  }

  focusedWebContents(): WebContents | null {
    return this.focusedView()?.webContents ?? null
  }

  /** フォーカス中カラムのズームを変更して保存する。フォーカス中のカラムがなければ何もしない */
  zoomFocused(action: ZoomAction): void {
    const view = this.focusedView()
    if (!view) return
    const zoomFactor = nextZoomFactor(view.data.zoomFactor, action)
    if (zoomFactor !== view.data.zoomFactor) this.update(view.id, { zoomFactor })
  }

  setScroll(scrollX: number): void {
    this.scrollX = scrollX
    this.relayout()
  }

  /** ウィンドウサイズ・スクロール位置・カラム幅から全カラムの bounds を再計算する */
  relayout(): void {
    const content = this.deps.window.getContentBounds()
    const views = this.orderedViews()
    const layout = computeLayout({
      columns: views.map((v) => ({ id: v.id, width: v.data.width })),
      scrollX: this.scrollX,
      contentWidth: content.width,
      contentHeight: content.height
    })
    this.scrollX = layout.scrollX
    layout.bounds.forEach((b, i) => {
      const view = views[i]
      view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
      // 画面外のカラムは非表示にするが、自動更新タイマーは止めない
      view.setVisible(b.visible)
    })
    const metrics: LayoutMetrics = {
      totalWidth: layout.totalWidth,
      viewportWidth: layout.viewportWidth,
      scrollX: layout.scrollX
    }
    this.deps.send(IpcChannels.layoutMetrics, metrics)
  }

  /** シェルの初期表示用に、現在の状態をすべて送り直す */
  broadcastAll(): void {
    this.deps.send(IpcChannels.columnsChanged, this.list())
    for (const view of this.orderedViews()) this.sendStatus(view.getStatus())
    this.relayout()
  }

  destroyAll(): void {
    this.deps.scheduler.setTargets([])
    for (const view of this.views.values()) {
      this.deps.window.contentView.removeChildView(view.view)
      view.destroy()
    }
    this.views.clear()
  }

  /** 解釈済みの入力からデフォルト値でカラムを作り、右端に追加・保存して表示する */
  private addParsed(parsed: Pick<Column, 'type' | 'url' | 'title'>): AddColumnResult {
    const { defaults } = this.deps.store.get()
    const column: Column = {
      id: `c_${randomUUID()}`,
      title: parsed.title,
      type: parsed.type,
      url: parsed.url,
      width: defaults.columnWidth,
      refreshIntervalSec: defaults.refreshIntervalSec,
      zoomFactor: defaults.zoomFactor,
      paused: false
    }
    let saved: Column
    try {
      const config = this.deps.store.update((draft) => ({
        ...draft,
        columns: [...draft.columns, column]
      }))
      saved = config.columns[config.columns.length - 1]
    } catch {
      return { ok: false, error: 'カラムを保存できませんでした' }
    }
    this.createView(saved)
    // 追加したカラムが見えるよう右端までスクロールする(clamp は computeLayout が行う)
    this.scrollX = Number.MAX_SAFE_INTEGER
    this.afterColumnsChanged()
    return { ok: true, column: saved }
  }

  private focusedView(): ColumnView | null {
    return this.focusedId === null ? null : (this.views.get(this.focusedId) ?? null)
  }

  private createView(column: Column): void {
    const view = new ColumnView(column, {
      session: this.deps.session,
      extraOrigins: this.deps.extraOrigins,
      onStatus: (status) => this.sendStatus(status),
      onFocusChange: (focused) => {
        if (focused) this.focusedId = column.id
        else if (this.focusedId === column.id) this.focusedId = null
      }
    })
    this.views.set(column.id, view)
    this.deps.window.contentView.addChildView(view.view)
    view.load()
  }

  private sendStatus(status: ColumnStatus): void {
    this.deps.send(IpcChannels.columnStatus, status)
  }

  private afterColumnsChanged(): void {
    const views = this.orderedViews()
    this.deps.scheduler.setTargets(views)
    this.deps.send(IpcChannels.columnsChanged, this.list())
    this.relayout()
    this.deps.onColumnsChanged?.(views)
  }
}
