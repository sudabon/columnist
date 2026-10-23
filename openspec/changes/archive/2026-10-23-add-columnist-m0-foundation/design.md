# Design

## Context

- リポジトリは README と LICENSE のみのグリーンフィールド。動機は proposal.md の Why を参照。
- 実装の正典は `spec.md`(実装指示書)。特に「1. 方針とガードレール」は全判断に優先する。
- x.com は自動テスト対象にできない(自動アクセス禁止に抵触しうる)ため、E2E はローカル fixture で行い、実サイトの確認は受け入れ基準に沿って人が行う。

## Goals / Non-Goals

**Goals:**
- 規約リスクのある処理(JS実行・CSS注入・遷移許可)を少数のファイルに集約し、コードレビューと grep で検証可能にする
- レイアウト計算・更新判定・入力解釈・設定検証を Electron 非依存の純粋関数にしてユニットテストで担保する
- M1(並べ替え・カラム別設定・ショートカット)を後から追加しても構造を変えずに済む境界にしておく

**Non-Goals:**
- ドラッグ&ドロップ並べ替え、カラムごとの設定 UI、タイトル編集、一時停止 UI、ショートカット、`@user`/`search:`/`home` 入力、ダークモード(M1)
- 複数アカウント、デッキ、署名付き配布ビルド、Windows 対応(M2)
- ズーム操作 UI(M0 では設定値 `zoomFactor` の適用のみ)

## Decisions

### D1. `BaseWindow` + `WebContentsView` の重ね合わせ
シェルビューをウィンドウ全面に敷き、その上にカラムビューを `setBounds` で重ねる。ツールバー(40px)・ヘッダ帯(32px)・最下部スクロールバー領域はカラムビューで覆わない。
- 代替案: `BrowserView`(非推奨)、`<webview>`(セキュリティ・保守面で非推奨)→ 不採用。
- 代替案: ヘッダをカラムビュー側に注入 → x.com の DOM を触ることになりガードレール違反 → 不採用。

### D2. レイアウトは main が唯一の計算主体
`window/layout.ts` に `computeLayout({ columns: {id,width}[], scrollX, contentWidth, contentHeight })` → `{ bounds: {id,x,y,width,height,visible}[], totalWidth, viewportWidth, clampedScrollX }` を純粋関数で実装する。シェルは `layout:metrics` を受けて横スクロールバー(内部幅 = totalWidth のダミー要素を持つ `overflow-x: auto` の div)とヘッダ位置を描画し、`scroll` イベントを `requestAnimationFrame` で間引いて `layout:scroll` を送る。完全に画面外のカラムは `visible: false`。
- 代替案: シェル側で bounds を計算して main に送る → 2箇所に計算が分散するので不採用。

### D3. 許可スクリプトの単一モジュール化
`columns/allowedScripts.ts` に3つの定数(`GET_SCROLL_Y`, `SCROLL_TO_TOP`, `INSTALL_INPUT_TRACKER` + 読み出し用 `GET_LAST_INPUT`)と、それを実行する薄い関数のみを置く。`executeJavaScript` の呼び出しはこのファイル内だけに限定し、ESLint の `no-restricted-syntax`(`executeJavaScript` のメンバー呼び出し禁止、当ファイルのみ override)で機械的に強制する。`GET_LAST_INPUT` は `window.__columnistLastInput` を読むだけで、spec の「操作中判定」用途の一部として扱う。入力トラッカーは `dom-ready` ごとに再インストールする(冪等)。
- `INSTALL_INPUT_TRACKER` は `{ passive: true, capture: true }` のリスナで `Date.now()` を代入するだけとし、イベントオブジェクトの中身は参照しない。
- 実行には `executeJavaScriptInIsolatedWorld`(専用の isolated world)を使う。`window.scrollY` や DOM イベントはページと共有される一方、`__columnistLastInput` はページ側のスクリプトから見えないため、x.com 側に痕跡を残さない。

### D4. 自動更新: タイマーと判定の分離
- `columns/refresh.ts` に `shouldRefresh(state): { refresh: boolean; reason?: SkipReason }` を純粋関数として置く。入力は `{ paused, isOnBaseUrl, isLoading, isAudible, scrollY, lastInputAt, now }`。判定順は spec.md 5.3 の擬似コードどおり(安価な判定を先に行い、JS 実行は必要時のみ)。
- `RefreshScheduler` がカラムごとに `setTimeout` チェーンを持つ。初回遅延 `interval × i / N`、以後 `interval` 固定。スキップ時も次回は通常間隔(追いかけない)。
- ウィンドウの `minimize`/`hide` で全停止、`restore`/`show` で再開する。再開時は分散を再適用する。
- `lastInputAt` が未定義(トラッカー未インストール)の場合は 0 とみなす。`executeJavaScript` が失敗した場合はスキップ扱い。
- 代替案: `setInterval` → 停止・再開や間隔変更(M1)の扱いが煩雑なので不採用。

### D5. 基準URL判定
`isOnBaseUrl(current, base)` は origin と pathname(末尾 `/` を除去)を比較し、`/search` の場合のみ `q` パラメータも比較する。x.com がクエリの順序や追跡パラメータを付け替えても誤判定しないための割り切り。

