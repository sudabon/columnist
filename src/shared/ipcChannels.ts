/** IPC チャネル名(spec.md 6)。チャネルはここでのみ定義する */
export const IpcChannels = {
  // shell → main
  columnsList: 'columns:list',
  columnsAdd: 'columns:add',
  columnsRemove: 'columns:remove',
  columnsUpdate: 'columns:update',
  columnsReorder: 'columns:reorder',
  /** spec.md 6 に未記載の追加。全カラムの paused を1回の保存でまとめて切り替える */
  columnsPauseAll: 'columns:pauseAll',
  columnsRefresh: 'columns:refresh',
  columnsNavigate: 'columns:navigate',
  layoutScroll: 'layout:scroll',
  /** spec.md 6 に未記載の追加。新規カラム用のデフォルト値の読み書きにのみ使う */
  defaultsGet: 'defaults:get',
  defaultsUpdate: 'defaults:update',
  /** リスト選択画面の開閉と、表示中のリストの追加 */
  pickerOpen: 'picker:open',
  pickerClose: 'picker:close',
  pickerAdd: 'picker:add',
  // main → shell
  columnsChanged: 'columns:changed',
  columnStatus: 'column:status',
  layoutMetrics: 'layout:metrics',
  /** spec.md 6 に未記載の追加。メニューの Cmd+T でカラム追加の入力欄にフォーカスさせる */
  uiFocusAddColumn: 'ui:focusAddColumn',
  /** リスト選択画面の開閉状態と、表示中のページを追加できるか(URL 自体は送らない) */
  pickerState: 'picker:state'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
