import { HEADER_HEIGHT, SCROLLBAR_HEIGHT, TOOLBAR_HEIGHT } from '../../shared/constants'

export interface LayoutInput {
  columns: readonly { id: string; width: number }[]
  scrollX: number
  /** ウィンドウのコンテンツ領域の幅・高さ */
  contentWidth: number
  contentHeight: number
}

export interface ColumnBounds {
  id: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export interface LayoutResult {
  bounds: ColumnBounds[]
  totalWidth: number
  viewportWidth: number
  /** 0〜(totalWidth - viewportWidth) に収めたスクロール位置 */
  scrollX: number
}

export interface RevealInput {
  columns: readonly { width: number }[]
  index: number
  scrollX: number
  viewportWidth: number
}

/**
 * index 番目のカラム全体が見えるスクロール位置を返す。既に全体が見えていれば現在位置のまま。
 * 左端が切れていれば左端合わせ、右端が切れていれば右端合わせ(カラムが表示幅より広い場合は左端合わせ)。
 * カラムが存在しなければ null。
 */
export function scrollXToReveal(input: RevealInput): number | null {
  const column = input.columns[input.index]
  if (!column || !Number.isInteger(input.index) || input.index < 0) return null
  const left = input.columns.slice(0, input.index).reduce((sum, c) => sum + c.width, 0)
  const right = left + column.width
  const viewRight = input.scrollX + input.viewportWidth
  if (left < input.scrollX || column.width > input.viewportWidth) return left
  if (right > viewRight) return right - input.viewportWidth
  return input.scrollX
}

/** カラム本体の bounds を計算する。ツールバー・ヘッダ帯・横スクロールバーの領域は空ける */
export function computeLayout(input: LayoutInput): LayoutResult {
  const viewportWidth = Math.max(0, Math.floor(input.contentWidth))
  const totalWidth = input.columns.reduce((sum, c) => sum + c.width, 0)
  const maxScroll = Math.max(0, totalWidth - viewportWidth)
  const scrollX = Math.min(Math.max(0, Math.round(input.scrollX)), maxScroll)
  const y = TOOLBAR_HEIGHT + HEADER_HEIGHT
  const height = Math.max(0, Math.floor(input.contentHeight) - y - SCROLLBAR_HEIGHT)

  let offset = 0
  const bounds = input.columns.map((c) => {
    const x = offset - scrollX
    offset += c.width
    const visible = height > 0 && x + c.width > 0 && x < viewportWidth
    return { id: c.id, x, y, width: c.width, height, visible }
  })

  return { bounds, totalWidth, viewportWidth, scrollX }
}
