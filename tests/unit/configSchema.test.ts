import { describe, expect, it } from 'vitest'
import {
  columnPatchSchema,
  createConfigSchema,
  defaultConfig,
  defaultsPatchSchema
} from '../../src/main/config/schema'
import type { Column, Config } from '../../src/shared/types'

const { config: configSchema, column: columnSchema } = createConfigSchema()

function column(overrides: Partial<Column> = {}): Column {
  return {
    id: 'c_1',
    title: 'テスト',
    type: 'list',
    url: 'https://x.com/i/lists/1',
    width: 380,
    refreshIntervalSec: 120,
    zoomFactor: 1,
    paused: false,
    ...overrides
  }
}

describe('config schema', () => {
  it('既定値の設定は有効', () => {
    const config = defaultConfig()
    expect(configSchema.parse(config)).toEqual(config)
    expect(config.defaults).toEqual({ columnWidth: 380, refreshIntervalSec: 120, zoomFactor: 1 })
  })

  it('twitter.com の URL を x.com に正規化する', () => {
    expect(columnSchema.parse(column({ url: 'https://twitter.com/i/lists/1' })).url).toBe(
      'https://x.com/i/lists/1'
    )
  })

  it('x.com 以外の URL を拒否する', () => {
    expect(columnSchema.safeParse(column({ url: 'https://example.com/' })).success).toBe(false)
    expect(columnSchema.safeParse(column({ url: 'http://x.com/home' })).success).toBe(false)
  })

  it.each([
    ['width', 299, false],
    ['width', 300, true],
    ['width', 640, true],
    ['width', 641, false],
    ['refreshIntervalSec', 59, false],
    ['refreshIntervalSec', 60, true],
    ['refreshIntervalSec', 3600, true],
    ['refreshIntervalSec', 3601, false],
    ['zoomFactor', 0.49, false],
    ['zoomFactor', 0.5, true],
    ['zoomFactor', 1.5, true],
    ['zoomFactor', 1.51, false]
  ] as const)('%s=%d の有効性は %s', (key, value, valid) => {
    expect(columnSchema.safeParse(column({ [key]: value })).success).toBe(valid)
  })

  it('不明な type を拒否する', () => {
    expect(columnSchema.safeParse({ ...column(), type: 'tweet' }).success).toBe(false)
  })

  it('defaults にも同じ範囲を適用する', () => {
    const config: Config = {
      ...defaultConfig(),
      defaults: { columnWidth: 380, refreshIntervalSec: 10, zoomFactor: 1 }
    }
    expect(configSchema.safeParse(config).success).toBe(false)
  })

  it('追加オリジンを許可できる', () => {
    const schema = createConfigSchema(['http://127.0.0.1:4173']).column
    expect(schema.safeParse(column({ url: 'http://127.0.0.1:4173/timeline.html' })).success).toBe(
      true
    )
    expect(
      columnSchema.safeParse(column({ url: 'http://127.0.0.1:4173/timeline.html' })).success
    ).toBe(false)
  })

  it('タイトルは100文字まで', () => {
    expect(columnSchema.safeParse(column({ title: 'あ'.repeat(100) })).success).toBe(true)
    expect(columnSchema.safeParse(column({ title: 'あ'.repeat(101) })).success).toBe(false)
  })

  it('patch のタイトルは trim し、空と100文字超を拒否する', () => {
    expect(columnPatchSchema.parse({ title: '  技術ニュース ' })).toEqual({ title: '技術ニュース' })
    expect(columnPatchSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(columnPatchSchema.safeParse({ title: 'a'.repeat(101) }).success).toBe(false)
  })

  it('defaults の patch は既知のキーと範囲内の値のみ受け付ける', () => {
    expect(defaultsPatchSchema.safeParse({ columnWidth: 420 }).success).toBe(true)
    expect(defaultsPatchSchema.safeParse({ columnWidth: 641 }).success).toBe(false)
    expect(defaultsPatchSchema.safeParse({ refreshIntervalSec: 30 }).success).toBe(false)
    expect(defaultsPatchSchema.safeParse({ zoomFactor: 2 }).success).toBe(false)
    expect(defaultsPatchSchema.safeParse({ width: 420 }).success).toBe(false)
  })

  it('patch は既知のキーのみ受け付ける', () => {
    expect(columnPatchSchema.safeParse({ title: 'a', paused: true }).success).toBe(true)
    expect(columnPatchSchema.safeParse({ url: 'https://x.com/home' }).success).toBe(false)
    expect(columnPatchSchema.safeParse({ refreshIntervalSec: 30 }).success).toBe(false)
  })
})
