import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '../shared/ipcChannels'
import type { ColumnistApi } from '../shared/types'

// シェルビュー専用の preload。IPC チャネルごとの関数だけを公開し、ipcRenderer 自体は渡さない

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: ColumnistApi = {
  listColumns: () => ipcRenderer.invoke(IpcChannels.columnsList),
  addColumn: (input) => ipcRenderer.invoke(IpcChannels.columnsAdd, { input }),
  removeColumn: (id) => ipcRenderer.invoke(IpcChannels.columnsRemove, { id }),
  updateColumn: (id, patch) => ipcRenderer.invoke(IpcChannels.columnsUpdate, { id, patch }),
  reorderColumns: (ids) => ipcRenderer.invoke(IpcChannels.columnsReorder, { ids }),
  pauseAll: (paused) => ipcRenderer.invoke(IpcChannels.columnsPauseAll, { paused }),
  refreshColumn: (id) => ipcRenderer.invoke(IpcChannels.columnsRefresh, { id }),
  navigateColumn: (id, action) => ipcRenderer.invoke(IpcChannels.columnsNavigate, { id, action }),
  scroll: (scrollX) => ipcRenderer.send(IpcChannels.layoutScroll, { scrollX }),
  getDefaults: () => ipcRenderer.invoke(IpcChannels.defaultsGet),
  updateDefaults: (patch) => ipcRenderer.invoke(IpcChannels.defaultsUpdate, { patch }),
  onColumnsChanged: (listener) => subscribe(IpcChannels.columnsChanged, listener),
  onColumnStatus: (listener) => subscribe(IpcChannels.columnStatus, listener),
  onLayoutMetrics: (listener) => subscribe(IpcChannels.layoutMetrics, listener),
  onFocusAddColumn: (listener) => subscribe(IpcChannels.uiFocusAddColumn, () => listener()),
  openPicker: () => ipcRenderer.invoke(IpcChannels.pickerOpen),
  closePicker: () => ipcRenderer.invoke(IpcChannels.pickerClose),
  addFromPicker: () => ipcRenderer.invoke(IpcChannels.pickerAdd),
  onPickerState: (listener) => subscribe(IpcChannels.pickerState, listener)
}

contextBridge.exposeInMainWorld('columnist', api)
