import { describe, expect, it, vi } from 'vitest'
import type { ColumnManager } from '../../src/main/columns/ColumnManager'
import type { ListPicker } from '../../src/main/columns/ListPicker'
import { registerIpcHandlers } from '../../src/main/ipc/handlers'
import { IpcChannels } from '../../src/shared/ipcChannels'

type Handler = (event: { sender: { id: number } }, payload?: unknown) => unknown

const SHELL_ID = 7

function setup(options: { loggedIn?: boolean; pickerUrl?: string | null } = {}): {
  manager: Record<
    'update' | 'reorder' | 'setAllPaused' | 'getDefaults' | 'updateDefaults' | 'addListFromPicker',
    ReturnType<typeof vi.fn>
  >
  picker: Record<'open' | 'close' | 'currentUrl', ReturnType<typeof vi.fn>>
  call(channel: string, payload?: unknown, sender?: number): unknown
} {
  const { loggedIn = true, pickerUrl = null } = options
  const handlers = new Map<string, Handler>()
  const ipcMain = {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn)
  }
  const manager = {
    update: vi.fn(),
    reorder: vi.fn(() => true),
    setAllPaused: vi.fn(),
    getDefaults: vi.fn(() => ({ columnWidth: 380, refreshIntervalSec: 120, zoomFactor: 1 })),
    updateDefaults: vi.fn(),
    addListFromPicker: vi.fn((url: string) =>
      url.includes('/i/lists/') ? { ok: true, column: {} } : { ok: false, error: 'x' }
    )
  }
  const picker = { open: vi.fn(), close: vi.fn(), currentUrl: vi.fn(() => pickerUrl) }
  registerIpcHandlers(
    ipcMain as unknown as Electron.IpcMain,
    () => SHELL_ID,
    () => (loggedIn ? (manager as unknown as ColumnManager) : null),
    () => (loggedIn ? (picker as unknown as ListPicker) : null)
  )
  const call = (channel: string, payload?: unknown, sender = SHELL_ID): unknown =>
    handlers.get(channel)!({ sender: { id: sender } }, payload)
  return { manager, picker, call }
}

describe('columns:update', () => {
  it('範囲内の部分 patch を渡す', () => {
    const { manager, call } = setup()
    call(IpcChannels.columnsUpdate, { id: 'c_1', patch: { width: 480, paused: true } })
    expect(manager.update).toHaveBeenCalledWith('c_1', { width: 480, paused: true })
  })

  it.each([
    { width: 299 },
    { width: 641 },
    { refreshIntervalSec: 30 },
    { refreshIntervalSec: 3601 },
    { zoomFactor: 0.4 },
    { zoomFactor: 1.6 },
    { title: '' },
    { title: 'a'.repeat(101) },
    { url: 'https://x.com/home' }
  ])('範囲外・不正な patch %j は拒否する', (patch) => {
    const { manager, call } = setup()
    call(IpcChannels.columnsUpdate, { id: 'c_1', patch })
    expect(manager.update).not.toHaveBeenCalled()
  })
})

describe('columns:reorder / columns:pauseAll', () => {
  it('ids の配列を渡す', () => {
    const { manager, call } = setup()
    call(IpcChannels.columnsReorder, { ids: ['b', 'a'] })
    expect(manager.reorder).toHaveBeenCalledWith(['b', 'a'])
    call(IpcChannels.columnsReorder, { ids: 'a' })
    expect(manager.reorder).toHaveBeenCalledOnce()
  })

  it('paused を渡し、シェル以外からは無視する', () => {
    const { manager, call } = setup()
    call(IpcChannels.columnsPauseAll, { paused: true })
    call(IpcChannels.columnsPauseAll, { paused: false }, 99)
    expect(manager.setAllPaused).toHaveBeenCalledExactlyOnceWith(true)
  })
})

describe('defaults:get / defaults:update', () => {
  it('現在のデフォルト値を返す', () => {
    const { call } = setup()
    expect(call(IpcChannels.defaultsGet)).toEqual({
      columnWidth: 380,
      refreshIntervalSec: 120,
      zoomFactor: 1
    })
  })

  it('範囲内の patch のみ渡す', () => {
    const { manager, call } = setup()
    call(IpcChannels.defaultsUpdate, { patch: { columnWidth: 420 } })
    call(IpcChannels.defaultsUpdate, { patch: { columnWidth: 700 } })
    call(IpcChannels.defaultsUpdate, { patch: { refreshIntervalSec: 30 } })
    expect(manager.updateDefaults).toHaveBeenCalledExactlyOnceWith({ columnWidth: 420 })
  })
})

describe('picker:open / picker:close / picker:add', () => {
  it('シェルからの要求で開閉し、シェル以外からは無視する', () => {
    const { picker, call } = setup()
    call(IpcChannels.pickerOpen)
    call(IpcChannels.pickerOpen, undefined, 99)
    call(IpcChannels.pickerClose)
    expect(picker.open).toHaveBeenCalledOnce()
    expect(picker.close).toHaveBeenCalledOnce()
  })

  it('ログイン前は開かず、追加もしない', () => {
    const { manager, picker, call } = setup({ loggedIn: false })
    call(IpcChannels.pickerOpen)
    expect(call(IpcChannels.pickerAdd)).toMatchObject({ ok: false })
    expect(picker.open).not.toHaveBeenCalled()
    expect(manager.addListFromPicker).not.toHaveBeenCalled()
  })

  it('押下時点の URL で追加し、成功したときだけ閉じる', () => {
    const ok = setup({ pickerUrl: 'https://x.com/i/lists/1' })
    expect(ok.call(IpcChannels.pickerAdd)).toMatchObject({ ok: true })
    expect(ok.manager.addListFromPicker).toHaveBeenCalledWith('https://x.com/i/lists/1')
    expect(ok.picker.close).toHaveBeenCalledOnce()

    const ng = setup({ pickerUrl: 'https://x.com/home' })
    expect(ng.call(IpcChannels.pickerAdd)).toMatchObject({ ok: false })
    expect(ng.picker.close).not.toHaveBeenCalled()
  })

  it('リスト選択画面が閉じていれば追加しない', () => {
    const { manager, call } = setup({ pickerUrl: null })
    expect(call(IpcChannels.pickerAdd)).toMatchObject({ ok: false })
    expect(manager.addListFromPicker).not.toHaveBeenCalled()
  })
})
