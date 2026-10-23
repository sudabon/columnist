# Columnist 実装指示書

> X(旧Twitter)のリスト・検索・タイムラインを縦カラムで横に並べ、自動更新しながら眺めるための個人用デスクトップアプリ。
> リポジトリ: `sudabon/columnist`

---

## 0. この指示書の読み方

- 本書は実装者(人間 / Claude Code)向けの指示書です。**「1. 方針とガードレール」は全マイルストーンを通じて最優先**で守ってください。
- 用語: **MUST** = 必須、**MUST NOT** = 禁止、**SHOULD** = 推奨。
- マイルストーンは M0 → M1 → M2 の順に進め、各マイルストーンの受け入れ基準を満たしてから次へ進みます。

---

## 1. 方針とガードレール(最重要)

### 1.1 基本方針

Columnist は「**x.com の公式Web画面を、複数並べて表示するだけの専用ブラウザ**」です。X API は使いません。投稿データの取得・保存・加工もしません。

### 1.2 MUST NOT(禁止事項)

1. **X API(api.x.com)を呼ばない。** 開発者契約の対象外であることが本アプリの前提です。
2. **x.com の非公式内部API(GraphQL等)を直接呼ばない。** 通信の傍受・改変・リプレイもしない。
3. **DOM から投稿内容・ユーザー情報を読み取らない。** 読み取ったものを保存・送信・集計・通知に使うことも禁止です。
4. **自動クリック・自動入力・自動投稿・自動いいね・自動フォローをしない。** 「新しいポストを表示」ボタンの自動クリックもしません。
5. **新着投稿のデスクトップ通知や、キーワード検知などの「中身に依存する機能」を作らない。** これらは DOM 読み取りが必須になるためです。
6. **名前・アイコン・UIに X の商標(Xロゴ、"X"、"Twitter"、"Tweet"、鳥のロゴ)を使わない。**
7. **リロード間隔を 60 秒未満にしない。**
8. **配布・SaaS化を前提にした機能(アカウント共有、サーバ連携、テレメトリ送信)を入れない。**

### 1.3 カラムビューで許可される JavaScript 実行

カラムビュー(x.com を表示する WebContents)で `executeJavaScript` を使ってよいのは、**以下に限ります**。これ以外の追加は禁止です。

| 用途 | 内容 |
|---|---|
| スクロール位置取得 | `window.scrollY` を返す |
| 先頭へ戻す | `window.scrollTo(0, 0)` |
| 操作中判定 | `mousemove` / `wheel` / `keydown` / `pointerdown` を監視し、最終操作時刻だけを `window.__columnistLastInput` に記録する小さなスクリプト |

- CSS 注入(`webContents.insertCSS`)は、**見た目の調整(非表示・余白・幅)に限り**許可します。
- これらのスクリプトは `src/main/columns/allowedScripts.ts` に集約し、コードレビューで差分を確認できるようにします。

### 1.4 README に記載する免責

- 本アプリは X Corp. と無関係であり、承認・提携を受けていないこと。
- 公式Web画面を表示するだけのブラウザであり、データの収集・自動操作は行わないこと。
- X の利用規約は各自の責任で遵守すること。

---

## 2. 技術スタック

| 項目 | 採用 |
|---|---|
| ランタイム | Electron 最新安定版(`BaseWindow` + `WebContentsView` を使用。**`BrowserView` は非推奨なので使わない**。`<webview>` タグも使わない) |
| 言語 | TypeScript(strict) |
| ビルド | electron-vite |
| シェルUI | React + Vite(ツールバー・カラムヘッダ・設定ダイアログ) |
| 並べ替え | dnd-kit(M1) |
| 設定保存 | `app.getPath('userData')/config.json` + zod でスキーマ検証 |
| パッケージング | electron-builder(macOS 優先。Windows は M2 以降に検討) |
| テスト | Vitest(ロジック)、Playwright for Electron(シェルUIのE2E) |
| Lint/Format | ESLint + Prettier |

---

## 3. アーキテクチャ

### 3.1 全体構成

```
BaseWindow
├── shellView (WebContentsView)   … React製のツールバー + カラムヘッダ帯 + 横スクロールバー
├── columnView[0] (WebContentsView) … x.com/i/lists/xxxx
├── columnView[1] (WebContentsView) … x.com/search?q=...&f=live
└── columnView[n] ...
```

