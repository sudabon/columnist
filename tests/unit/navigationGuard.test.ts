import { describe, expect, it } from 'vitest'
import { isAllowedUrl, isExternallyOpenable } from '../../src/main/columns/navigationGuard'

describe('isAllowedUrl', () => {
  it.each([
    ['https://x.com/home', true],
    ['https://x.com/user/status/1', true],
    ['https://api.x.com/1.1/x', true],
    ['https://X.COM/home', true],
    ['http://x.com/home', false],
    ['https://twitter.com/home', false],
    ['https://example.com/', false],
    ['https://x.com.evil.test/', false],
    ['https://evilx.com/', false],
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['not a url', false]
  ])('%s → %s', (url, expected) => {
    expect(isAllowedUrl(url)).toBe(expected)
  })

  it('テスト用オリジンは指定時のみ許可する', () => {
    expect(isAllowedUrl('http://127.0.0.1:4173/timeline.html')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:4173/timeline.html', ['http://127.0.0.1:4173'])).toBe(
      true
    )
    expect(isAllowedUrl('http://127.0.0.1:9999/', ['http://127.0.0.1:4173'])).toBe(false)
  })
})

describe('isExternallyOpenable', () => {
  it.each([
    ['https://example.com/', true],
    ['http://example.com/', true],
    ['file:///etc/passwd', false],
    ['mailto:a@example.com', false],
    ['custom-scheme://x', false],
    ['', false]
  ])('%s → %s', (url, expected) => {
    expect(isExternallyOpenable(url)).toBe(expected)
  })
})
