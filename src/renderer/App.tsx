import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier
} from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import type { Column, ColumnStatus, Defaults, LayoutMetrics, PickerState } from '../shared/types'
import ColumnHeader from './components/ColumnHeader'
import HorizontalScroller from './components/HorizontalScroller'
import SettingsDialog from './components/SettingsDialog'
import Toolbar from './components/Toolbar'

const api = window.columnist

/** ヘッダ帯の中で横方向にだけ動かす */
const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 })

type Panel = { kind: 'column'; id: string } | { kind: 'defaults' } | null

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function App(): React.JSX.Element {
  const [columns, setColumns] = useState<Column[]>([])
  const [statuses, setStatuses] = useState<Record<string, ColumnStatus>>({})
  const [metrics, setMetrics] = useState<LayoutMetrics>({
    totalWidth: 0,
    viewportWidth: 0,
    scrollX: 0
  })
  const [panel, setPanel] = useState<Panel>(null)
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [focusAddSignal, setFocusAddSignal] = useState(0)
  const [picker, setPicker] = useState<PickerState>({ open: false, canAdd: false })
  const now = useNow(15_000)
  // ヘッダのボタンのクリックやタイトルのダブルクリックと区別するため、5px 動かしてからドラッグを始める
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const unsubscribes = [
      api.onColumnsChanged(setColumns),
      api.onColumnStatus((status) => setStatuses((prev) => ({ ...prev, [status.id]: status }))),
      api.onLayoutMetrics(setMetrics),
      api.onPickerState(setPicker),
      api.onFocusAddColumn(() => {
        setPanel(null)
        setFocusAddSignal((n) => n + 1)
      })
    ]
    void api.listColumns().then(setColumns)
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [])

  // デフォルト値は開くたびに main から読み直す
  const openDefaults = (): void => {
    void api.getDefaults().then((d) => {
      if (!d) return
      setDefaults(d)
      setPanel({ kind: 'defaults' })
    })
  }

  const settingsColumn =
    panel?.kind === 'column' ? columns.find((c) => c.id === panel.id) : undefined
  let panelElement: React.JSX.Element | null = null
  if (settingsColumn) {
    panelElement = (
      <SettingsDialog
        key={settingsColumn.id}
        label={`「${settingsColumn.title}」の設定`}
        initial={settingsColumn}
        onSave={(v) => api.updateColumn(settingsColumn.id, v)}
        onClose={() => setPanel(null)}
      />
    )
  } else if (panel?.kind === 'defaults' && defaults) {
    panelElement = (
      <SettingsDialog
        key="defaults"
        label="新規カラムのデフォルト"
        initial={{
          width: defaults.columnWidth,
          refreshIntervalSec: defaults.refreshIntervalSec,
          zoomFactor: defaults.zoomFactor
        }}
        onSave={(v) =>
          api.updateDefaults({
            columnWidth: v.width,
            refreshIntervalSec: v.refreshIntervalSec,
            zoomFactor: v.zoomFactor
          })
        }
        onClose={() => setPanel(null)}
      />
    )
  }

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    const from = columns.findIndex((c) => c.id === active.id)
    const to = columns.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    const next = arrayMove(columns, from, to)
    // 確定した順序をすぐ表示し、main からの columns:changed で正の状態に揃える
    setColumns(next)
    void api.reorderColumns(next.map((c) => c.id))
  }

  return (
    <div className="app">
      <Toolbar
        onAddColumn={(input) => api.addColumn(input)}
        onRefreshAll={() => void api.refreshColumn('all')}
        onPauseAll={(paused) => void api.pauseAll(paused)}
        onOpenDefaults={openDefaults}
        onOpenPicker={() => {
          setPanel(null)
          void api.openPicker()
        }}
        onClosePicker={() => void api.closePicker()}
        onAddFromPicker={() => api.addFromPicker()}
        picker={picker}
        focusAddSignal={focusAddSignal}
        panel={panelElement}
      />
      <div className="header-band">
        <div className="header-track" style={{ transform: `translateX(${-metrics.scrollX}px)` }}>
          <DndContext sensors={sensors} modifiers={[horizontalOnly]} onDragEnd={handleDragEnd}>
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((column) => (
                <ColumnHeader
                  key={column.id}
                  column={column}
                  status={statuses[column.id]}
                  now={now}
                  onRefresh={() => void api.refreshColumn(column.id)}
                  onNavigate={(action) => void api.navigateColumn(column.id, action)}
                  onRemove={() => void api.removeColumn(column.id)}
                  onRename={(title) => void api.updateColumn(column.id, { title })}
                  onTogglePause={() => void api.updateColumn(column.id, { paused: !column.paused })}
                  onOpenSettings={() => setPanel({ kind: 'column', id: column.id })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <main className="column-area">
        {columns.length === 0 && <p className="empty">ツールバーからカラムを追加してください</p>}
      </main>
      <HorizontalScroller metrics={metrics} onScroll={(x) => api.scroll(x)} />
    </div>
  )
}

export default App
