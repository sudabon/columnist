import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import {
  addColumn,
  clickMenu,
  columnViewStates,
  createUserDataDir,
  launchApp,
  login,
  readConfig,
  shellPage
} from './app'
import { startFixtureServer } from './fixtureServer'

// M1(日常使い): 並べ替え・カラム設定・一時停止・デフォルト設定・ダークモード・ショートカット

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

async function relaunch(): Promise<Page> {
  await app!.close()
  app = await launchApp(server.origin, userData.dir)
  const shell = await shellPage(app)
  await expect(shell.locator('.toolbar')).toHaveCount(1)
  return shell
}

async function openSettings(shell: Page, index: number): Promise<Locator> {
  await shell.locator('.column-header').nth(index).getByRole('button', { name: '設定' }).click()
  const form = shell.locator('.settings-dialog')
  await expect(form).toBeVisible()
  return form
}

async function fillSettings(
  form: Locator,
  values: { width: string; interval: string; zoom: string }
): Promise<void> {
  await form.getByLabel('幅').fill(values.width)
  await form.getByLabel('更新間隔').fill(values.interval)
  await form.getByLabel('ズーム').fill(values.zoom)
  await form.getByRole('button', { name: '保存' }).click()
}

test('ヘッダのドラッグ&ドロップで並べ替えられ、再起動後も順序が保たれる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2, 3]) await addColumn(shell, timeline(n))
  const headers = shell.locator('.column-header')

  const from = (await headers.nth(0).locator('.column-updated').boundingBox())!
  const to = (await headers.nth(2).boundingBox())!
  await shell.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await shell.mouse.down()
  await shell.mouse.move(from.x + 20, from.y + from.height / 2, { steps: 4 })
  await shell.mouse.move(to.x + to.width - 20, to.y + to.height / 2, { steps: 10 })
  await shell.mouse.up()

  const expected = [timeline(2), timeline(3), timeline(1)]
  await expect.poll(() => readConfig(userData.dir).columns.map((c) => c.url)).toEqual(expected)
  // カラム本体もヘッダと同じ位置に移動する
  await expect
    .poll(async () => (await columnViewStates(app!)).sort((a, b) => a.x - b.x).map((v) => v.url))
    .toEqual(expected)
  const titles = readConfig(userData.dir).columns.map((c) => c.title)
  await expect(headers.locator('.column-title')).toHaveText(titles)

  const restored = await relaunch()
  await expect(restored.locator('.column-header .column-title')).toHaveText(titles)
  await expect
    .poll(async () => (await columnViewStates(app!)).sort((a, b) => a.x - b.x).map((v) => v.url))
    .toEqual(expected)
})

test('ボタンのクリックではドラッグが始まらない', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2]) await addColumn(shell, timeline(n))
  await shell.locator('.column-header').nth(0).getByRole('button', { name: '一時停止' }).click()
  expect(readConfig(userData.dir).columns.map((c) => [c.url, c.paused])).toEqual([
    [timeline(1), true],
    [timeline(2), false]
  ])
})

test('タイトルのダブルクリック編集と一時停止が保存される', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2]) await addColumn(shell, timeline(n))
  const header = shell.locator('.column-header').first()
  const original = (await header.locator('.column-title').textContent())!

  // Escape で取消
  await header.locator('.column-title').dblclick()
  await header.getByLabel('タイトル').fill('取り消す')
  await header.getByLabel('タイトル').press('Escape')
  await expect(header.locator('.column-title')).toHaveText(original)

  // 空で確定しても元のタイトルを維持する
  await header.locator('.column-title').dblclick()
  await header.getByLabel('タイトル').fill('   ')
  await header.getByLabel('タイトル').press('Enter')
  await expect(header.locator('.column-title')).toHaveText(original)

  // Enter で確定
  await header.locator('.column-title').dblclick()
  await header.getByLabel('タイトル').fill('技術ニュース')
  await header.getByLabel('タイトル').press('Enter')
  await expect(header.locator('.column-title')).toHaveText('技術ニュース')

  // blur でも確定
  const second = shell.locator('.column-header').nth(1)
  await second.locator('.column-title').dblclick()
  await second.getByLabel('タイトル').fill('ニュース2')
  await shell.locator('.app-name').click()
  await expect(second.locator('.column-title')).toHaveText('ニュース2')

  // 一時停止の状態がヘッダで識別できる
  await header.getByRole('button', { name: '一時停止' }).click()
  await expect(header.getByText('停止中')).toBeVisible()
  await expect(header.getByRole('button', { name: '再開' })).toBeVisible()
  await expect(second.getByText('停止中')).toHaveCount(0)

  expect(readConfig(userData.dir).columns.map((c) => [c.title, c.paused])).toEqual([
    ['技術ニュース', true],
    ['ニュース2', false]
  ])

  const restored = await relaunch()
  const restoredHeader = restored.locator('.column-header').first()
  await expect(restoredHeader.locator('.column-title')).toHaveText('技術ニュース')
  await expect(restoredHeader.getByText('停止中')).toBeVisible()

  await restoredHeader.getByRole('button', { name: '再開' }).click()
  await expect(restoredHeader.getByText('停止中')).toHaveCount(0)
  expect(readConfig(userData.dir).columns[0].paused).toBe(false)
})

