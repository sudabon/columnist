import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { TOOLBAR_HEIGHT } from '../../src/shared/constants'
import type { ColumnistApi } from '../../src/shared/types'
import {
  addColumn,
  createUserDataDir,
  findPage,
  launchApp,
  login,
  openedExternalUrls,
  readConfig,
  shellPage
} from './app'
import { startFixtureServer } from './fixtureServer'

let server: Awaited<ReturnType<typeof startFixtureServer>>
let userData: ReturnType<typeof createUserDataDir>
let app: ElectronApplication | null = null

test.beforeAll(async () => {
  server = await startFixtureServer()
})
test.afterAll(async () => {
  await server.close()
})
test.beforeEach(() => {
  userData = createUserDataDir()
})
test.afterEach(async () => {
  await app?.close()
  app = null
  userData.cleanup()
})

const timeline = (n: number): string => `${server.origin}/timeline.html?c=${n}`

/**
 * main プロセスから見たリスト選択画面の bounds と URL。
 * カラムビューはヘッダの下に置かれるため、ツールバー直下から始まるビューをリスト選択画面とみなす
 */
async function pickerViews(
  app: ElectronApplication
): Promise<{ url: string; x: number; y: number; width: number; height: number }[]> {
  return app.evaluate(({ BaseWindow }, top) => {
    const win = BaseWindow.getAllWindows()[0]
    return win.contentView.children
      .map((child) => child as Electron.WebContentsView)
      .filter((view) => view.getBounds().y === top)
      .map((view) => ({ url: view.webContents.getURL(), ...view.getBounds() }))
  }, TOOLBAR_HEIGHT)
}

async function openPicker(app: ElectronApplication, shell: Page): Promise<Page> {
  await shell.getByRole('button', { name: 'リストから選ぶ' }).click()
  return findPage(app, (url) => url === `${server.origin}/lists.html`)
}

const addButton = (shell: Page): Locator => shell.getByRole('button', { name: 'このリストを追加' })
const hint = (shell: Page): Locator => shell.getByText('追加したいリストを開いてください')

test('リストを開くと追加でき、「リスト <ID>」として保存されてリスト選択画面が閉じる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))

  const picker = await openPicker(app, shell)
  await expect(addButton(shell)).toBeDisabled()
  await expect(hint(shell)).toBeVisible()
  await expect(shell.getByRole('button', { name: 'キャンセル' })).toBeVisible()
  await expect(shell.getByLabel('カラムを追加')).toHaveCount(0)

  await picker.click('#list-link')
  await expect(addButton(shell)).toBeEnabled()
  await expect(hint(shell)).toHaveCount(0)

  await addButton(shell).click()
  const headers = shell.locator('.column-header')
  await expect(headers).toHaveCount(2)
  await expect(headers.nth(1)).toContainText('リスト 1234567890')
  expect(readConfig(userData.dir).columns[1]).toMatchObject({
    type: 'list',
    url: `${server.origin}/i/lists/1234567890`,
    title: 'リスト 1234567890'
  })
  await expect.poll(() => pickerViews(app!)).toEqual([])
  await expect(shell.getByRole('button', { name: 'リストから選ぶ' })).toBeVisible()
})

test('キャンセルするとカラム構成を変えずに閉じる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const before = readConfig(userData.dir).columns

  const picker = await openPicker(app, shell)
  await picker.click('#list-link')
  await expect(addButton(shell)).toBeEnabled()
  await shell.getByRole('button', { name: 'キャンセル' }).click()

  await expect.poll(() => pickerViews(app!)).toEqual([])
  await expect(shell.locator('.column-header')).toHaveCount(1)
  expect(readConfig(userData.dir).columns).toEqual(before)
})

test('リストの下位ページでは追加できない', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  const picker = await openPicker(app, shell)
  await picker.click('#list-link')
  await expect(addButton(shell)).toBeEnabled()

  await picker.click('#members-link')
  await expect(picker).toHaveURL(`${server.origin}/i/lists/1234567890/members`)
  await expect(addButton(shell)).toBeDisabled()
  await expect(hint(shell)).toBeVisible()
})

test('リスト選択画面の外部リンクは遷移せず既定ブラウザに渡す', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  const picker = await openPicker(app, shell)

  // 遷移が取り消されるため、Playwright の遷移待ちを伴わない DOM クリックで操作する
  await picker.evaluate(() => document.getElementById('external-link')!.click())
  await expect.poll(() => openedExternalUrls(app!)).toEqual(['https://example.com/lists'])
  expect(picker.url()).toBe(`${server.origin}/lists.html`)
})

test('ウィンドウのリサイズに追従し、二重に開かない', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await openPicker(app, shell)
  await shell.evaluate(() =>
    (window as unknown as { columnist: ColumnistApi }).columnist.openPicker()
  )

  for (const [width, height] of [
    [1000, 700],
    [1200, 900]
  ]) {
    await app.evaluate(
      ({ BaseWindow }, [w, h]) => BaseWindow.getAllWindows()[0].setContentSize(w, h),
      [width, height]
    )
    await expect
      .poll(async () =>
        (await pickerViews(app!)).map(({ x, y, width, height }) => [x, y, width, height])
      )
      .toEqual([[0, TOOLBAR_HEIGHT, width, height - TOOLBAR_HEIGHT]])
  }
})

test('ログイン画面の表示中はリスト選択画面を開かない', async () => {
  app = await launchApp(server.origin, userData.dir)
  await findPage(app, (url) => url.endsWith('/login.html'))
  const shell = await shellPage(app)
  await shell.evaluate(() =>
    (window as unknown as { columnist: ColumnistApi }).columnist.openPicker()
  )
  await expect.poll(() => pickerViews(app!)).toEqual([])
  expect(app.windows().some((p) => p.url().endsWith('/lists.html'))).toBe(false)
})
