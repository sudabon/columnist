import { join } from 'node:path'
import { app, BaseWindow, ipcMain, screen, WebContentsView, type Session } from 'electron'
import { ColumnManager } from './columns/ColumnManager'
import { ListPicker } from './columns/ListPicker'
import { attachNavigationGuard } from './columns/navigationGuard'
import { RefreshScheduler } from './columns/refresh'
import { createConfigSchema } from './config/schema'
import { ConfigStore, loadConfig } from './config/store'
import { IpcChannels } from '../shared/ipcChannels'
import { registerIpcHandlers } from './ipc/handlers'
import { buildAppMenu, type MenuActions } from './menu'
import { hasAuthCookie, onAuthCookieAdded } from './session/auth'
import { createColumnSession } from './session/session'
import appIcon from '../../resources/icon.png?asset'
import { EXTRA_ORIGINS, TEST_ORIGIN, TEST_USER_DATA_DIR } from './testMode'
import { debounce, ensureVisible } from './window/windowState'

if (TEST_USER_DATA_DIR) app.setPath('userData', TEST_USER_DATA_DIR)

const AUTH_DOMAIN = TEST_ORIGIN ? new URL(TEST_ORIGIN).hostname : 'x.com'
const LOGIN_URL = TEST_ORIGIN ? `${TEST_ORIGIN}/login.html` : 'https://x.com/i/flow/login'

let manager: ColumnManager | null = null
let picker: ListPicker | null = null

function workAreas(): Electron.Rectangle[] {
  const primary = screen.getPrimaryDisplay()
  const others = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  return [primary, ...others].map((d) => d.workArea)
}

function createShellView(win: BaseWindow): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/shell.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  // シェル自体はどこへも遷移させない
  view.webContents.on('will-navigate', (event) => event.preventDefault())
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.contentView.addChildView(view)
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void view.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void view.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return view
}

function fitToWindow(win: BaseWindow, view: WebContentsView): void {
  const { width, height } = win.getContentBounds()
  view.setBounds({ x: 0, y: 0, width, height })
}

/** 未ログイン時、ウィンドウ全体にログイン画面を表示し、auth_token の出現を待つ */
function showLogin(win: BaseWindow, ses: Session): Promise<void> {
  return new Promise((resolve) => {
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
    attachNavigationGuard(view.webContents, EXTRA_ORIGINS)
    win.contentView.addChildView(view)
    const fit = (): void => fitToWindow(win, view)
    fit()
    win.on('resize', fit)
    void view.webContents.loadURL(LOGIN_URL).catch(() => undefined)
    onAuthCookieAdded(ses, AUTH_DOMAIN, () => {
      win.removeListener('resize', fit)
      win.contentView.removeChildView(view)
      view.webContents.close()
      resolve()
    })
  })
}

async function main(): Promise<void> {
  // パッケージ版は build/icon.icns が使われる。開発実行時のみ Dock の既定アイコンを差し替える
  if (!app.isPackaged) app.dock?.setIcon(appIcon)
  const userData = app.getPath('userData')
  const schema = createConfigSchema(EXTRA_ORIGINS).config
  const { config, brokenBackupPath } = loadConfig(userData, schema)
  if (brokenBackupPath)
    console.warn(`設定ファイルが不正だったため退避しました: ${brokenBackupPath}`)
  const store = new ConfigStore(userData, schema, config)
  const ses = createColumnSession()

  const win = new BaseWindow({
    ...ensureVisible(config.window, workAreas()),
    minWidth: 480,
    minHeight: 360,
    title: 'Columnist'
  })
  const shell = createShellView(win)
  fitToWindow(win, shell)

  const scheduler = new RefreshScheduler()
  registerIpcHandlers(
    ipcMain,
    () => (shell.webContents.isDestroyed() ? null : shell.webContents.id),
    () => manager,
    () => picker
  )
  const send = (channel: string, payload: unknown): void => {
    if (!shell.webContents.isDestroyed()) shell.webContents.send(channel, payload)
  }
  const menuActions: MenuActions = {
    addColumn: () => {
      if (shell.webContents.isDestroyed()) return
      shell.webContents.focus()
      send(IpcChannels.uiFocusAddColumn, undefined)
    },
    refreshAll: () => manager?.refresh('all'),
    togglePauseAll: () => manager?.togglePauseAll(),
    focusColumn: (index) => manager?.focusColumn(index),
    zoom: (action) => manager?.zoomFocused(action),
    focusedColumn: () => manager?.focusedWebContents() ?? null
  }
  buildAppMenu({ shell: shell.webContents, columns: [] }, menuActions)

  const saveWindowState = debounce(() => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    const b = win.getNormalBounds()
    try {
      store.update((draft) => ({
        ...draft,
        window: { x: b.x, y: b.y, width: b.width, height: b.height }
      }))
    } catch (error) {
      console.warn('ウィンドウ状態を保存できませんでした', error)
    }
  }, 500)
  win.on('move', saveWindowState)
  win.on('resize', () => {
    fitToWindow(win, shell)
    manager?.relayout()
    picker?.relayout()
    saveWindowState()
  })

  // 非表示・最小化中は全タイマーを止め、復帰時に再開する
  const resumeIfVisible = (): void => {
    if (manager && win.isVisible() && !win.isMinimized()) scheduler.start()
  }
  win.on('minimize', () => scheduler.stop())
  win.on('hide', () => scheduler.stop())
  win.on('restore', resumeIfVisible)
  win.on('show', resumeIfVisible)
  win.on('close', () => saveWindowState.flush())
  win.on('closed', () => {
    scheduler.stop()
    manager = null
    picker = null
    app.quit()
  })

  if (!(await hasAuthCookie(ses, AUTH_DOMAIN))) await showLogin(win, ses)
  if (win.isDestroyed()) return

  manager = new ColumnManager({
    window: win,
    session: ses,
    store,
    scheduler,
    extraOrigins: EXTRA_ORIGINS,
    send,
    onColumnsChanged: (views) =>
      buildAppMenu(
        {
          shell: shell.webContents,
          columns: views.map((v) => ({ title: v.data.title, webContents: v.webContents }))
        },
        menuActions
      )
  })
  manager.init()
  manager.broadcastAll()
  picker = new ListPicker({
    window: win,
    session: ses,
    extraOrigins: EXTRA_ORIGINS,
    onState: (state) => send(IpcChannels.pickerState, state)
  })
  resumeIfVisible()
}

app.whenReady().then(main, (error) => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