test('カラムごとに異なる幅・間隔・ズームが保存・反映され、範囲外はエラーになる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2]) await addColumn(shell, timeline(n))

  await fillSettings(await openSettings(shell, 0), { width: '480', interval: '300', zoom: '0.9' })
  await expect(shell.locator('.settings-dialog')).toHaveCount(0)
  await fillSettings(await openSettings(shell, 1), { width: '320', interval: '60', zoom: '1.2' })
  await expect(shell.locator('.settings-dialog')).toHaveCount(0)

  const expected = [
    [480, 300, 0.9],
    [320, 60, 1.2]
  ]
  expect(
    readConfig(userData.dir).columns.map((c) => [c.width, c.refreshIntervalSec, c.zoomFactor])
  ).toEqual(expected)
  const views = async (): Promise<number[][]> =>
    (await columnViewStates(app!)).map((v) => [v.x, v.width, v.zoom])
  await expect.poll(views).toEqual([
    [0, 480, 0.9],
    [480, 320, 1.2]
  ])
  const headerWidths = (): Promise<number[]> =>
    shell
      .locator('.column-header')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
  await expect.poll(headerWidths).toEqual([480, 320])

  // 範囲外の値は受け付けず、設定は変わらない
  const form = await openSettings(shell, 0)
  await fillSettings(form, { width: '480', interval: '30', zoom: '0.9' })
  await expect(form.getByRole('alert')).toContainText('60〜3600')
  await form.getByRole('button', { name: 'キャンセル' }).click()
  await expect(shell.locator('.settings-dialog')).toHaveCount(0)
  expect(readConfig(userData.dir).columns[0].refreshIntervalSec).toBe(300)

  // 再起動後も各カラムが設定どおりの幅・ズームで表示される
  await relaunch()
  await expect.poll(views).toEqual([
    [0, 480, 0.9],
    [480, 320, 1.2]
  ])
})

test('全カラムの一時停止・再開と、デフォルト設定は新規カラムにのみ適用される', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2]) await addColumn(shell, timeline(n))
  const paused = (): boolean[] => readConfig(userData.dir).columns.map((c) => c.paused)

  await shell.locator('.column-header').nth(1).getByRole('button', { name: '一時停止' }).click()
  await expect.poll(paused).toEqual([false, true])
  await shell.getByRole('button', { name: '全カラム一時停止' }).click()
  await expect.poll(paused).toEqual([true, true])
  await expect(shell.locator('.column-header').getByText('停止中')).toHaveCount(2)
  await shell.locator('.column-header').nth(0).getByRole('button', { name: '再開' }).click()
  await expect.poll(paused).toEqual([false, true])
  await shell.getByRole('button', { name: '全カラム再開' }).click()
  await expect.poll(paused).toEqual([false, false])

  await shell.getByRole('button', { name: 'デフォルト設定' }).click()
  const form = shell.locator('.settings-dialog')
  await expect(form.getByLabel('幅')).toHaveValue('380')
  await fillSettings(form, { width: '420', interval: '120', zoom: '1' })
  await expect(form).toHaveCount(0)
  await expect.poll(() => readConfig(userData.dir).defaults.columnWidth).toBe(420)

  await addColumn(shell, timeline(3))
  expect(readConfig(userData.dir).columns.map((c) => c.width)).toEqual([380, 380, 420])
})