### D6. ナビゲーション制御
`columns/navigationGuard.ts` に `isAllowedUrl(url, allowedHosts)` を純粋関数で置き、`will-navigate`/`will-redirect` で不許可なら `preventDefault()` し、`http(s)` なら `shell.openExternal`。`setWindowOpenHandler` は常に `{ action: 'deny' }`。許可ホストは `x.com` とそのサブドメイン。
- テストオリジン: electron-vite のビルドモードで `__COLUMNIST_TEST__` を define し、テストビルドでのみ `COLUMNIST_TEST_ORIGIN` を読む。本番ビルドではデッドコードとして除去されるため、環境変数を設定しても効かない。
- カラムの基準URLも `allowedHosts` で検証するため、E2E ではテストオリジンの URL をカラムに設定できる(テストビルドのみ、zod の URL 制約も同じフラグで緩める)。

### D7. ログイン
- `session/session.ts` で `persist:columnist-default` を生成し、権限ハンドラ(全拒否)を設定する。
- `session/auth.ts` は `cookies.get({ domain: 'x.com', name: 'auth_token' })` の件数のみを見る(値は参照しない)。未ログインならログイン用 `WebContentsView` を全面表示し、`cookies.on('changed')` で `auth_token` の追加(`removed === false`)を検知したら破棄してカラム画面を構築する。
- User-Agent は変更しない(spec.md 9. の方針。問題が出た場合のみ別途検討)。

### D8. 設定の読み書き
- `config/schema.ts` に zod スキーマ。URL は `preprocess` で `twitter.com` → `x.com` 正規化後に `startsWith('https://x.com/')` を検証。
- `config/store.ts` は「読み込み → JSON パース → `migrate(raw)`(`version` ごとの変換関数マップを順適用。未知の新版は失敗)→ スキーマ検証」。失敗時は `config.broken-<timestamp>.json` へ rename して既定値で起動。
- 書き込みは一時ファイルに書いてから rename(原子的書き込み)。ウィンドウの `move`/`resize` は 500ms デバウンスで保存。
- 復元時は `screen.getAllDisplays()` の作業領域と交差しなければ主ディスプレイ中央へ補正する。

### D9. IPC
- `shared/ipcChannels.ts` に spec.md 6 のチャネル定数、`shared/types.ts` にペイロード型を定義。M0 で使わない `columns:reorder` は定数のみ定義し、ハンドラは M1 で実装する。
- shell → main は `ipcMain.handle` + 戻り値で結果/エラーを返す。全ハンドラ共通のラッパで `event.sender.id === shellView.webContents.id` を検証し、不一致は無視。ペイロードも zod で検証する。
- main → shell は `webContents.send`。`column:status` はナビゲーション・再読み込みイベント時に送る。

### D10. カラム追加の入力解釈
`shared/parseColumnInput.ts` に純粋関数 `parseColumnInput(input) → { ok: true, type, url } | { ok: false, error }` を置く(M1 で形式を追加しやすいよう、判定を順序付きのルール配列で表現)。main 側で呼び出して検証し、シェルはエラーメッセージを表示するだけ。

### D11. CSS 注入
`src/inject/x.css` をビルド時に文字列として取り込み、`dom-ready` ごとに `insertCSS`。M0 ではまず CSS なしで実サイトを確認し、必要最小限のみ追加する(候補: 下部ナビ、上部ヘッダ、ログイン促進バナー、サイドバー。`data-testid` セレクタ優先)。

### D12. カラム追加フォームはツールバー内にインライン表示
カラムビュー(ネイティブビュー)はシェルの DOM より手前に描画されるため、シェル内のモーダルはカラムに隠れる。M0 では `AddColumnDialog` をツールバー内のインラインフォーム(入力欄・追加ボタン・エラー表示)として実装し、重なりの問題を避ける。モーダルが必要になる M1 の設定ダイアログでは、表示中にカラムビューを隠すなどの対処が別途必要。

### D13. テスト構成
- Vitest: `layout`, `shouldRefresh`, `isOnBaseUrl`, `isAllowedUrl`, `parseColumnInput`, `config`(スキーマ・退避・マイグレーション)。
- Playwright for Electron: テストビルドで `COLUMNIST_TEST_ORIGIN` をローカル fixture サーバ(縦長ダミータイムライン + 外部リンク + 詳細ページ)に向け、ユーザーデータディレクトリを一時ディレクトリに分離して起動。ログイン判定はテストビルドで fixture オリジンの `auth_token` cookie を見るよう切り替える。
- ガードレール検査: `executeJavaScript` の出現箇所を確認するスクリプトを `npm run check:guardrails` として用意し CI/手元で実行する。

## Risks / Trade-offs

- [x.com の狭幅表示が想定と異なる/CSS が効かなくなる] → CSS は最小限・単一ファイル・最終確認日付き。崩れても機能は止まらない。
- [組み込みブラウザでログインが拒否される] → ユーザー名+パスワード前提を README に明記。UA 偽装はしない。
- [ログインフロー中に x.com 以外(例: 認証用サブドメインや外部IdP)へ遷移する] → 許可ホストは x.com とサブドメインのみ。外部IdP は既定ブラウザへ逃げ、ログインできないことを README で案内する。実サイト確認で問題が出た場合のみ許可対象を個別検討する。
- [カラム数増加によるメモリ消費] → 画面外カラムは非表示にするが WebContents は保持する(タイマー継続のため)。M2 で更新間隔延長を検討。
- [`isOnBaseUrl` の割り切りによる誤判定] → 誤判定時は更新されないか、詳細画面で更新されるだけ(後者はスクロール位置判定でも防がれる)。fixture とユニットテストで代表パターンを担保。
- [Electron の最新安定版は変化する] → 実装着手時点の最新安定版に固定し、`package.json` で厳密なバージョンを指定する。

## Migration Plan

新規アプリのため移行なし。設定ファイルは `version: 1` から開始する。

## Open Questions

- 注入 CSS で非表示にする要素の最終決定(M0 の実サイト確認で決める。spec・構造には影響しない)。
