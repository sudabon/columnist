import type { WebContents } from 'electron'
import { shell } from 'electron'

/** カラム内で表示してよい URL か。x.com とそのサブドメイン(https)、およびテスト用の追加オリジンのみ */
export function isAllowedUrl(raw: string, extraOrigins: readonly string[] = []): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (extraOrigins.includes(url.origin)) return true
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return host === 'x.com' || host.endsWith('.x.com')
}

/** 既定ブラウザで開いてよい URL か(http / https のみ) */
export function isExternallyOpenable(raw: string): boolean {
  try {
    const { protocol } = new URL(raw)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function openExternal(url: string): void {
  if (isExternallyOpenable(url)) void shell.openExternal(url)
}

/**
 * x.com 以外への遷移・リダイレクトを止めて既定ブラウザへ回し、新規ウィンドウはすべて拒否する(spec.md 5.4)
 */
export function attachNavigationGuard(wc: WebContents, extraOrigins: readonly string[]): void {
  wc.on('will-navigate', (event) => {
    if (isAllowedUrl(event.url, extraOrigins)) return
    event.preventDefault()
    openExternal(event.url)
  })
  wc.on('will-redirect', (event) => {
    if (!event.isMainFrame || isAllowedUrl(event.url, extraOrigins)) return
    event.preventDefault()
    openExternal(event.url)
  })
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
}
