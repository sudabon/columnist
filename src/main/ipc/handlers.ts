import type { IpcMain } from 'electron'
import { z } from 'zod'
import { LIST_PICKER_HINT } from '../../shared/constants'
import { IpcChannels } from '../../shared/ipcChannels'
import type { ColumnManager } from '../columns/ColumnManager'
import type { ListPicker } from '../columns/ListPicker'
import { columnPatchSchema, defaultsPatchSchema } from '../config/schema'

interface SenderEvent {
  sender: { id: number }
}

/**
 * シェルビュー以外からのメッセージと、ペイロードが不正なメッセージを無視するラッパーを作る(spec.md 5.7)
 */
export function createGuard(getShellId: () => number | null) {
  return function guard<T, R>(schema: z.ZodType<T>, fn: (payload: T) => R) {
    return (event: SenderEvent, payload?: unknown): R | undefined => {
      const shellId = getShellId()
      if (shellId === null || event.sender.id !== shellId) return undefined
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return undefined
      return fn(parsed.data)
    }
  }
}

const id = z.string().min(1)

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getShellId: () => number | null,
  getManager: () => ColumnManager | null,
  /** ログイン前(カラム画面に移る前)は null */
  getPicker: () => ListPicker | null
): void {
  const guard = createGuard(getShellId)

  ipcMain.handle(
    IpcChannels.columnsList,
    guard(z.undefined(), () => {
      const manager = getManager()
      if (!manager) return []
      // 一覧の応答後に、ヘッダ表示用の状態とレイアウトも送り直す
      setImmediate(() => manager.broadcastAll())
      return manager.list()
    })
  )
  ipcMain.handle(
    IpcChannels.columnsAdd,
    guard(z.object({ input: z.string().max(2048) }), ({ input }) => {
      const manager = getManager()
      if (!manager) return { ok: false, error: 'ログイン後にカラムを追加できます' }
      return manager.add(input)
    })
  )
  ipcMain.handle(
    IpcChannels.columnsRemove,
    guard(z.object({ id }), (p) => getManager()?.remove(p.id))
  )
  ipcMain.handle(
    IpcChannels.columnsUpdate,
    guard(z.object({ id, patch: columnPatchSchema }), (p) => getManager()?.update(p.id, p.patch))
  )
  ipcMain.handle(
    IpcChannels.columnsReorder,
    guard(z.object({ ids: z.array(id).max(1000) }), (p) => {
      getManager()?.reorder(p.ids)
    })
  )
  ipcMain.handle(
    IpcChannels.columnsPauseAll,
    guard(z.object({ paused: z.boolean() }), (p) => getManager()?.setAllPaused(p.paused))
  )
  ipcMain.handle(
    IpcChannels.columnsRefresh,
    guard(z.object({ id }), (p) => getManager()?.refresh(p.id))
  )
  ipcMain.handle(
    IpcChannels.columnsNavigate,
    guard(z.object({ id, action: z.enum(['back', 'home']) }), (p) =>
      getManager()?.navigate(p.id, p.action)
    )
  )
  ipcMain.on(
    IpcChannels.layoutScroll,
    guard(z.object({ scrollX: z.number().finite() }), (p) => getManager()?.setScroll(p.scrollX))
  )
  ipcMain.handle(
    IpcChannels.defaultsGet,
    guard(z.undefined(), () => getManager()?.getDefaults())
  )
  ipcMain.handle(
    IpcChannels.defaultsUpdate,
    guard(z.object({ patch: defaultsPatchSchema }), (p) => {
      getManager()?.updateDefaults(p.patch)
    })
  )
  // 二重オープンは ListPicker.open が無視する
  ipcMain.handle(
    IpcChannels.pickerOpen,
    guard(z.undefined(), () => getPicker()?.open())
  )
  ipcMain.handle(
    IpcChannels.pickerClose,
    guard(z.undefined(), () => getPicker()?.close())
  )
  ipcMain.handle(
    IpcChannels.pickerAdd,
    guard(z.undefined(), () => {
      const manager = getManager()
      const url = getPicker()?.currentUrl()
      if (!manager || !url) return { ok: false, error: LIST_PICKER_HINT }
      // 状態通知との競合に備え、押下時点の URL で判定し直す
      const result = manager.addListFromPicker(url)
      if (result.ok) getPicker()?.close()
      return result
    })
  )
}
