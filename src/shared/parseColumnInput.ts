import { TITLE_MAX_LENGTH, X_ORIGIN } from './constants'
import type { ColumnType } from './types'

export type ParseResult =
  { ok: true; type: ColumnType; url: string; title: string } | { ok: false; error: string }

export interface ParseOptions {
  /** x.com に加えて許可するオリジン(テストビルドの fixture 用) */
  extraOrigins?: readonly string[]
}

interface Rule {
  parse(input: string, options: ParseOptions): ParseResult | null
}

const INVALID_INPUT_ERROR =
  'リストID、リストのURL、@ユーザー名、search:キーワード、home、または x.com のURLを入力してください'
const EMPTY_SEARCH_ERROR = 'search: の後に検索キーワードを入力してください'

/** `twitter.com` / `www.` / `mobile.` を x.com に寄せ、スキームを補って URL として解釈する */
function toXUrl(input: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, '')
  if (host !== 'x.com' && host !== 'twitter.com') return null
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.protocol = 'https:'
  url.hostname = 'x.com'
  url.port = ''
  return url
}

const LIST_PATH = /^\/i\/lists\/(\d+)\/?$/
const USERNAME = /^@([A-Za-z0-9_]{1,15})$/
const SEARCH_PREFIX = /^search:/i

// 判定は上から順に行う。「その他の x.com URL」は最後に置く
const rules: Rule[] = [
  {
    parse(input) {
      if (!/^\d+$/.test(input)) return null
      return {
        ok: true,
        type: 'list',
        url: `https://x.com/i/lists/${input}`,
        title: `リスト ${input}`
      }
    }
  },
  {
    parse(input) {
      // 入力時は x.com に寄せた URL だけを判定する(追加オリジンの URL は従来どおり custom)
      const url = toXUrl(input)
      const list = url ? parseListUrl(url.href) : null
      if (!list) return null
      return { ok: true, type: 'list', url: list.url, title: `リスト ${list.id}` }
    }
  },
  {
    parse(input) {
      const match = input.match(USERNAME)
      if (!match) return null
      return { ok: true, type: 'profile', url: `https://x.com/${match[1]}`, title: `@${match[1]}` }
    }
  },
  {
    parse(input) {
      if (!SEARCH_PREFIX.test(input)) return null
      const keyword = input.replace(SEARCH_PREFIX, '').trim()
      if (keyword === '') return { ok: false, error: EMPTY_SEARCH_ERROR }
      return {
        ok: true,
        type: 'search',
        url: `https://x.com/search?q=${encodeURIComponent(keyword)}&f=live`,
        title: `検索: ${keyword}`
      }
    }
  },
  {
    parse(input) {
      if (input.toLowerCase() !== 'home') return null
      return { ok: true, type: 'home', url: 'https://x.com/home', title: 'ホーム' }
    }
  },
  {
    parse(input, options) {
      const extra = parseExtraOrigin(input, options.extraOrigins ?? [])
      if (extra) return { ok: true, type: 'custom', url: extra.href, title: titleFromPath(extra) }
      const url = toXUrl(input)
      if (!url) return null
      return { ok: true, type: 'custom', url: url.href, title: titleFromPath(url) }
    }
  }
]

function parseExtraOrigin(input: string, extraOrigins: readonly string[]): URL | null {
  if (extraOrigins.length === 0) return null
  try {
    const url = new URL(input)
    return extraOrigins.includes(url.origin) ? url : null
  } catch {
    return null
  }
}

function titleFromPath(url: URL): string {
  const path = url.pathname.replace(/\/$/, '')
  return path === '' ? 'x.com' : path.slice(1)
}

/**
 * リストのページ(`https://x.com/i/lists/<数字>`)の URL ならリストIDと正規化した URL を返す。
 * 末尾 `/`・クエリ・ハッシュは無視し、下位ページ(`/members` 等)や他ドメインは null。
 * 追加オリジン(テストビルドの fixture 用)では同じパスを判定し、オリジンは保持する
 */
export function parseListUrl(
  raw: string,
  extraOrigins: readonly string[] = []
): { id: string; url: string } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const origin = url.origin === X_ORIGIN || extraOrigins.includes(url.origin) ? url.origin : null
  const match = origin === null ? null : url.pathname.match(LIST_PATH)
  if (!match) return null
  return { id: match[1], url: `${origin}/i/lists/${match[1]}` }
}

/** カラム追加時のユーザー入力を解釈する(spec.md 4.3) */
export function parseColumnInput(raw: string, options: ParseOptions = {}): ParseResult {
  const input = raw.trim()
  if (input === '') return { ok: false, error: INVALID_INPUT_ERROR }
  for (const rule of rules) {
    const result = rule.parse(input, options)
    if (!result) continue
    // 長い検索キーワードや URL から作ったタイトルも保存できるよう上限で切り詰める
    return result.ok ? { ...result, title: result.title.slice(0, TITLE_MAX_LENGTH) } : result
  }
  return { ok: false, error: INVALID_INPUT_ERROR }
}
