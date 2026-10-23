import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import type { Config } from '../../src/shared/types'

const MAIN = resolve(__dirname, '../../out-test/main/index.js')

export function createUserDataDir(): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'columnist-e2e-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** テストビルドを fixture オリジン・一時ユーザーデータで起動し、外部ブラウザ起動をスタブ化する */
export async function launchApp(origin: string, userDataDir: string): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [MAIN],
    env: {
      ...process.env,
      COLUMNIST_TEST_ORIGIN: origin,
      COLUMNIST_TEST_USER_DATA_DIR: userDataDir
    }
  })
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] }
    g.__opened = []
    shell.openExternal = async (url: string) => {
      g.__opened.push(url)
    }
  })
  return app
}

export async function openedExternalUrls(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)
}

export async function findPage(
  app: ElectronApplication,
  predicate: (url: string) => boolean
): Promise<Page> {
  await expect
    .poll(() => app.windows().some((p) => predicate(p.url())), { timeout: 10_000 })
    .toBe(true)
  return app.windows().find((p) => predicate(p.url()))!
}

export function shellPage(app: ElectronApplication): Promise<Page> {
  return findPage(app, (url) => url.endsWith('/renderer/index.html'))
}

/** ログイン画面が出ていればログインし、シェルを返す */
export async function login(app: ElectronApplication): Promise<Page> {
  const loginPage = await findPage(app, (url) => url.endsWith('/login.html'))
  await loginPage.click('#login')
  await expect.poll(() => app.windows().some((p) => p.url().endsWith('/login.html'))).toBe(false)
  return shellPage(app)
}

export async function addColumn(shell: Page, input: string): Promise<void> {
  const before = await shell.locator('.column-header').count()
  await shell.getByLabel('カラムを追加').fill(input)
  await shell.getByRole('button', { name: '＋ 追加' }).click()
  await expect(shell.locator('.column-header')).toHaveCount(before + 1)
}

export function readConfig(userDataDir: string): Config {
  return JSON.parse(readFileSync(join(userDataDir, 'config.json'), 'utf8')) as Config
}

/** アプリメニューの項目をラベルのパスで探してクリックする(ショートカットと同じ処理が走る) */
export function clickMenu(app: ElectronApplication, path: string[]): Promise<void> {
  return app.evaluate(({ Menu }, labels) => {
    let items = Menu.getApplicationMenu()!.items
    let item: Electron.MenuItem | undefined
    for (const label of labels) {
      item = items.find((i) => i.label === label)
      if (!item) throw new Error(`menu not found: ${label}`)
      items = item.submenu?.items ?? []
    }
    item!.click()
  }, path)
}

/** main プロセスから見たカラムビューの bounds と表示状態(シェルビューを除く) */
export async function columnViewStates(
  app: ElectronApplication
): Promise<
  { url: string; x: number; width: number; visible: boolean; zoom: number; focused: boolean }[]
> {
  return app.evaluate(({ BaseWindow }) => {
    const win = BaseWindow.getAllWindows()[0]
    return win.contentView.children.slice(1).map((child) => {
      const view = child as Electron.WebContentsView
      const b = view.getBounds()
      return {
        url: view.webContents.getURL(),
        x: b.x,
        width: b.width,
        visible: view.getVisible(),
        zoom: view.webContents.getZoomFactor(),
        focused: view.webContents.isFocused()
      }
    })
  })
}
