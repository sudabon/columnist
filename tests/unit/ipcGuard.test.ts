import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createGuard } from '../../src/main/ipc/handlers'

describe('createGuard', () => {
  const schema = z.object({ id: z.string() })

  it('シェルからの正しいメッセージだけを処理する', () => {
    const fn = vi.fn((p: { id: string }) => `ok:${p.id}`)
    const handler = createGuard(() => 7)(schema, fn)
    expect(handler({ sender: { id: 7 } }, { id: 'a' })).toBe('ok:a')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('シェル以外の送信元は無視する', () => {
    const fn = vi.fn()
    const handler = createGuard(() => 7)(schema, fn)
    expect(handler({ sender: { id: 8 } }, { id: 'a' })).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })

  it('シェルが未生成なら無視する', () => {
    const fn = vi.fn()
    expect(createGuard(() => null)(schema, fn)({ sender: { id: 7 } }, { id: 'a' })).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })

  it('不正なペイロードは無視する', () => {
    const fn = vi.fn()
    const handler = createGuard(() => 7)(schema, fn)
    expect(handler({ sender: { id: 7 } }, { id: 1 })).toBeUndefined()
    expect(handler({ sender: { id: 7 } })).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })
})
