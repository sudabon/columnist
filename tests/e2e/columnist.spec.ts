import { expect, test, type ElectronApplication } from '@playwright/test'
import {
  addColumn,
  clickMenu,
  columnViewStates,
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

test('初回はログイン画面を表示し、ログイン後はカラム画面へ移り、再起動後はログイン不要', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await expect(shell.getByText('ツールバーからカラムを追加してください')).toBeVisible()
  await app.close()

  app = await launchApp(server.origin, userData.dir)
  await shellPage(app)
  // ログイン画面が出ないまま、カラム画面の初期化が終わることを確認する
  await expect.poll(async () => (await shellPage(app!)).locator('.toolbar').count()).toBe(1)
  expect(app.windows().some((p) => p.url().endsWith('/login.html'))).toBe(false)
})

test('カラムの追加・削除、不正入力のエラー、横並び', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)

  for (const n of [1, 2, 3]) await addColumn(shell, timeline(n))
  const headers = shell.locator('.column-header')
  await expect(headers).toHaveCount(3)
  const xs = await headers.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left))
  expect(xs).toEqual([0, 380, 760])
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => [v.x, v.width, v.visible]))
    .toEqual([
      [0, 380, true],
      [380, 380, true],
      [760, 380, true]
    ])
  expect(readConfig(userData.dir).columns.map((c) => c.url)).toEqual([
    timeline(1),
    timeline(2),
    timeline(3)
  ])

  await shell.getByLabel('カラムを追加').fill('hello world')
  await shell.getByRole('button', { name: '＋ 追加' }).click()
  await expect(shell.getByRole('alert')).toBeVisible()
  await expect(headers).toHaveCount(3)

  await headers.nth(1).getByRole('button', { name: '削除' }).click()
  await expect(headers).toHaveCount(2)
  expect(readConfig(userData.dir).columns.map((c) => c.url)).toEqual([timeline(1), timeline(3)])
  await expect.poll(async () => (await columnViewStates(app!)).map((v) => v.x)).toEqual([0, 380])
})

test('ウィンドウ幅を超えるカラムは横スクロールで閲覧でき、画面外のカラムは非表示になる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setContentSize(1000, 700))
  for (const n of [1, 2, 3, 4]) await addColumn(shell, timeline(n))

  // 追加時は右端までスクロールする(合計 1520px、表示 1000px)
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.x))
    .toEqual([-520, -140, 240, 620])
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.visible))
    .toEqual([false, true, true, true])

  await shell.getByTestId('horizontal-scroller').evaluate((el) => {
    el.scrollLeft = 0
  })
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.x))
    .toEqual([0, 380, 760, 1140])
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.visible))
    .toEqual([true, true, true, false])
  const firstHeader = shell.locator('.column-header').first()
  expect(await firstHeader.evaluate((e) => e.getBoundingClientRect().left)).toBe(0)
})

test('詳細画面を開くと「先頭へ」が表示され、押すと基準URLに戻る', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const column = await findPage(app, (url) => url === timeline(1))
  const header = shell.locator('.column-header').first()
  await expect(header.getByRole('button', { name: '先頭へ' })).toHaveCount(0)

  await column.click('#detail-link')
  await expect(header.getByRole('button', { name: '先頭へ' })).toBeVisible()
  await expect(header.getByRole('button', { name: '戻る' })).toBeEnabled()

  await header.getByRole('button', { name: '先頭へ' }).click()
  await expect.poll(() => column.url()).toBe(timeline(1))
  await expect(header.getByRole('button', { name: '先頭へ' })).toHaveCount(0)

  await column.click('#detail-link')
  await header.getByRole('button', { name: '戻る' }).click()
  await expect.poll(() => column.url()).toBe(timeline(1))
})

