import type { WindowState } from '../../shared/types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 保存されたウィンドウ位置・サイズを、接続中ディスプレイの作業領域に収まるよう補正する。
 * どの作業領域とも交差しなければ主ディスプレイの中央に置く。
 */
export function ensureVisible(state: WindowState, workAreas: readonly Rect[]): Rect {
  const primary = workAreas[0] ?? { x: 0, y: 0, width: state.width, height: state.height }
  const width = Math.min(state.width, primary.width)
  const height = Math.min(state.height, primary.height)
  const centered = {
    x: primary.x + Math.round((primary.width - width) / 2),
    y: primary.y + Math.round((primary.height - height) / 2),
    width,
    height
  }
  if (state.x === undefined || state.y === undefined) return centered

  const rect = { x: state.x, y: state.y, width: state.width, height: state.height }
  // タイトルバー付近(上端から 40px)が見えていれば操作できるとみなす
  const grabbable = { x: rect.x, y: rect.y, width: rect.width, height: Math.min(40, rect.height) }
  const area = workAreas.find((a) => intersects(grabbable, a))
  if (!area) return centered
  return {
    x: rect.x,
    y: rect.y,
    width: Math.min(rect.width, area.width),
    height: Math.min(rect.height, area.height)
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** 最後の呼び出しから wait ミリ秒後に一度だけ fn を実行する */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number
): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const run = (): void => {
    timer = null
    if (pending) {
      const args = pending
      pending = null
      fn(...args)
    }
  }
  const debounced = (...args: A): void => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, wait)
  }
  debounced.flush = (): void => {
    if (timer) clearTimeout(timer)
    run()
  }
  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  return debounced
}