- **シェルビュー**: ウィンドウ上部のツールバー(高さ 40px)と、各カラムのヘッダ(高さ 32px)、最下部の横スクロールバーを描画します。
- **カラムビュー**: x.com を表示するネイティブビューです。位置とサイズは main プロセスが `setBounds` で決めます。
- **横スクロール**: カラムの合計幅がウィンドウ幅を超えた場合、シェルの横スクロール位置(`scrollX`)を IPC で main に送り、main が全カラムの bounds を再計算します。画面外のカラムは `setVisible(false)` にします(自動更新タイマーは継続)。

### 3.2 セッション

- 全カラムで単一の永続パーティション `persist:columnist-default` を共有し、**ログインは1回で済む**ようにします。
- M2 の複数アカウント対応では、アカウントごとに `persist:columnist-<accountId>` を割り当てます。

### 3.3 ディレクトリ構成

```
columnist/
├── src/
│   ├── main/
│   │   ├── index.ts              # エントリ。BaseWindow生成、ライフサイクル
│   │   ├── window/
│   │   │   ├── layout.ts         # カラムbounds計算(純粋関数。テスト対象)
│   │   │   └── windowState.ts    # ウィンドウ位置・サイズの保存/復元
│   │   ├── columns/
│   │   │   ├── ColumnManager.ts  # カラムの生成・破棄・並べ替え・表示制御
│   │   │   ├── ColumnView.ts     # 1カラム分のWebContentsViewラッパー
│   │   │   ├── refresh.ts        # 自動更新スケジューラ
│   │   │   ├── allowedScripts.ts # 許可されたJSのみをここに定義
│   │   │   └── navigationGuard.ts# 遷移制限・外部リンク処理
│   │   ├── session/
│   │   │   ├── session.ts        # パーティション生成、権限ハンドラ
│   │   │   └── auth.ts           # ログイン状態判定(cookie有無のみ)
│   │   ├── config/
│   │   │   ├── schema.ts         # zodスキーマ
│   │   │   └── store.ts          # 読み書き・マイグレーション
│   │   ├── ipc/
│   │   │   └── handlers.ts       # IPCハンドラ
│   │   └── menu.ts               # アプリメニュー、ショートカット
│   ├── preload/
│   │   └── shell.ts              # シェルビュー専用。contextBridgeで最小APIのみ公開
│   ├── renderer/                 # シェルUI(React)
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Toolbar.tsx
│   │   │   ├── ColumnHeader.tsx
│   │   │   ├── AddColumnDialog.tsx
│   │   │   └── HorizontalScroller.tsx
│   │   └── styles/
│   ├── inject/
│   │   └── x.css                 # x.comへ注入するCSS(見た目調整のみ)
│   └── shared/
│       ├── types.ts              # Column, Config, IPC型
│       └── ipcChannels.ts
├── tests/
│   ├── unit/                     # layout, refresh判定, config
│   ├── e2e/                      # Playwright for Electron
│   └── fixtures/                 # x.comの代わりに使うローカルHTML
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
└── README.md
```

---

## 4. データモデル

### 4.1 設定ファイル(`config.json`)

```json
{
  "version": 1,
  "window": { "x": 100, "y": 80, "width": 1600, "height": 1000 },
  "defaults": { "columnWidth": 380, "refreshIntervalSec": 120, "zoomFactor": 1.0 },
  "columns": [
    {
      "id": "c_01HZX...",
      "title": "技術ニュース",
      "type": "list",
      "url": "https://x.com/i/lists/1234567890",
      "width": 380,
      "refreshIntervalSec": 120,
      "zoomFactor": 1.0,
      "paused": false
    }
  ]
}
```

### 4.2 zod スキーマ要件

- `type`: `"list" | "search" | "home" | "profile" | "custom"`
- `url`: `https://x.com/` で始まること(`twitter.com` は保存時に `x.com` へ正規化)。
- `width`: 300〜640。
- `refreshIntervalSec`: 60〜3600(**60未満は拒否**)。
- `zoomFactor`: 0.5〜1.5。
- 読み込み時にスキーマ違反があれば、壊れたファイルを `config.broken-<timestamp>.json` に退避し、デフォルト設定で起動します。
- `version` を見てマイグレーションできる構造にします。

