import { describe, expect, it } from 'vitest'
import { parseColumnInput, parseListUrl } from '../../src/shared/parseColumnInput'

describe('parseColumnInput', () => {
  it('数字のみはリストIDとして解釈する', () => {
    expect(parseColumnInput('1234567890')).toEqual({
      ok: true,
      type: 'list',
      url: 'https://x.com/i/lists/1234567890',
      title: 'リスト 1234567890'
    })
  })

  it.each([
    'https://x.com/i/lists/1234567890',
    'https://twitter.com/i/lists/1234567890',
    'x.com/i/lists/1234567890',
    'twitter.com/i/lists/1234567890/',
    'https://mobile.twitter.com/i/lists/1234567890',
    '  https://www.x.com/i/lists/1234567890  '
  ])('リストURL %s を正規化する', (input) => {
    const result = parseColumnInput(input)
    expect(result).toMatchObject({
      ok: true,
      type: 'list',
      url: 'https://x.com/i/lists/1234567890'
    })
  })

  it.each(['@sudabon', '@a', '@abc_DEF_12345'])('ユーザー名 %s は profile にする', (input) => {
    expect(parseColumnInput(input)).toEqual({
      ok: true,
      type: 'profile',
      url: `https://x.com/${input.slice(1)}`,
      title: input
    })
  })

  it.each(['@', '@abcdefghijklmnop', '@foo-bar', '@foo bar'])(
    '不正なユーザー名 %j はエラー',
    (input) => {
      expect(parseColumnInput(input).ok).toBe(false)
    }
  )

  it('search: は検索キーワードを URL エンコードして search にする', () => {
    expect(parseColumnInput('search:electron 開発')).toEqual({
      ok: true,
      type: 'search',
      url: 'https://x.com/search?q=electron%20%E9%96%8B%E7%99%BA&f=live',
      title: '検索: electron 開発'
    })
    expect(parseColumnInput('search:  a&b=c#d ')).toMatchObject({
      url: 'https://x.com/search?q=a%26b%3Dc%23d&f=live'
    })
  })

  it('長い検索キーワードのタイトルは100文字に切り詰める', () => {
    const result = parseColumnInput(`search:${'a'.repeat(200)}`)
    expect(result.ok && result.title.length).toBe(100)
  })

  it.each(['search:', 'search:   '])('空の検索キーワード %j はエラー', (input) => {
    const result = parseColumnInput(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('検索キーワード')
  })

  it.each(['home', 'HOME', ' Home '])('%j はホームにする', (input) => {
    expect(parseColumnInput(input)).toEqual({
      ok: true,
      type: 'home',
      url: 'https://x.com/home',
      title: 'ホーム'
    })
  })

  it('home を含むだけの入力はホームにしない', () => {
    expect(parseColumnInput('homepage').ok).toBe(false)
  })

  it('その他の x.com URL は custom としてそのまま使う', () => {
    expect(parseColumnInput('https://x.com/search?q=electron&f=live')).toMatchObject({
      ok: true,
      type: 'custom',
      url: 'https://x.com/search?q=electron&f=live'
    })
  })

  it('twitter.com の任意URLは x.com に正規化して custom にする', () => {
    expect(parseColumnInput('https://twitter.com/home')).toMatchObject({
      ok: true,
      type: 'custom',
      url: 'https://x.com/home'
    })
  })

  it.each([
    'hello world',
    'https://example.com/',
    '',
    '   ',
    'ftp://x.com/a',
    'https://x.com.evil.test/'
  ])('解釈できない入力 %j はエラー', (input) => {
    const result = parseColumnInput(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toBe('')
  })

  it('追加オリジンは指定時のみ custom として受け付ける', () => {
    const url = 'http://127.0.0.1:4173/timeline.html'
    expect(parseColumnInput(url).ok).toBe(false)
    expect(parseColumnInput(url, { extraOrigins: ['http://127.0.0.1:4173'] })).toMatchObject({
      ok: true,
      type: 'custom',
      url
    })
  })
})

describe('parseListUrl', () => {
  const expected = { id: '1234567890', url: 'https://x.com/i/lists/1234567890' }

  it.each([
    'https://x.com/i/lists/1234567890',
    'https://x.com/i/lists/1234567890/',
    'https://x.com/i/lists/1234567890?s=20',
    'https://x.com/i/lists/1234567890#top'
  ])('%s をリストとして正規化する', (url) => {
    expect(parseListUrl(url)).toEqual(expected)
  })

  it.each([
    'https://x.com/i/lists/1234567890/members',
    'https://x.com/i/lists/1234567890/info',
    'https://x.com/i/lists',
    'https://x.com/i/lists/abc',
    'https://x.com/home',
    'https://example.com/i/lists/1234567890',
    'https://x.com.evil.test/i/lists/1234567890',
    'http://x.com/i/lists/1234567890',
    'not a url'
  ])('%s はリストとして扱わない', (url) => {
    expect(parseListUrl(url)).toBeNull()
  })

  it('追加オリジンは指定時のみ判定し、オリジンを保持する', () => {
    const origin = 'http://127.0.0.1:4173'
    expect(parseListUrl(`${origin}/i/lists/42`)).toBeNull()
    expect(parseListUrl(`${origin}/i/lists/42/?x=1`, [origin])).toEqual({
      id: '42',
      url: `${origin}/i/lists/42`
    })
    expect(parseListUrl(`${origin}/i/lists/42/members`, [origin])).toBeNull()
  })

  it('入力の解釈では追加オリジンのリストURLを従来どおり custom にする', () => {
    const origin = 'http://127.0.0.1:4173'
    expect(parseColumnInput(`${origin}/i/lists/42`, { extraOrigins: [origin] })).toMatchObject({
      type: 'custom'
    })
  })
})
