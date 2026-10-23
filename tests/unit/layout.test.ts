import { describe, expect, it } from 'vitest'
import { computeLayout, scrollXToReveal } from '../../src/main/window/layout'

const cols = (...widths: number[]): { id: string; width: number }[] =>
  widths.map((width, i) => ({ id: `c${i}`, width }))
// ツールバー40 + ヘッダ32 = 72、最下部スクロールバー14
const Y = 72

describe('computeLayout', () => {
  it('カラムなし', () => {
    expect(
      computeLayout({ columns: [], scrollX: 50, contentWidth: 1000, contentHeight: 800 })
    ).toEqual({
      bounds: [],
      totalWidth: 0,
      viewportWidth: 1000,
      scrollX: 0
    })
  })

  it('デフォルト幅のカラムを左から隙間なく並べる', () => {
    const r = computeLayout({
      columns: cols(380, 380, 380),
      scrollX: 0,
      contentWidth: 1600,
      contentHeight: 1000
    })
    expect(r.bounds.map((b) => b.x)).toEqual([0, 380, 760])
    expect(r.bounds.every((b) => b.y === Y && b.height === 1000 - Y - 14 && b.visible)).toBe(true)
    expect(r.totalWidth).toBe(1140)
    expect(r.scrollX).toBe(0)
  })

  it('合計幅がウィンドウ内に収まればスクロール位置は 0', () => {
    const r = computeLayout({
      columns: cols(380, 380),
      scrollX: 300,
      contentWidth: 1000,
      contentHeight: 800
    })
    expect(r.scrollX).toBe(0)
    expect(r.bounds[0].x).toBe(0)
  })

  it('スクロール位置を最大値にクランプし、画面外カラムを非表示にする', () => {
    const r = computeLayout({
      columns: cols(400, 400, 400, 400),
      scrollX: 10_000,
      contentWidth: 1000,
      contentHeight: 800
    })
    expect(r.scrollX).toBe(600)
    expect(r.bounds.map((b) => b.x)).toEqual([-600, -200, 200, 600])
    expect(r.bounds.map((b) => b.visible)).toEqual([false, true, true, true])
  })

  it('境界にちょうど接するカラムは非表示', () => {
    const r = computeLayout({
      columns: cols(400, 400, 400),
      scrollX: 400,
      contentWidth: 400,
      contentHeight: 800
    })
    expect(r.bounds.map((b) => b.visible)).toEqual([false, true, false])
  })

  it('負のスクロール位置は 0 にする', () => {
    const r = computeLayout({
      columns: cols(400, 400, 400),
      scrollX: -50,
      contentWidth: 500,
      contentHeight: 800
    })
    expect(r.scrollX).toBe(0)
  })

  it('高さが足りなければ高さ 0 で非表示', () => {
    const r = computeLayout({
      columns: cols(400),
      scrollX: 0,
      contentWidth: 500,
      contentHeight: 50
    })
    expect(r.bounds[0]).toMatchObject({ height: 0, visible: false })
  })

  it('幅の異なるカラム', () => {
    const r = computeLayout({
      columns: cols(300, 640, 500),
      scrollX: 100,
      contentWidth: 1000,
      contentHeight: 800
    })
    expect(r.bounds.map((b) => [b.x, b.width])).toEqual([
      [-100, 300],
      [200, 640],
      [840, 500]
    ])
  })
})

describe('scrollXToReveal', () => {
  // 各 380px、表示幅 1000px
  const columns = cols(380, 380, 380, 380, 380, 380, 380)
  const reveal = (index: number, scrollX: number, viewportWidth = 1000): number | null =>
    scrollXToReveal({ columns, index, scrollX, viewportWidth })

  it('全体が見えていれば現在位置のまま', () => {
    expect(reveal(1, 0)).toBe(0)
    expect(reveal(2, 140)).toBe(140)
  })

  it('右端が切れていれば右端合わせ', () => {
    // 3番目は 760〜1140
    expect(reveal(2, 0)).toBe(140)
    // 7番目は 2280〜2660
    expect(reveal(6, 0)).toBe(1660)
  })

  it('左端が切れていれば左端合わせ', () => {
    expect(reveal(0, 200)).toBe(0)
    expect(reveal(1, 1660)).toBe(380)
  })

  it('表示幅より広いカラムは左端合わせ', () => {
    expect(reveal(2, 0, 300)).toBe(760)
    expect(reveal(2, 800, 300)).toBe(760)
  })

  it('存在しないカラムは null', () => {
    expect(reveal(7, 0)).toBeNull()
    expect(reveal(-1, 0)).toBeNull()
    expect(scrollXToReveal({ columns: [], index: 0, scrollX: 0, viewportWidth: 1000 })).toBeNull()
  })
})
