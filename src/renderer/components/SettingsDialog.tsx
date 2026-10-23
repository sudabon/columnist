import { useState, type FormEvent } from 'react'
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  REFRESH_INTERVAL_MAX_SEC,
  REFRESH_INTERVAL_MIN_SEC,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN
} from '../../shared/constants'

export interface SettingsValues {
  width: number
  refreshIntervalSec: number
  zoomFactor: number
}

interface Props {
  /** 何の設定かを表す見出し(例: 「技術ニュース」の設定) */
  label: string
  initial: SettingsValues
  onSave(values: SettingsValues): Promise<void>
  onClose(): void
}

type Fields = Record<keyof SettingsValues, string>

/** 入力値を検証する。範囲外・数値でない場合はエラーメッセージを返す */
function validateSettings(fields: Fields): { values: SettingsValues } | { error: string } {
  const width = Number(fields.width)
  if (fields.width.trim() === '' || !Number.isInteger(width)) {
    return { error: '幅は整数で入力してください' }
  }
  if (width < COLUMN_WIDTH_MIN || width > COLUMN_WIDTH_MAX) {
    return { error: `幅は ${COLUMN_WIDTH_MIN}〜${COLUMN_WIDTH_MAX}px で入力してください` }
  }
  const interval = Number(fields.refreshIntervalSec)
  if (fields.refreshIntervalSec.trim() === '' || !Number.isInteger(interval)) {
    return { error: '更新間隔は整数で入力してください' }
  }
  if (interval < REFRESH_INTERVAL_MIN_SEC || interval > REFRESH_INTERVAL_MAX_SEC) {
    return {
      error: `更新間隔は ${REFRESH_INTERVAL_MIN_SEC}〜${REFRESH_INTERVAL_MAX_SEC} 秒で入力してください`
    }
  }
  const zoom = Number(fields.zoomFactor)
  if (fields.zoomFactor.trim() === '' || !Number.isFinite(zoom)) {
    return { error: 'ズームは数値で入力してください' }
  }
  if (zoom < ZOOM_FACTOR_MIN || zoom > ZOOM_FACTOR_MAX) {
    return { error: `ズームは ${ZOOM_FACTOR_MIN}〜${ZOOM_FACTOR_MAX} で入力してください` }
  }
  return { values: { width, refreshIntervalSec: interval, zoomFactor: zoom } }
}

/**
 * 幅・更新間隔・ズームの設定フォーム(カラム設定とデフォルト設定で共用)。
 * カラムビュー(ネイティブビュー)の下に隠れないよう、ツールバー内にインラインで表示する。
 */
function SettingsDialog({ label, initial, onSave, onClose }: Props): React.JSX.Element {
  const [fields, setFields] = useState<Fields>({
    width: String(initial.width),
    refreshIntervalSec: String(initial.refreshIntervalSec),
    zoomFactor: String(initial.zoomFactor)
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    const result = validateSettings(fields)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setBusy(true)
    try {
      await onSave(result.values)
      onClose()
    } catch {
      setError('設定を保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const field = (
    key: keyof Fields,
    name: string,
    unit: string,
    step: string
  ): React.JSX.Element => (
    <label className="settings-field">
      {name}
      <input
        aria-label={name}
        type="number"
        step={step}
        value={fields[key]}
        onChange={(e) => {
          setFields((prev) => ({ ...prev, [key]: e.target.value }))
          setError(null)
        }}
      />
      {unit}
    </label>
  )

  return (
    <form
      className="settings-dialog"
      aria-label={label}
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <span className="settings-label">{label}</span>
      {field('width', '幅', 'px', '1')}
      {field('refreshIntervalSec', '更新間隔', '秒', '1')}
      {field('zoomFactor', 'ズーム', '倍', '0.05')}
      <button type="submit" disabled={busy}>
        保存
      </button>
      <button type="button" onClick={onClose}>
        キャンセル
      </button>
      {error && (
        <span className="settings-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

export default SettingsDialog
