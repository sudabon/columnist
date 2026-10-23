import { useSortable } from '@dnd-kit/sortable'
import { useState } from 'react'
import { TITLE_MAX_LENGTH } from '../../shared/constants'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import type { Column, ColumnStatus, NavigateAction } from '../../shared/types'

interface Props {
  column: Column
  status: ColumnStatus | undefined
  now: number
  onRefresh(): void
  onNavigate(action: NavigateAction): void
  onRemove(): void
  onRename(title: string): void
  onTogglePause(): void
  onOpenSettings(): void
}

function TitleEditor({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit(title: string): void
  onCancel(): void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  // Enter と blur の両方で確定が走らないよう、一度だけ処理する
  const [done, setDone] = useState(false)
  const finish = (commit: boolean): void => {
    if (done) return
    setDone(true)
    const title = value.trim()
    if (commit && title !== '' && title !== initial) onCommit(title)
    else onCancel()
  }
  return (
    <input
      className="column-title-input"
      aria-label="タイトル"
      value={value}
      maxLength={TITLE_MAX_LENGTH}
      autoFocus
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
    />
  )
}

function ColumnHeader({
  column,
  status,
  now,
  onRefresh,
  onNavigate,
  onRemove,
  onRename,
  onTogglePause,
  onOpenSettings
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  // 編集中はドラッグを無効にし、入力欄でのテキスト選択と競合させない
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: editing
  })
  const offBase = status !== undefined && !status.isOnBaseUrl
  const className = [
    'column-header',
    column.paused ? 'paused' : '',
    isDragging ? 'dragging' : ''
  ].join(' ')

  return (
    <div
      ref={setNodeRef}
      className={className.trim()}
      style={{
        width: column.width,
        transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined,
        transition
      }}
      data-column-id={column.id}
      // 並べ替えはポインタのドラッグのみで行う。dnd-kit の attributes(role=button・aria-disabled 等)は
      // 編集中にヘッダ内の入力欄やボタンまで無効扱いにしてしまうため付けない
      {...listeners}
      role="group"
      aria-roledescription="カラムヘッダ"
      aria-label={column.title}
    >
      {editing ? (
        <TitleEditor
          initial={column.title}
          onCommit={(title) => {
            setEditing(false)
            onRename(title)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span
          className="column-title"
          title={`${column.url}(ダブルクリックで名前を変更)`}
          onDoubleClick={() => setEditing(true)}
        >
          {column.title}
        </span>
      )}
      {column.paused && <span className="column-paused-badge">停止中</span>}
      <span className="column-updated">
        {formatRelativeTime(status?.lastRefreshedAt ?? null, now)}
      </span>
      <div className="column-actions">
        {offBase && (
          <>
            <button
              type="button"
              title="戻る"
              aria-label="戻る"
              disabled={!status.canGoBack}
              onClick={() => onNavigate('back')}
            >
              ←
            </button>
            <button
              type="button"
              title="先頭へ"
              aria-label="先頭へ"
              onClick={() => onNavigate('home')}
            >
              ⌂
            </button>
          </>
        )}
        <button
          type="button"
          title={column.paused ? '自動更新を再開' : '自動更新を一時停止'}
          aria-label={column.paused ? '再開' : '一時停止'}
          aria-pressed={column.paused}
          onClick={onTogglePause}
        >
          {column.paused ? '▶' : '⏸'}
        </button>
        <button type="button" title="更新" aria-label="更新" onClick={onRefresh}>
          ↻
        </button>
        <button type="button" title="カラム設定" aria-label="設定" onClick={onOpenSettings}>
          ⚙
        </button>
        <button type="button" title="削除" aria-label="削除" onClick={onRemove}>
          ×
        </button>
      </div>
    </div>
  )
}

export default ColumnHeader