test('OS のダークモードに合わせてシェルの配色が切り替わる', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await addColumn(shell, timeline(1))
  const colors = (): Promise<string[]> =>
    shell.evaluate(() =>
      ['.toolbar', '.column-header', 'body'].map(
        (s) => getComputedStyle(document.querySelector(s)!).backgroundColor
      )
    )

  await shell.emulateMedia({ colorScheme: 'light' })
  await expect
    .poll(colors)
    .toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'])
  await shell.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(colors).toEqual(['rgb(30, 34, 39)', 'rgb(30, 34, 39)', 'rgba(0, 0, 0, 0)'])
  expect(
    await shell.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  ).toBe('rgb(21, 24, 28)')
})

test('Cmd+1〜9 で画面外のカラムまでスクロールしてフォーカスし、存在しなければ何もしない', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  await app.evaluate(({ BaseWindow }) => {
    const win = BaseWindow.getAllWindows()[0]
    win.setContentSize(1000, 700)
    win.focus()
  })
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await addColumn(shell, timeline(n))
  await shell.getByTestId('horizontal-scroller').evaluate((el) => {
    el.scrollLeft = 0
  })
  await expect.poll(async () => (await columnViewStates(app!))[0].x).toBe(0)

  // 7番目(2280〜2660)の右端が表示幅 1000 に合うよう 1660 までスクロールする
  await clickMenu(app, ['カラム', '7番目のカラムへ移動'])
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => [v.x, v.visible]))
    .toEqual([
      [-1660, false],
      [-1280, false],
      [-900, false],
      [-520, false],
      [-140, true],
      [240, true],
      [620, true]
    ])
  await expect.poll(async () => (await columnViewStates(app!))[6].focused).toBe(true)
  await expect
    .poll(() => shell.getByTestId('horizontal-scroller').evaluate((el) => el.scrollLeft))
    .toBe(1660)
  expect(
    await shell
      .locator('.column-header')
      .nth(6)
      .evaluate((e) => e.getBoundingClientRect().left)
  ).toBe(620)

  // 左側の画面外カラムへは左端合わせ
  await clickMenu(app, ['カラム', '2番目のカラムへ移動'])
  await expect.poll(async () => (await columnViewStates(app!))[1].x).toBe(0)
  await expect.poll(async () => (await columnViewStates(app!))[1].focused).toBe(true)

  // フォーカス中カラムのズーム
  await clickMenu(app, ['カラム', '拡大'])
  await expect
    .poll(async () => (await columnViewStates(app!)).map((v) => v.zoom))
    .toEqual([1, 1.1, 1, 1, 1, 1, 1])
  expect(readConfig(userData.dir).columns.map((c) => c.zoomFactor)[1]).toBe(1.1)
  await clickMenu(app, ['カラム', '実際のサイズ'])
  await expect.poll(() => readConfig(userData.dir).columns[1].zoomFactor).toBe(1)

  // 存在しないカラムではスクロールもフォーカスも変わらない
  for (const n of [7, 6, 5, 4, 3]) {
    await shell
      .locator('.column-header')
      .nth(n - 1)
      .getByRole('button', { name: '削除' })
      .click()
  }
  await expect(shell.locator('.column-header')).toHaveCount(2)
  await clickMenu(app, ['カラム', '1番目のカラムへ移動'])
  await expect.poll(async () => (await columnViewStates(app!))[0].focused).toBe(true)
  const before = await columnViewStates(app)
  await clickMenu(app, ['カラム', '5番目のカラムへ移動'])
  await new Promise((r) => setTimeout(r, 300))
  expect(await columnViewStates(app)).toEqual(before)
})

test('Cmd+P で全カラムの一時停止/再開を切り替え、Cmd+T で追加欄にフォーカスする', async () => {
  app = await launchApp(server.origin, userData.dir)
  const shell = await login(app)
  for (const n of [1, 2]) await addColumn(shell, timeline(n))
  const paused = (): boolean[] => readConfig(userData.dir).columns.map((c) => c.paused)

  await clickMenu(app, ['カラム', '全カラムの一時停止/再開'])
  await expect.poll(paused).toEqual([true, true])
  await clickMenu(app, ['カラム', '全カラムの一時停止/再開'])
  await expect.poll(paused).toEqual([false, false])

  await shell.locator('.column-header').nth(0).getByRole('button', { name: '設定' }).click()
  await expect(shell.locator('.settings-dialog')).toBeVisible()
  await clickMenu(app, ['カラム', 'カラムを追加'])
  await expect(shell.locator('.settings-dialog')).toHaveCount(0)
  await expect(shell.getByLabel('カラムを追加')).toBeFocused()
})