test('手動更新でカラムが再読み込みされ、最終更新時刻が表示される', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const column = await findPage(app, (url) => url === timeline(1))
  await expect(column.locator('body[data-loaded-at]')).toHaveCount(1)
  const before = await column.locator('body').getAttribute('data-loaded-at')
  const header = shell.locator('.column-header').first()
  await expect(header.locator('.column-updated')).toHaveText('たった今')

  await header.getByRole('button', { name: '更新' }).click()
  await expect.poll(() => column.locator('body').getAttribute('data-loaded-at')).not.toBe(before)

  const beforeAll = await column.locator('body').getAttribute('data-loaded-at')
  await shell.getByRole('button', { name: '全カラム更新' }).click()
  await expect.poll(() => column.locator('body').getAttribute('data-loaded-at')).not.toBe(beforeAll)
})

test('外部リンクと新規ウィンドウはアプリ内で開かず、既定ブラウザに渡す', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const column = await findPage(app, (url) => url === timeline(1))
  const pageCount = app.windows().length

  // 遷移が取り消されるため、Playwright の遷移待ちを伴わない DOM クリックで操作する
  await column.evaluate(() => document.getElementById('external-link')!.click())
  await column.evaluate(() => document.getElementById('blank-link')!.click())
  await expect
    .poll(() => openedExternalUrls(app!))
    .toEqual(['https://example.com/', 'https://example.com/blank'])
  expect(column.url()).toBe(timeline(1))
  expect(app.windows().length).toBe(pageCount)
})

test('カラム内のページからの権限要求は拒否される', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, `${server.origin}/notify.html`)
  const column = await findPage(app, (url) => url.endsWith('/notify.html'))
  await expect.poll(() => column.title()).toBe('denied')
})

test('カラムビューから Node API やシェル用 API は見えない', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const column = await findPage(app, (url) => url === timeline(1))
  expect(
    await column.evaluate(() => [
      typeof (window as unknown as { require: unknown }).require,
      typeof (window as unknown as { columnist: unknown }).columnist
    ])
  ).toEqual(['undefined', 'undefined'])
  expect(
    await shell.evaluate(() => [
      typeof (window as unknown as { require: unknown }).require,
      typeof (window as unknown as { columnist: unknown }).columnist
    ])
  ).toEqual(['undefined', 'object'])
})

test('再起動してもカラム構成とウィンドウ位置・サイズが復元される', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2, 3]) await addColumn(shell, timeline(n))
  await app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()[0].setBounds({ x: 120, y: 140, width: 1100, height: 720 })
  )
  await expect
    .poll(() => readConfig(userData.dir).window)
    .toEqual({ x: 120, y: 140, width: 1100, height: 720 })
  await app.close()

  app = await launchApp(server.origin, userData.dir)
  const restored = await shellPage(app)
  await expect(restored.locator('.column-header')).toHaveCount(3)
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.url))
    .toEqual([timeline(1), timeline(2), timeline(3)])
  const bounds = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getBounds())
  expect(bounds).toEqual({ x: 120, y: 140, width: 1100, height: 720 })
})

test('ウィンドウのリサイズにカラムの高さが追従する', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const heights = async (): Promise<number[]> =>
    app!.evaluate(({ BaseWindow }) =>
      BaseWindow.getAllWindows()[0].contentView.children.map((c) => c.getBounds().height)
    )
  for (const height of [700, 900]) {
    await app.evaluate(
      ({ BaseWindow }, h) => BaseWindow.getAllWindows()[0].setContentSize(1000, h),
      height
    )
    // シェルはウィンドウ全面、カラムはツールバー40 + ヘッダ32 + スクロールバー14 を除いた高さ
    await expect.poll(heights).toEqual([height, height - 86])
  }
})

test('メニューからシェルと各カラムの開発者ツールを開ける', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  await addColumn(shell, timeline(2))

  const devToolsOpened = (): Promise<boolean[]> =>
    app!.evaluate(({ BaseWindow }) =>
      BaseWindow.getAllWindows()[0].contentView.children.map((c) =>
        (c as Electron.WebContentsView).webContents.isDevToolsOpened()
      )
    )

  await clickMenu(app, ['開発', 'カラムの開発者ツール', '2. timeline.html'])
  await expect.poll(devToolsOpened).toEqual([false, false, true])
  await clickMenu(app, ['開発', 'シェルの開発者ツール'])
  await expect.poll(devToolsOpened).toEqual([true, false, true])
})
