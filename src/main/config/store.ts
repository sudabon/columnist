import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import type { Config } from '../../shared/types'
import { CURRENT_CONFIG_VERSION, defaultConfig } from './schema'

export const CONFIG_FILE_NAME = 'config.json'

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/**
 * version N → N+1 への変換関数。version 1 が最初の版なので現時点では空。
 * 版を上げるときは `migrations[1] = (raw) => ({ ...raw, version: 2, ... })` のように追加する。
 */
const migrations: Record<number, Migration> = {}

export class ConfigLoadError extends Error {}

/** 旧版の設定を現行版に順に変換する。未知の新版や version 不明は失敗とする */
export function migrate(
  raw: unknown,
  table: Record<number, Migration> = migrations,
  currentVersion: number = CURRENT_CONFIG_VERSION
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigLoadError('設定がオブジェクトではありません')
  }
  let current = raw as Record<string, unknown>
  let version = current['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ConfigLoadError('version が不正です')
  }
  if (version > currentVersion) {
    throw new ConfigLoadError(`未対応の version です: ${version}`)
  }
  while (version < currentVersion) {
    const step = table[version]
    if (!step) throw new ConfigLoadError(`version ${version} からの変換がありません`)
    current = step(current)
    version = current['version']
    if (typeof version !== 'number') throw new ConfigLoadError('変換後の version が不正です')
  }
  return current
}

export interface LoadResult {
  config: Config
  /** 壊れた設定を退避した場合、その退避先 */
  brokenBackupPath?: string
}

type ConfigSchema = z.ZodType<Config, unknown>

/** 設定を読み込む。存在しなければ既定値、壊れていれば退避して既定値を返す */
export function loadConfig(dir: string, schema: ConfigSchema, now: Date = new Date()): LoadResult {
  const file = path.join(dir, CONFIG_FILE_NAME)
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { config: defaultConfig() }
    throw error
  }
  try {
    return { config: schema.parse(migrate(JSON.parse(text))) }
  } catch {
    const backup = path.join(dir, `config.broken-${formatTimestamp(now)}.json`)
    fs.renameSync(file, backup)
    return { config: defaultConfig(), brokenBackupPath: backup }
  }
}

/** 検証してから一時ファイル経由で原子的に書き込む。検証に失敗した場合は例外を投げ、書き込まない */
export function saveConfig(dir: string, schema: ConfigSchema, config: Config): Config {
  const valid = schema.parse(config)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, CONFIG_FILE_NAME)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(valid, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
  return valid
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

/** メモリ上の設定を保持し、変更のたびに検証・保存する */
export class ConfigStore {
  private config: Config

  constructor(
    private readonly dir: string,
    private readonly schema: ConfigSchema,
    initial: Config
  ) {
    this.config = initial
  }

  get(): Config {
    return this.config
  }

  /** 変更を適用して保存する。検証に失敗した場合は例外を投げ、メモリ上の設定も変更しない */
  update(mutate: (draft: Config) => Config): Config {
    const next = mutate(structuredClone(this.config))
    this.config = saveConfig(this.dir, this.schema, next)
    return this.config
  }
}
