import { WebContentsView, type Rectangle, type Session, type WebContents } from 'electron'
import xCss from '../../inject/x.css?raw'
import type { Column, ColumnStatus } from '../../shared/types'
import { getLastInputAt, getScrollY, installInputTracker, scrollToTop } from './allowedScripts'
import { attachNavigationGuard } from './navigationGuard'
import { isOnBaseUrl, type RefreshPreconditions, type RefreshTarget } from './refresh'

export interface ColumnViewOptions {
  session: Session
  extraOrigins: readonly string[]
  onStatus(status: ColumnStatus): void
  /** キーボードフォーカスを得た・失ったとき(ショートカットの対象カラムの追跡用) */
  onFocusChange(focused: boolean): void
}

/** 1カラム分の WebContentsView(x.com を表示する)のラッパー */
export class ColumnView implements RefreshTarget {
  readonly view: WebContentsView
  private lastRefreshedAt: number | null = null

  constructor(
    private column: Column,
    private readonly options: ColumnViewOptions
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        session: options.session,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
    const wc = this.webContents
    attachNavigationGuard(wc, options.extraOrigins)
    // Chromium のズームは既定で同一オリジンの全ビューに伝播するため、カラムごとに分離する。
    // isolated モードでは webPreferences.zoomFactor が効かず、初回読み込み前の設定も保持されないので、
    // 遷移のたびにカラムの値を適用し直す
    wc.setZoomMode('isolated')
    wc.on('did-navigate', () => wc.setZoomFactor(this.column.zoomFactor))
    wc.on('dom-ready', () => {
      // SPA の遷移や再読み込みで消えないよう、dom-ready のたびに注入し直す
      void wc.insertCSS(xCss).catch(() => undefined)
      void installInputTracker(wc).catch(() => undefined)
    })
    wc.on('focus', () => options.onFocusChange(true))
    wc.on('blur', () => options.onFocusChange(false))
    const notify = (): void => this.notifyStatus()
    wc.on('did-navigate', notify)
    wc.on('did-navigate-in-page', notify)
    wc.on('did-finish-load', notify)
  }

  get id(): string {
    return this.column.id
  }

  get webContents(): WebContents {
    return this.view.webContents
  }

  get data(): Column {
    return this.column
  }

  setColumn(column: Column): void {
    const zoomChanged = column.zoomFactor !== this.column.zoomFactor
    this.column = column
    if (zoomChanged && !this.webContents.isDestroyed()) {
      this.webContents.setZoomFactor(column.zoomFactor)
    }
    this.notifyStatus()
  }

  load(): void {
    this.markRefreshed()
    void this.webContents.loadURL(this.column.url).catch(() => undefined)
  }

  setBounds(bounds: Rectangle): void {
    this.view.setBounds(bounds)
  }

  setVisible(visible: boolean): void {
    this.view.setVisible(visible)
  }

  reload(): void {
    this.markRefreshed()
    this.webContents.reload()
  }

  goBack(): void {
    const history = this.webContents.navigationHistory
    if (history.canGoBack()) history.goBack()
  }

  /** 基準URLへ戻る。既に基準URLなら先頭へスクロールする */
  goHome(): void {
    if (isOnBaseUrl(this.webContents.getURL(), this.column.url)) {
      void scrollToTop(this.webContents).catch(() => undefined)
      return
    }
    void this.webContents.loadURL(this.column.url).catch(() => undefined)
  }

  getStatus(): ColumnStatus {
    const wc = this.webContents
    return {
      id: this.column.id,
      lastRefreshedAt: this.lastRefreshedAt,
      // 初回読み込み前(URL 未確定)は基準URL扱いにする
      isOnBaseUrl: wc.getURL() === '' || isOnBaseUrl(wc.getURL(), this.column.url),
      canGoBack: wc.navigationHistory.canGoBack()
    }
  }

  getIntervalSec(): number {
    return this.column.refreshIntervalSec
  }

  getPreconditions(): RefreshPreconditions {
    const wc = this.webContents
    return {
      paused: this.column.paused,
      isOnBaseUrl: isOnBaseUrl(wc.getURL(), this.column.url),
      isLoading: wc.isLoading(),
      isAudible: wc.isCurrentlyAudible()
    }
  }

  getScrollY(): Promise<number> {
    return getScrollY(this.webContents)
  }

  getLastInputAt(): Promise<number | null> {
    return getLastInputAt(this.webContents)
  }

  destroy(): void {
    this.webContents.close()
  }

  private markRefreshed(): void {
    this.lastRefreshedAt = Date.now()
    this.notifyStatus()
  }

  private notifyStatus(): void {
    if (this.webContents.isDestroyed()) return
    this.options.onStatus(this.getStatus())
  }
}
