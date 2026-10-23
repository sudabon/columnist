import { WebContentsView, type BaseWindow, type Session } from 'electron'
import { TOOLBAR_HEIGHT } from '../../shared/constants'
import { parseListUrl } from '../../shared/parseColumnInput'
import type { PickerState } from '../../shared/types'
import { TEST_ORIGIN } from '../testMode'
import { attachNavigationGuard } from './navigationGuard'

/** リスト選択画面の初期 URL。本番はホームから x.com のメニューでリスト一覧へ移動してもらう */
const INITIAL_URL = TEST_ORIGIN ? `${TEST_ORIGIN}/lists.html` : 'https://x.com/home'

export interface ListPickerOptions {
  window: BaseWindow
  session: Session
  extraOrigins: readonly string[]
  /** 開閉時と、リスト選択画面の URL が変わるたびに呼ばれる */
  onState(state: PickerState): void
}

/**
 * ツールバーの下の全面に一時的に重ねる x.com の画面(リスト選択画面)。
 * アプリが観測するのは URL のみで、スクリプト実行・CSS 注入・DOM の読み取りは行わない
 */
export class ListPicker {
  private view: WebContentsView | null = null

  constructor(private readonly options: ListPickerOptions) {}

  isOpen(): boolean {
    return this.view !== null
  }

  /** 開く。既に開いていれば何もしない */
  open(): void {
    if (this.view) return
    const view = new WebContentsView({
      webPreferences: {
        session: this.options.session,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
    const wc = view.webContents
    attachNavigationGuard(wc, this.options.extraOrigins)
    const notify = (): void => this.notify()
    wc.on('did-navigate', notify)
    wc.on('did-navigate-in-page', notify)
    this.view = view
    // カラムビューより手前に表示する
    this.options.window.contentView.addChildView(view)
    this.relayout()
    void wc.loadURL(INITIAL_URL).catch(() => undefined)
    this.notify()
  }

  close(): void {
    const view = this.view
    if (!view) return
    this.view = null
    this.options.window.contentView.removeChildView(view)
    view.webContents.close()
    this.notify()
  }

  /** 表示中の URL(閉じていれば null) */
  currentUrl(): string | null {
    return this.view?.webContents.getURL() ?? null
  }

  /** ツールバーの下の領域全体に合わせて再配置する */
  relayout(): void {
    if (!this.view) return
    const { width, height } = this.options.window.getContentBounds()
    this.view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width,
      height: Math.max(0, height - TOOLBAR_HEIGHT)
    })
  }

  state(): PickerState {
    const url = this.currentUrl()
    return {
      open: url !== null,
      canAdd: url !== null && parseListUrl(url, this.options.extraOrigins) !== null
    }
  }

  private notify(): void {
    this.options.onState(this.state())
  }
}