### 4.3 カラム追加時の入力の解釈

ユーザーが入力した文字列を、次のように解釈します。

| 入力 | 種別 | 生成URL |
|---|---|---|
| 数字のみ(例 `1234567890`) | list | `https://x.com/i/lists/1234567890` |
| `x.com/i/lists/...` または `twitter.com/i/lists/...` | list | 正規化したURL |
| `@username` | profile | `https://x.com/username` |
| `search:キーワード` | search | `https://x.com/search?q=<encoded>&f=live` |
| `home` | home | `https://x.com/home` |
| その他の `x.com` URL | custom | そのまま |
| それ以外 | — | エラー表示 |

---

## 5. 機能仕様

### 5.1 ログイン

1. 起動時、セッションの cookie に `x.com` ドメインの `auth_token` が**存在するかどうかだけ**を確認します(値は読まない・保存しない)。
2. 未ログインなら、ウィンドウ全体に1枚の WebContentsView で `https://x.com/i/flow/login` を表示します。
3. ログイン後(cookie 出現を `session.cookies.on('changed')` で検知)、ログインビューを破棄してカラム表示へ移ります。
4. **パスワードの保存・自動入力はしません。** 入力はユーザー自身が行います。
5. 「Googleでログイン」は組み込みブラウザでブロックされる可能性があります。**X のユーザー名+パスワード(+2FA)でのログインを前提**とし、README に記載します。

### 5.2 カラム表示

- カラム幅のデフォルトは 380px です。x.com は狭い幅ではレスポンシブで1カラムのコンパクト表示になるため、**まずは CSS 注入なしでどう表示されるかを M0 で確認**し、必要最小限の CSS だけを `inject/x.css` に足します。
- CSS で消す候補(M0 で要否を判断): 下部ナビゲーションバー、上部ヘッダ、ログイン促進バナー、サイドバー。
- セレクタは `data-testid` など比較的安定した属性を優先します。`x.css` の先頭に「最終確認日」を書きます。
- `dom-ready` のたびに `insertCSS` を再実行します(SPA の遷移でも消えないように)。

### 5.3 自動更新

**方式: `webContents.reload()` による再読み込みのみ**(DOM操作・ボタンクリックはしない)。

各カラムに独立したタイマーを持ち、間隔ごとに以下の判定を行います。

```
onTick(column):
  if column.paused                          → スキップ
  if 現在URLがカラムの基準URLと異なる          → スキップ(詳細画面などを閲覧中)
  if webContents.isLoading()                → スキップ
  if webContents.isCurrentlyAudible()       → スキップ(動画再生中)
  scrollY = executeJavaScript(GET_SCROLL_Y)
  if scrollY > 10                           → スキップ(読み進めている途中)
  lastInput = executeJavaScript(GET_LAST_INPUT)
  if now - lastInput < 15秒                  → スキップ(操作中)
  webContents.reload()
  lastRefreshedAt = now → シェルへ通知(ヘッダに表示)
```

- **開始タイミングをずらす**: カラム i の初回発火を `interval × i / N` 秒遅らせ、全カラムの同時リロードを避けます。
- **ウィンドウ非表示・最小化中は全タイマーを停止**し、復帰時に再開します。
- スキップが連続しても、追いかけてリロードし直す処理はしません(次回の tick を待つ)。
- 判定ロジック(`shouldRefresh`)は純粋関数として切り出し、ユニットテストします。

### 5.4 ナビゲーション制御

- カラムビュー内の遷移は `x.com` ドメインのみ許可します(`will-navigate` / `will-redirect` で判定)。
- それ以外のリンク、および `setWindowOpenHandler` で開かれる新規ウィンドウは**すべて拒否**し、`http(s)` の場合のみ `shell.openExternal` で既定ブラウザで開きます。
- 投稿をクリックしてカラム内で詳細画面に遷移した場合、カラムヘッダに「← 戻る」「⌂ 先頭へ」ボタンを表示します。この間、自動更新はスキップされます(5.3 の判定による)。

### 5.5 カラムヘッダ(シェル側)

各カラムの上に表示します。

