import { Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'
import type { ZoomAction } from './columns/ColumnManager'

export interface MenuTargets {
  shell: WebContents
  columns: readonly { title: string; webContents: WebContents }[]
}

/** メニューのショートカットから呼ぶ操作(フォーカスがシェルとカラムのどちらにあっても main で処理される) */
export interface MenuActions {
  addColumn(): void
  refreshAll(): void
  togglePauseAll(): void
  /** 左から index 番目(0 始まり)のカラムへ移動する */
  focusColumn(index: number): void
  zoom(action: ZoomAction): void
  /** フォーカス中カラムの WebContents(なければ null) */
  focusedColumn(): WebContents | null
}

function openDevTools(wc: WebContents): void {
  if (!wc.isDestroyed()) wc.openDevTools({ mode: 'detach' })
}

/**
 * アプリメニューを構築する。カラム構成が変わるたびに呼び直す。
 * Cmd+Shift+R を全カラム更新に使うため、既定の reload / forceReload 系ロール(viewMenu)は含めない。
 */
export function buildAppMenu(targets: MenuTargets, actions: MenuActions): void {
  const columnItems: MenuItemConstructorOptions[] =
    targets.columns.length === 0
      ? [{ label: 'カラムがありません', enabled: false }]
      : targets.columns.map((c, i) => ({
          label: `${i + 1}. ${c.title}`,
          click: () => openDevTools(c.webContents)
        }))

  const focusItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `${i + 1}番目のカラムへ移動`,
    accelerator: `CommandOrControl+${i + 1}`,
    click: () => actions.focusColumn(i)
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'カラム',
      submenu: [
        { label: 'カラムを追加', accelerator: 'CommandOrControl+T', click: actions.addColumn },
        {
          label: '全カラムを更新',
          accelerator: 'CommandOrControl+Shift+R',
          click: actions.refreshAll
        },
        {
          label: '全カラムの一時停止/再開',
          accelerator: 'CommandOrControl+P',
          click: actions.togglePauseAll
        },
        { type: 'separator' },
        ...focusItems,
        { type: 'separator' },
        { label: '拡大', accelerator: 'CommandOrControl+=', click: () => actions.zoom('in') },
        // Shift を押して「+」で拡大した場合も受け付ける(メニューには表示しない)
        {
          label: '拡大',
          accelerator: 'CommandOrControl+Plus',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => actions.zoom('in')
        },
        { label: '縮小', accelerator: 'CommandOrControl+-', click: () => actions.zoom('out') },
        {
          label: '実際のサイズ',
          accelerator: 'CommandOrControl+0',
          click: () => actions.zoom('reset')
        }
      ]
    },
    {
      label: '開発',
      submenu: [
        {
          label: 'フォーカス中カラムの開発者ツール',
          accelerator: 'Alt+CommandOrControl+I',
          click: () => {
            const wc = actions.focusedColumn()
            if (wc) openDevTools(wc)
          }
        },
        { label: 'シェルの開発者ツール', click: () => openDevTools(targets.shell) },
        { label: 'カラムの開発者ツール', submenu: columnItems }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
