import { useEffect, useRef } from 'react'
import type { LayoutMetrics } from '../../shared/types'

interface Props {
  metrics: LayoutMetrics
  onScroll(scrollX: number): void
}

/** 最下部の横スクロールバー。スクロール位置を requestAnimationFrame で間引いて main に送る */
function HorizontalScroller({ metrics, onScroll }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)

  // main 側で補正されたスクロール位置(カラム追加・削除・リサイズ時)に合わせる
  useEffect(() => {
    const el = ref.current
    if (el && Math.abs(el.scrollLeft - metrics.scrollX) > 1) el.scrollLeft = metrics.scrollX
  }, [metrics.scrollX, metrics.totalWidth])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  const handleScroll = (): void => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (ref.current) onScroll(ref.current.scrollLeft)
    })
  }

  return (
    <div ref={ref} className="hscroll" onScroll={handleScroll} data-testid="horizontal-scroller">
      <div style={{ width: metrics.totalWidth, height: 1 }} />
    </div>
  )
}

export default HorizontalScroller