- タイトル(ダブルクリックで編集)
- 最終更新時刻(「2分前」形式)
- ボタン: 手動更新 / 一時停止・再開 / 戻る / 先頭へ / 設定 / 削除

### 5.6 ツールバー(シェル側)

- カラム追加(4.3 の入力形式)
- 全カラム更新
- 全カラム一時停止 / 再開
- 設定(デフォルト幅・間隔・ズーム)

### 5.7 セキュリティ設定

| 対象 | 設定 |
|---|---|
| カラムビュー | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, **preload なし** |
| シェルビュー | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, preload は `preload/shell.ts` のみ |
| 権限 | `session.setPermissionRequestHandler` で**全権限を拒否**(通知・位置情報・カメラ・マイク等) |
| シェルのCSP | `default-src 'self'` を基本に設定 |
| IPC | シェルビューの `webContents.id` 以外からのメッセージは無視 |
| DevTools | メニューから各カラム / シェルごとに開ける(開発者ツールは必須機能) |

### 5.8 ショートカット(M1)

| キー | 動作 |
|---|---|
| `Cmd+T` | カラム追加 |
| `Cmd+Shift+R` | 全カラム更新 |
| `Cmd+1`〜`Cmd+9` | 該当カラムへフォーカス(画面外なら横スクロール) |
| `Cmd+P` | 全カラム一時停止 / 再開 |
| `Cmd+Option+I` | フォーカス中カラムの DevTools |
| `Cmd+=` / `Cmd+-` / `Cmd+0` | フォーカス中カラムのズーム |

---

## 6. IPC 契約

チャネル名は `src/shared/ipcChannels.ts` に定数として定義します。

| 方向 | チャネル | ペイロード | 内容 |
|---|---|---|---|
| shell → main | `columns:list` | — | 現在のカラム一覧を取得 |
| shell → main | `columns:add` | `{ input: string }` | 4.3 の解釈で追加。失敗時はエラーメッセージを返す |
| shell → main | `columns:remove` | `{ id }` | 削除 |
| shell → main | `columns:update` | `{ id, patch }` | タイトル・幅・間隔・ズーム・一時停止の変更 |
| shell → main | `columns:reorder` | `{ ids: string[] }` | 並べ替え(M1) |
| shell → main | `columns:refresh` | `{ id \| "all" }` | 手動更新 |
| shell → main | `columns:navigate` | `{ id, action: "back" \| "home" }` | 戻る / 基準URLへ戻る |
| shell → main | `layout:scroll` | `{ scrollX }` | 横スクロール位置 |
| main → shell | `columns:changed` | `Column[]` | カラム構成の変更通知 |
| main → shell | `column:status` | `{ id, lastRefreshedAt, isOnBaseUrl, canGoBack }` | ヘッダ表示用の状態 |
| main → shell | `layout:metrics` | `{ totalWidth, viewportWidth }` | 横スクロールバー描画用 |

---

## 7. マイルストーンと受け入れ基準

### M0: 動く最小構成

**実装範囲**

- `BaseWindow` + シェルビュー + カラムビューの基本構成
- ログインフロー(5.1)
- カラム追加(リストID / リストURL / 任意 x.com URL)・削除
- 固定幅カラムの横並び + 横スクロール
- 自動更新(5.3)
- 設定とウィンドウ状態の保存・復元
- ナビゲーション制御・外部リンク(5.4)
- セキュリティ設定(5.7)
- メニューから DevTools を開ける

**受け入れ基準**

- [ ] 初回起動でログイン画面が出て、ログイン後にカラム画面へ移る。再起動後はログイン不要。
- [ ] リストを3本追加すると、3カラムが横に並んで表示される。
- [ ] ウィンドウ幅より多くカラムを追加すると、横スクロールで全カラムを見られる。
- [ ] 先頭表示のまま放置したカラムは、設定間隔ごとに再読み込みされる。
- [ ] スクロールして読んでいる途中のカラムは再読み込みされない。
- [ ] 投稿の詳細画面を開いている間は再読み込みされず、「先頭へ」で元のリストに戻れる。
- [ ] 外部リンクは既定ブラウザで開く。
- [ ] 再起動してもカラム構成とウィンドウ位置が復元される。
- [ ] 狭い幅で x.com がどう表示されるかを確認し、必要な CSS を `x.css` に最小限追加した。
- [ ] `allowedScripts.ts` に定義された以外の `executeJavaScript` 呼び出しがコードベースに存在しない(grep で確認)。

