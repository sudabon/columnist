# Design

## Context

- 動機は proposal.md の Why を参照。前提は `add-columnist-m0-foundation` の実装(コードは実装済み、受け入れ確認中)。
- 現状のコードで本 change に関係する点:
  - `ColumnManager.add(input)` が `parseColumnInput` で解釈してカラムを生成・保存し、追加時に右端までスクロールする。
  - `parseColumnInput` はリストURL判定に `LIST_PATH = /^\/i\/lists\/(\d+)\/?$/` を持つが、テスト用オリジンの URL は常に `custom` として扱う。
  - ログイン画面は `index.ts` の `showLogin` が全面の `WebContentsView` を一時的に重ねる方式で、`ColumnManager` はログイン完了後に生成される(未ログイン時は `null`)。
  - ネイティブビューはシェルの DOM より手前に描画されるため、シェル内のモーダルはカラムに隠れる(M0 design D12)。
  - IPC は `createGuard` で送信元(シェル)とペイロードを検証している。

## Goals / Non-Goals

**Goals:**
- ガードレール(spec.md 1.2・1.3)を一切緩めずに、リストIDの入力を不要にする
- 既存のカラム追加処理(解釈・既定値・保存・スクロール)をそのまま再利用する

**Non-Goals:**
- リスト名の取得・カラムタイトルへの反映(DOM・ページタイトルの読み取りになるため行わない。タイトル変更は M1 のタイトル編集で行う)
- リスト以外(検索・プロフィール等)の「選んで追加」
- 追加済みリストの重複チェック(手入力での追加と同じく、同じリストを複数追加できる)
- リスト選択画面の開発者ツールのメニュー項目

## Decisions

### D1. リスト選択画面は `ListPicker` クラスの一時的な `WebContentsView`
`src/main/columns/ListPicker.ts` に、開く・閉じる・URL 変化の通知・現在 URL の取得だけを持つクラスを置く。開くたびに `WebContentsView` を生成し、閉じるときに `webContents.close()` で破棄する(ログイン画面と同じ方式)。
- webPreferences はカラムビューと同じ(`session` 共有、`contextIsolation`/`sandbox` 有効、`nodeIntegration` 無効、preload なし)。
- `attachNavigationGuard` をそのまま適用する。
- `dom-ready` での CSS 注入・入力トラッカーは行わない(`allowedScripts.ts` を一切呼ばない)。リスト一覧へたどり着くために x.com のナビゲーションが必要なため、CSS で隠すこともしない。
- `contentView.addChildView` で最後に追加し、カラムビューより手前に表示する。bounds は `{ x: 0, y: TOOLBAR_HEIGHT, width, height: contentHeight - TOOLBAR_HEIGHT }`。ウィンドウの `resize` で再配置する。
- 代替案: カラムを1本追加してそこでリストを選ばせる → 幅 380px では x.com がコンパクト表示になり、リスト一覧への導線が見つけにくいため不採用。
- 代替案: シェルの DOM 内に表示 → `<webview>` は使わない方針(spec.md 2)のため不採用。

### D2. 初期 URL
本番は `https://x.com/home` を開き、ユーザーが x.com の通常のメニューからリスト一覧へ移動する。テストビルドは `${TEST_ORIGIN}/lists.html`(fixture のリスト一覧)を開く。初期 URL は `ListPicker` の定数1箇所で持つ。

### D3. リストURLの判定は共有の純粋関数 `parseListUrl`
`src/shared/parseColumnInput.ts` に `parseListUrl(url, extraOrigins): { id, url } | null` を追加し、`LIST_PATH` を共有する。
- `https://x.com/i/lists/<数字>` (末尾 `/` 可、クエリ・ハッシュは無視)を `{ id, url: 'https://x.com/i/lists/<数字>' }` に正規化する。下位ページ(`/members` 等)は `null`。
- テストビルドの追加オリジンでは `${origin}/i/lists/<数字>` を同様に判定し、URL のオリジンは保持する(E2E で実サイトを開かないため)。
- 「このリストを追加」の可否(`canAdd`)と追加処理の両方でこの関数を使い、判定を一致させる。
- 既存の `parseColumnInput` のリスト判定もこの関数経由に寄せ、入力時とリスト選択時で同じ規則にする(外部から見た挙動は変えない)。

### D4. 追加処理は `ColumnManager` の共通経路を使う
`ColumnManager.add(input)` の「解釈結果からカラムを作って保存・表示・スクロールする」部分を `addParsed(parsed)` として切り出し、`add` と `addListFromPicker(url)` の両方から呼ぶ。`addListFromPicker` は押下時点の URL を `parseListUrl` で再判定し(状態通知との競合対策)、`null` ならエラーを返す。タイトルは「リスト <ID>」。

### D5. IPC
`ipcChannels.ts` に以下を追加し、既存と同じ `createGuard` で検証する。
- shell → main: `picker:open`(無引数)、`picker:close`(無引数)、`picker:add`(無引数、`AddColumnResult` を返す)
- main → shell: `picker:state` `{ open: boolean; canAdd: boolean }`
`picker:open` は `ColumnManager` が未生成(ログイン前)なら何もしない。既に開いていれば何もしない。`picker:state` は開閉時と、リスト選択画面の `did-navigate` / `did-navigate-in-page` のたびに送る。リスト選択画面の URL 自体はシェルへ送らない(必要がないため)。

### D6. ツールバーの表示切り替え
`App.tsx` が `picker:state` を保持し、`Toolbar` は `open` のとき追加フォームと「全カラム更新」の代わりに「このリストを追加」(`canAdd` のときのみ有効)・「キャンセル」・案内文(`canAdd` でないとき「追加したいリストを開いてください」)を表示する。閉じているときは追加フォームの隣に「リストから選ぶ」を表示する。ツールバーはリスト選択画面より上にあり隠れない。

### D7. テスト
- Vitest: `parseListUrl`(x.com、末尾 `/`、クエリ付き、下位ページ、他ドメイン、追加オリジン)と、既存 `parseColumnInput` テストの回帰。
- Playwright: fixture に `lists.html`(リストへのリンク・外部リンク)と、`/i/lists/<数字>` を返すリストページを追加し、fixture サーバに `/i/lists/<数字>` → `list.html` の対応を追加する。開く→案内表示→リストを開く→追加→カラム追加と画面の閉鎖、キャンセル、下位ページで押せない、外部リンク、リサイズ追従、二重に開かない、を確認する。
- `check:guardrails` は変更不要(`ListPicker.ts` に `executeJavaScript`・`insertCSS` を書かない)。`insertCSS` の呼び出し箇所が `ColumnView.ts` のみであることをレビューで確認する。

## Risks / Trade-offs

- [x.com のメニューからリスト一覧へたどり着けない幅・レイアウトになる] → リスト選択画面はウィンドウ幅いっぱいで表示し、CSS で隠さない。最小ウィンドウ幅(480px)では x.com がコンパクト表示になるが、メニューからリストへ移動できる。
- [x.com がリストの URL 形式を変える] → 判定は `parseListUrl` の1箇所。変わった場合も「追加できない」だけで誤った追加は起きない。
- [リスト選択画面を開いている間はカラムが見えない] → 選択は短時間の操作であり許容。自動更新は継続する。
- [カラムタイトルがリスト名にならない] → ガードレール上の制約として受け入れる。README に記載し、M1 のタイトル編集で変更できる。

## Open Questions

- x.com 側に「自分のリスト一覧」を直接開ける安定した URL があれば、本番の初期 URL を `https://x.com/home` から変更する(実サイト確認時に判断。仕様・タスク構成には影響しない)。
