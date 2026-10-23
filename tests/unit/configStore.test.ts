import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConfigSchema, defaultConfig } from '../../src/main/config/schema'
import {
  ConfigLoadError,
  ConfigStore,
  loadConfig,
  migrate,
  saveConfig
} from '../../src/main/config/store'
import type { Config } from '../../src/shared/types'

const schema = createConfigSchema().config
const now = new Date('2026-10-23T01:02:03.456Z')

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'columnist-config-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeConfig(content: string): void {
  fs.writeFileSync(path.join(dir, 'config.json'), content)
}

const validConfig: Config = {
  version: 1,
  window: { x: 100, y: 80, width: 1600, height: 1000 },
  defaults: { columnWidth: 380, refreshIntervalSec: 120, zoomFactor: 1 },
  columns: [
    {
      id: 'c_1',
      title: '技術ニュース',
      type: 'list',
      url: 'https://x.com/i/lists/1234567890',
      width: 380,
      refreshIntervalSec: 120,
      zoomFactor: 1,
      paused: false
    }
  ]
}

describe('loadConfig', () => {
  it('ファイルがなければ既定値', () => {
    expect(loadConfig(dir, schema, now)).toEqual({ config: defaultConfig() })
  })

  it('正しいファイルはそのまま読み込む', () => {
    writeConfig(JSON.stringify(validConfig))
    expect(loadConfig(dir, schema, now)).toEqual({ config: validConfig })
  })

  it.each([
    ['不正な JSON', '{ not json'],
    [
      'スキーマ違反',
      JSON.stringify({
        ...validConfig,
        columns: [{ ...validConfig.columns[0], refreshIntervalSec: 10 }]
      })
    ],
    ['未知の新バージョン', JSON.stringify({ ...validConfig, version: 99 })],
    ['version なし', JSON.stringify({ ...validConfig, version: undefined })]
  ])('%s は退避して既定値で起動する', (_label, content) => {
    writeConfig(content)
    const result = loadConfig(dir, schema, now)
    expect(result.config).toEqual(defaultConfig())
    const backup = path.join(dir, 'config.broken-2026-10-23T01-02-03-456Z.json')
    expect(result.brokenBackupPath).toBe(backup)
    expect(fs.readFileSync(backup, 'utf8')).toBe(content)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false)
  })
})

describe('migrate', () => {
  it('旧版から現行版まで順に変換する', () => {
    const table = {
      1: (raw: Record<string, unknown>) => ({ ...raw, version: 2, a: 1 }),
      2: (raw: Record<string, unknown>) => ({ ...raw, version: 3, b: 2 })
    }
    expect(migrate({ version: 1 }, table, 3)).toEqual({ version: 3, a: 1, b: 2 })
  })

  it('現行版は変換しない', () => {
    expect(migrate({ version: 1, x: 1 })).toEqual({ version: 1, x: 1 })
  })

  it('新しすぎる版・不正な版は失敗する', () => {
    expect(() => migrate({ version: 2 })).toThrow(ConfigLoadError)
    expect(() => migrate({ version: '1' })).toThrow(ConfigLoadError)
    expect(() => migrate([])).toThrow(ConfigLoadError)
  })

  it('変換関数が欠けていれば失敗する', () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow(ConfigLoadError)
  })
})

describe('saveConfig / ConfigStore', () => {
  it('検証して保存し、一時ファイルを残さない', () => {
    saveConfig(dir, schema, validConfig)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))).toEqual(validConfig)
    expect(fs.readdirSync(dir)).toEqual(['config.json'])
  })

  it('不正な設定は保存せず、メモリ上の値も変えない', () => {
    const store = new ConfigStore(dir, schema, validConfig)
    expect(() =>
      store.update((draft) => ({
        ...draft,
        defaults: { ...draft.defaults, refreshIntervalSec: 59 }
      }))
    ).toThrow()
    expect(store.get()).toEqual(validConfig)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(false)
  })

  it('保存時に twitter.com を x.com へ正規化する', () => {
    const store = new ConfigStore(dir, schema, defaultConfig())
    store.update((draft) => ({
      ...draft,
      columns: [{ ...validConfig.columns[0], url: 'https://twitter.com/i/lists/1' }]
    }))
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) as Config
    expect(saved.columns[0].url).toBe('https://x.com/i/lists/1')
    expect(store.get().columns[0].url).toBe('https://x.com/i/lists/1')
  })
})