### M1: 日常使いの快適さ

**実装範囲**

- ドラッグ&ドロップでのカラム並べ替え
- カラムごとの幅・更新間隔・ズーム設定
- カラムヘッダの全機能(5.5)
- ショートカット(5.8)
- 入力形式の拡張(`@user`, `search:`, `home`)
- 全カラム一時停止 / 再開
- ダークモード(OS 設定に追従。シェルUIのみ)

**受け入れ基準**

- [ ] カラムを並べ替えると、再起動後も順序が保たれる。
- [ ] カラムごとに異なる幅・間隔・ズームを設定でき、保存される。
- [ ] `Cmd+1`〜`9` で画面外のカラムにもスクロールしてフォーカスできる。
- [ ] 一時停止中のカラムは再読み込みされない。

### M2: 拡張(必要になったら)

- **デッキ(レイアウトの切り替え)**: 「仕事用」「趣味用」などのカラムセットを保存して切り替える。
- **複数アカウント**: アカウントごとに別パーティションを使い、カラムごとにアカウントを選べる。
- **配布用ビルド**: electron-builder で署名付きの dmg を作る(自分のMac間で使う範囲)。

---

## 8. テスト方針

- **x.com を自動テストの対象にしない。** E2E で実サイトを自動操作すると、規約(自動アクセスの禁止)に抵触するおそれがあるためです。
- E2E では、カラムの URL を `tests/fixtures/` のローカルHTML(縦に長いダミーのタイムライン)に差し替える仕組みを用意します。テスト時のみ環境変数 `COLUMNIST_TEST_ORIGIN` で、許可するオリジンを fixture 用のローカルサーバに切り替えます(本番ビルドでは無効)。
- ユニットテストの対象:
  - `layout.ts`: カラム数・幅・`scrollX`・ウィンドウサイズから各 bounds を計算する処理
  - `refresh.ts`: `shouldRefresh` の全分岐
  - `config/`: スキーマ検証、壊れた設定の退避、マイグレーション
  - 4.3 の入力解釈
- 実サイトでの確認は、M0 / M1 の受け入れ基準に沿って**人が手動で**行います。

---

## 9. 既知のリスクと対処

| リスク | 対処 |
|---|---|
| X のUI変更で CSS が効かなくなる | CSS は最小限にし、`x.css` に集約。効かなくなっても表示が崩れるだけで機能は止まらない設計にする |
| 組み込みブラウザでログインできない | X のユーザー名+パスワードでのログインを前提にする。User-Agent の偽装はしない。どうしても表示に問題が出た場合のみ、UA から `Electron/x.y.z` トークンを除く対応を検討する |
| リロードが多くて X から制限される | 間隔の下限 60 秒、開始タイミングの分散、非表示中の停止で負荷を抑える |
| x.com 側のメモリ消費が大きい | カラム数が多い場合は画面外カラムの `setVisible(false)` に加え、M2 で「画面外カラムの更新間隔を延ばす」オプションを検討 |
| 規約の解釈が変わる | 1.2 のガードレールを守る限り、通常のブラウザ利用と同等の挙動に留まる。規約改定時は README の免責と本書を見直す |

---

## 10. 着手手順(M0)

1. `sudabon/columnist` を作成し、electron-vite の React + TypeScript テンプレートで初期化する。
2. ESLint / Prettier / Vitest を設定する。
3. `shared/types.ts` と `config/schema.ts` を先に書き、設定の読み書きをテスト付きで完成させる。
4. `layout.ts` を純粋関数として実装し、ユニットテストを書く。
5. `BaseWindow` + シェルビュー + カラムビュー1本で、x.com が表示されることを確認する。
6. ログインフロー(5.1)を実装する。
7. カラムの追加・削除・横スクロールを実装する。
8. ナビゲーション制御とセキュリティ設定を入れる。
9. 自動更新(`allowedScripts.ts` → `refresh.ts`)を実装する。
10. 実サイトで狭い幅の表示を確認し、`x.css` を調整する。
11. README(概要・免責・ログイン方法・ビルド方法)を書く。
12. M0 の受け入れ基準を手動で全部確認する。
