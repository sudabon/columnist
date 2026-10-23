import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColumnManager, nextZoomFactor } from '../../src/main/columns/ColumnManager'
import type { RefreshScheduler } from '../../src/main/columns/refresh'
import { createConfigSchema, defaultConfig } from '../../src/main/config/schema'
import { ConfigStore, loadConfig } from '../../src/main/config/store'
import type { Column } from '../../src/shared/types'

// ColumnView は Electron の WebContentsView に依存するため、データだけを持つ偽物に差し替える
vi.mock('../../src/main/columns/ColumnView', () => ({
  ColumnView: class {
    view = {}
    webContents = {}
    constructor(public data: Column) {}
    get id(): string {
      return this.data.id
    }
    setColumn(column: Column): void {
      this.data = column
    }
    load = vi.fn()
    setBounds = vi.fn()
    setVisible = vi.fn()
    getStatus(): unknown {
      return { id: this.data.id }
    }
    destroy = vi.fn()
  }
}))

const schema = createConfigSchema().config

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'columnist-manager-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

interface Setup {
  store: ConfigStore
  scheduler: { setTargets: ReturnType<typeof vi.fn>; reschedule: ReturnType<typeof vi.fn> }
  manager: ColumnManager
  ids: string[]
}

function setup(urls: string[] = []): Setup {
  const store = new ConfigStore(dir, schema, defaultConfig())
  const scheduler = { setTargets: vi.fn(), reschedule: vi.fn() }
  const manager = new ColumnManager({
    window: {
      getContentBounds: () => ({ x: 0, y: 0, width: 1600, height: 1000 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    } as unknown as Electron.BaseWindow,
    session: {} as Electron.Session,
    store,
    scheduler: scheduler as unknown as RefreshScheduler,
    extraOrigins: [],
    send: vi.fn()
  })
  manager.init()
  for (const url of urls) expect(manager.add(url).ok).toBe(true)
  const ids = manager.list().map((c) => c.id)
  return { store, scheduler, manager, ids }
}

const saved = (): Column[] => loadConfig(dir, schema).config.columns

describe('nextZoomFactor', () => {
  it.each([
    [1, 'in', 1.1],
    [1, 'out', 0.9],
    [0.7, 'in', 0.8],
    [1.4, 'in', 1.5],
    [1.5, 'in', 1.5],
    [1.45, 'in', 1.5],
    [0.5, 'out', 0.5],
    [0.55, 'out', 0.5],
    [1.3, 'reset', 1],
    [0.5, 'reset', 1]
  ] as const)('%d を %s すると %d', (current, action, expected) => {
    expect(nextZoomFactor(current, action)).toBe(expected)
  })
})

describe('ColumnManager.update', () => {
  it('タイトル・幅・間隔・ズーム・paused を反映して保存する', () => {
    const { manager, ids, scheduler } = setup(['https://x.com/home'])
    manager.update(ids[0], {
      title: '技術ニュース',
      width: 480,
      refreshIntervalSec: 300,
      zoomFactor: 0.9,
      paused: true
    })
    expect(saved()[0]).toMatchObject({
      title: '技術ニュース',
      width: 480,
      refreshIntervalSec: 300,
      zoomFactor: 0.9,
      paused: true
    })
    expect(manager.orderedViews()[0].data).toEqual(saved()[0])
    expect(scheduler.reschedule).toHaveBeenCalledWith(ids[0])
  })

  it('間隔が変わらなければタイマーを張り直さない', () => {
    const { manager, ids, scheduler } = setup(['https://x.com/home'])
    manager.update(ids[0], { width: 500 })
    expect(scheduler.reschedule).not.toHaveBeenCalled()
  })
})

describe('ColumnManager.reorder', () => {
  const urls = ['https://x.com/a', 'https://x.com/b', 'https://x.com/c']

  it('ids が現在の集合と一致すればその順で保存する', () => {
    const { manager, ids } = setup(urls)
    expect(manager.reorder([ids[1], ids[2], ids[0]])).toBe(true)
    expect(saved().map((c) => c.url)).toEqual([urls[1], urls[2], urls[0]])
    expect(manager.orderedViews().map((v) => v.id)).toEqual([ids[1], ids[2], ids[0]])
  })

  it.each([
    ['不足', (ids: string[]) => [ids[0], ids[1]]],
    ['余分', (ids: string[]) => [...ids, 'c_unknown']],
    ['重複', (ids: string[]) => [ids[0], ids[0], ids[1]]],
    ['未知のID', (ids: string[]) => [ids[0], ids[1], 'c_unknown']]
  ])('%s がある場合は拒否し、保存しない', (_label, make) => {
    const { manager, ids } = setup(urls)
    expect(manager.reorder(make(ids))).toBe(false)
    expect(saved().map((c) => c.url)).toEqual(urls)
  })
})

describe('ColumnManager.setAllPaused', () => {
  it('1回の保存で全カラムの paused を切り替える', () => {
    const { manager, ids, store } = setup(['https://x.com/a', 'https://x.com/b'])
    manager.update(ids[0], { paused: true })
    const spy = vi.spyOn(store, 'update')
    manager.setAllPaused(true)
    expect(spy).toHaveBeenCalledOnce()
    expect(saved().map((c) => c.paused)).toEqual([true, true])
    expect(manager.orderedViews().map((v) => v.data.paused)).toEqual([true, true])
    manager.setAllPaused(false)
    expect(saved().map((c) => c.paused)).toEqual([false, false])
  })
})

describe('ColumnManager.togglePauseAll', () => {
  it('停止していないカラムがあれば全停止、全停止中なら全再開', () => {
    const { manager, ids } = setup(['https://x.com/a', 'https://x.com/b'])
    manager.update(ids[0], { paused: true })
    manager.togglePauseAll()
    expect(saved().map((c) => c.paused)).toEqual([true, true])
    manager.togglePauseAll()
    expect(saved().map((c) => c.paused)).toEqual([false, false])
  })
})

describe('ColumnManager defaults', () => {
  it('デフォルト値の変更は既存カラムを変えず、新規カラムにのみ適用される', () => {
    const { manager } = setup(['https://x.com/a'])
    expect(manager.updateDefaults({ columnWidth: 420, zoomFactor: 1.2 })).toEqual({
      columnWidth: 420,
      refreshIntervalSec: 120,
      zoomFactor: 1.2
    })
    expect(manager.getDefaults().columnWidth).toBe(420)
    manager.add('https://x.com/b')
    expect(saved().map((c) => [c.width, c.refreshIntervalSec, c.zoomFactor])).toEqual([
      [380, 120, 1],
      [420, 120, 1.2]
    ])
    expect(loadConfig(dir, schema).config.defaults.columnWidth).toBe(420)
  })
})

describe('ColumnManager.addListFromPicker', () => {
  it('リストのページなら入力時と同じ規則でリストカラムを追加・保存する', () => {
    const { manager } = setup(['https://x.com/home'])
    const result = manager.addListFromPicker('https://x.com/i/lists/1234567890?s=20')
    expect(result.ok).toBe(true)
    expect(saved()[1]).toMatchObject({
      type: 'list',
      url: 'https://x.com/i/lists/1234567890',
      title: 'リスト 1234567890',
      width: 380,
      refreshIntervalSec: 120,
      zoomFactor: 1,
      paused: false
    })
  })

  it.each(['https://x.com/i/lists/1234567890/members', 'https://x.com/home', ''])(
    'リスト以外のページ %j では追加せずエラーを返す',
    (url) => {
      const { manager } = setup()
      expect(manager.addListFromPicker(url)).toEqual({
        ok: false,
        error: '追加したいリストを開いてください'
      })
      expect(manager.list()).toEqual([])
    }
  )
})
