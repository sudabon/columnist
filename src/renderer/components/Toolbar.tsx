import { useState, type ReactNode } from 'react'
import { LIST_PICKER_HINT } from '../../shared/constants'
import type { AddColumnResult, PickerState } from '../../shared/types'
import AddColumnDialog from './AddColumnDialog'

interface Props {
  onAddColumn(input: string): Promise<AddColumnResult>
  onRefreshAll(): void
  onPauseAll(paused: boolean): void
  onOpenDefaults(): void
  onOpenPicker(): void
  onClosePicker(): void
  onAddFromPicker(): Promise<AddColumnResult>
  picker: PickerState
  focusAddSignal: number
  /** 設定ダイアログを開いている間は、カラム追加フォームの代わりに表示する */
  panel: ReactNode
}

function Toolbar({
  onAddColumn,
  onRefreshAll,
  onPauseAll,
  onOpenDefaults,
  onOpenPicker,
  onClosePicker,
  onAddFromPicker,
  picker,
  focusAddSignal,
  panel
}: Props): React.JSX.Element {
  const [adding, setAdding] = useState(false)

  const addFromPicker = async (): Promise<void> => {
    if (adding) return
    setAdding(true)
    try {
      // 失敗時(押下時点でリスト以外へ遷移していた)は picker:state で案内が表示される
      await onAddFromPicker()
    } finally {
      setAdding(false)
    }
  }

  // リスト選択画面を開いている間は、追加フォームの代わりに選択中の操作を表示する
  const main = picker.open ? (
    <div className="list-picker-bar">
      <button
        type="button"
        onClick={() => void addFromPicker()}
        disabled={!picker.canAdd || adding}
      >
        このリストを追加
      </button>
      <button type="button" onClick={onClosePicker}>
        キャンセル
      </button>
      {!picker.canAdd && <span className="list-picker-hint">{LIST_PICKER_HINT}</span>}
    </div>
  ) : (
    (panel ?? (
      <>
        <AddColumnDialog onSubmit={onAddColumn} focusSignal={focusAddSignal} />
        <button type="button" onClick={onOpenPicker} title="x.com の画面で開いたリストを追加">
          リストから選ぶ
        </button>
      </>
    ))
  )

  return (
    <header className="toolbar">
      <span className="app-name">Columnist</span>
      {main}
      <div className="toolbar-actions">
        <button type="button" onClick={() => onPauseAll(true)} title="全カラムの自動更新を一時停止">
          ⏸ 全カラム一時停止
        </button>
        <button type="button" onClick={() => onPauseAll(false)} title="全カラムの自動更新を再開">
          ▶ 全カラム再開
        </button>
        {!picker.open && (
          <button type="button" onClick={onRefreshAll} title="全カラム更新">
            ↻ 全カラム更新
          </button>
        )}
        <button type="button" onClick={onOpenDefaults} title="新規カラムのデフォルト設定">
          ⚙ デフォルト設定
        </button>
      </div>
    </header>
  )
}

export default Toolbar
