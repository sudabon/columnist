import type { WebContents } from 'electron'

/*
 * カラムビュー(x.com)で実行してよいスクリプトの全量(spec.md 1.3)。
 * ここ以外から executeJavaScript 系 API を呼ぶことは ESLint と check:guardrails で禁止している。
 * 追加・変更はガードレールの見直しを伴うため、必ずレビューで差分を確認すること。
 *
 * ページ側のスクリプトから見えないよう、メインワールドではなく専用の isolated world で実行する。
 * isolated world でも window.scrollY や DOM イベントはページと共有される。
 */

const ISOLATED_WORLD_ID = 1001

/** スクロール位置取得: window.scrollY を返す */
const GET_SCROLL_Y = 'window.scrollY'

/** 先頭へ戻す */
const SCROLL_TO_TOP = 'window.scrollTo(0, 0)'

/**
 * 操作中判定: mousemove / wheel / keydown / pointerdown の最終発生時刻だけを
 * window.__columnistLastInput に記録する。イベントの中身(座標・キー・対象要素)は参照しない。
 * 既にインストール済みなら何もしない(dom-ready ごとに呼ばれるため冪等にしている)。
 */
const INSTALL_INPUT_TRACKER = `(() => {
  if ('__columnistLastInput' in window) return
  window.__columnistLastInput = 0
  const mark = () => { window.__columnistLastInput = Date.now() }
  for (const type of ['mousemove', 'wheel', 'keydown', 'pointerdown']) {
    window.addEventListener(type, mark, { passive: true, capture: true })
  }
})()`

/** 操作中判定: 記録された最終操作時刻を読む(未記録なら null) */
const GET_LAST_INPUT =
  "typeof window.__columnistLastInput === 'number' ? window.__columnistLastInput : null"

function run(wc: WebContents, code: string): Promise<unknown> {
  return wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD_ID, [{ code }])
}

export async function getScrollY(wc: WebContents): Promise<number> {
  const value = await run(wc, GET_SCROLL_Y)
  return typeof value === 'number' ? value : 0
}

export async function scrollToTop(wc: WebContents): Promise<void> {
  await run(wc, SCROLL_TO_TOP)
}

export async function installInputTracker(wc: WebContents): Promise<void> {
  await run(wc, INSTALL_INPUT_TRACKER)
}

export async function getLastInputAt(wc: WebContents): Promise<number | null> {
  const value = await run(wc, GET_LAST_INPUT)
  return typeof value === 'number' ? value : null
}
