import { z } from 'zod'
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  REFRESH_INTERVAL_MAX_SEC,
  REFRESH_INTERVAL_MIN_SEC,
  TITLE_MAX_LENGTH,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN
} from '../../shared/constants'
import type { Column, ColumnPatch, Config, Defaults, DefaultsPatch } from '../../shared/types'

export const CURRENT_CONFIG_VERSION = 1

export const DEFAULTS: Defaults = { columnWidth: 380, refreshIntervalSec: 120, zoomFactor: 1.0 }

export function defaultConfig(): Config {
  return {
    version: CURRENT_CONFIG_VERSION,
    window: { width: 1600, height: 1000 },
    defaults: { ...DEFAULTS },
    columns: []
  }
}

/** twitter.com 系のホストを x.com に正規化する。URL として解釈できなければそのまま返す */
export function normalizeXUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    const url = new URL(value)
    if (/^(www\.|mobile\.)?twitter\.com$/i.test(url.hostname)) {
      url.hostname = 'x.com'
      return url.href
    }
    return value
  } catch {
    return value
  }
}

const width = z.number().int().min(COLUMN_WIDTH_MIN).max(COLUMN_WIDTH_MAX)
const refreshIntervalSec = z
  .number()
  .int()
  .min(REFRESH_INTERVAL_MIN_SEC)
  .max(REFRESH_INTERVAL_MAX_SEC)
const zoomFactor = z.number().min(ZOOM_FACTOR_MIN).max(ZOOM_FACTOR_MAX)
const title = z.string().max(TITLE_MAX_LENGTH)

export interface ConfigSchemas {
  column: z.ZodType<Column, unknown>
  config: z.ZodType<Config, unknown>
}

export function createConfigSchema(extraOrigins: readonly string[] = []): ConfigSchemas {
  const url = z.preprocess(
    normalizeXUrl,
    z
      .string()
      .refine(
        (v) => v.startsWith('https://x.com/') || extraOrigins.some((o) => v.startsWith(`${o}/`)),
        { message: 'URL は https://x.com/ で始まる必要があります' }
      )
  )

  const column = z.object({
    id: z.string().min(1),
    title,
    type: z.enum(['list', 'search', 'home', 'profile', 'custom']),
    url,
    width,
    refreshIntervalSec,
    zoomFactor,
    paused: z.boolean()
  }) satisfies z.ZodType<Column, unknown>

  const config = z.object({
    version: z.literal(CURRENT_CONFIG_VERSION),
    window: z.object({
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      width: z.number().int().min(200),
      height: z.number().int().min(200)
    }),
    defaults: z.object({ columnWidth: width, refreshIntervalSec, zoomFactor }),
    columns: z.array(column)
  }) satisfies z.ZodType<Config, unknown>

  return { column, config }
}

export const columnPatchSchema = z
  .object({
    // 空のタイトルへの変更は受け付けない(編集前の値を維持する)
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
    width,
    refreshIntervalSec,
    zoomFactor,
    paused: z.boolean()
  })
  .partial()
  .strict() satisfies z.ZodType<ColumnPatch>

export const defaultsPatchSchema = z
  .object({ columnWidth: width, refreshIntervalSec, zoomFactor })
  .partial()
  .strict() satisfies z.ZodType<DefaultsPatch>
