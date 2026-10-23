export type ColumnType = 'list' | 'search' | 'home' | 'profile' | 'custom'

export interface Column {
  id: string
  title: string
  type: ColumnType
  url: string
  width: number
  refreshIntervalSec: number
  zoomFactor: number
  paused: boolean
}

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
}

export interface Defaults {
  columnWidth: number
  refreshIntervalSec: number
  zoomFactor: number
}

export interface Config {
  version: 1
  window: WindowState
  defaults: Defaults
  columns: Column[]
}

export type ColumnPatch = Partial<
  Pick<Column, 'title' | 'width' | 'refreshIntervalSec' | 'zoomFactor' | 'paused'>
>

export type DefaultsPatch = Partial<Defaults>

export interface ColumnStatus {
  id: string
  lastRefreshedAt: number | null
  isOnBaseUrl: boolean
  canGoBack: boolean
}

export interface LayoutMetrics {
  totalWidth: number
  viewportWidth: number
  scrollX: number
}

export type NavigateAction = 'back' | 'home'

/** リスト選択画面の状態。canAdd はリストのページを表示している間だけ true */
export interface PickerState {
  open: boolean
  canAdd: boolean
}

export type AddColumnResult = { ok: true; column: Column } | { ok: false; error: string }

/** preload がシェルに公開する API(window.columnist) */
export interface ColumnistApi {
  listColumns(): Promise<Column[]>
  addColumn(input: string): Promise<AddColumnResult>
  removeColumn(id: string): Promise<void>
  updateColumn(id: string, patch: ColumnPatch): Promise<void>
  reorderColumns(ids: string[]): Promise<void>
  pauseAll(paused: boolean): Promise<void>
  refreshColumn(id: string | 'all'): Promise<void>
  navigateColumn(id: string, action: NavigateAction): Promise<void>
  scroll(scrollX: number): void
  getDefaults(): Promise<Defaults>
  updateDefaults(patch: DefaultsPatch): Promise<void>
  onColumnsChanged(listener: (columns: Column[]) => void): () => void
  onColumnStatus(listener: (status: ColumnStatus) => void): () => void
  onLayoutMetrics(listener: (metrics: LayoutMetrics) => void): () => void
  onFocusAddColumn(listener: () => void): () => void
  openPicker(): Promise<void>
  closePicker(): Promise<void>
  addFromPicker(): Promise<AddColumnResult>
  onPickerState(listener: (state: PickerState) => void): () => void
}
