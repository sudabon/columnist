import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AddColumnResult } from '../../shared/types'

interface Props {
  onSubmit(input: string): Promise<AddColumnResult>
  /** 値が変わるたびに入力欄へフォーカスする(Cmd+T 用。0 は初期値で何もしない) */
  focusSignal: number
}

/**
 * カラム追加フォーム。カラムビュー(ネイティブビュー)の下に隠れないよう、
 * モーダルではなくツールバー内にインラインで表示する。
 */
function AddColumnDialog({ onSubmit, focusSignal }: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const result = await onSubmit(input)
      if (result.ok) {
        setInput('')
        setError(null)
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-column" onSubmit={(e) => void submit(e)}>
      <input
        ref={inputRef}
        aria-label="カラムを追加"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setError(null)
        }}
        placeholder="リストID / @ユーザー / search:語句 / home / URL"
        spellCheck={false}
      />
      <button type="submit" disabled={busy || input.trim() === ''}>
        ＋ 追加
      </button>
      {error && (
        <span className="add-column-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

export default AddColumnDialog
