import { afterEach, describe, expect, it, vi } from 'vitest'
import { debounce, ensureVisible } from '../../src/main/window/windowState'

const primary = { x: 0, y: 25, width: 1440, height: 875 }
const external = { x: 1440, y: 0, width: 1920, height: 1080 }

describe('ensureVisible', () => {
  it('位置が未保存なら主ディスプレイ中央', () => {
    expect(ensureVisible({ width: 1000, height: 600 }, [primary])).toEqual({
      x: 220,
      y: 163,
      width: 1000,
      height: 600
    })
  })

  it('表示可能な位置はそのまま', () => {
    expect(
      ensureVisible({ x: 1500, y: 100, width: 1600, height: 900 }, [primary, external])
    ).toEqual({
      x: 1500,
      y: 100,
      width: 1600,
      height: 900
    })
  })

  it('外したディスプレイ上の位置は主ディスプレイへ補正する', () => {
    const r = ensureVisible({ x: 1500, y: 100, width: 1600, height: 1000 }, [primary])
    expect(r).toEqual({ x: 0, y: 25, width: 1440, height: 875 })
  })

  it('作業領域より大きいサイズは縮める', () => {
    expect(ensureVisible({ x: 10, y: 30, width: 3000, height: 2000 }, [primary])).toEqual({
      x: 10,
      y: 30,
      width: 1440,
      height: 875
    })
  })
})

describe('debounce', () => {
  afterEach(() => vi.useRealTimers())

  it('最後の呼び出しから待ってから一度だけ実行する', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d(1)
    vi.advanceTimersByTime(300)
    d(2)
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith(2)
  })

  it('flush で保留中の呼び出しを即時実行する', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d()
    d.flush()
    expect(fn).toHaveBeenCalledOnce()
    d.flush()
    expect(fn).toHaveBeenCalledOnce()
  })
})
