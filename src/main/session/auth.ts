import type { Cookie, Session } from 'electron'

export const AUTH_COOKIE_NAME = 'auth_token'

/**
 * ログイン済みかどうかを auth_token cookie の有無だけで判定する(spec.md 5.1)。
 * cookie の値は参照も保存もしない。
 */
export async function hasAuthCookie(ses: Session, domain: string): Promise<boolean> {
  const cookies = await ses.cookies.get({ name: AUTH_COOKIE_NAME, domain })
  return cookies.length > 0
}

function matchesDomain(cookie: Cookie, domain: string): boolean {
  const cookieDomain = (cookie.domain ?? '').replace(/^\./, '')
  return cookieDomain === domain || cookieDomain.endsWith(`.${domain}`)
}

/** auth_token cookie が追加されるまで待つ。返り値の関数で待機を取り消せる */
export function onAuthCookieAdded(ses: Session, domain: string, listener: () => void): () => void {
  const handler = (_event: unknown, cookie: Cookie, _cause: string, removed: boolean): void => {
    if (removed || cookie.name !== AUTH_COOKIE_NAME || !matchesDomain(cookie, domain)) return
    ses.cookies.removeListener('changed', handler)
    listener()
  }
  ses.cookies.on('changed', handler)
  return () => ses.cookies.removeListener('changed', handler)
}
