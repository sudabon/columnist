# Tasks

## 1. リストURL判定の共有化

- [x] 1.1 `src/shared/parseColumnInput.ts` に `parseListUrl(url, extraOrigins)` を追加し、既存のリスト判定をこの関数経由に寄せる。x.com・末尾 `/`・クエリ付き・下位ページ(`/members`)・他ドメイン・追加オリジンのユニットテストが通り、既存の `parseColumnInput` テストもすべて通ることを確認する

## 2. main 側

- [x] 2.1 `ColumnManager` の追加処理を `addParsed` に切り出し、`addListFromPicker(url)`(押下時点の URL を再判定、リスト以外はエラー)を追加する。既存の E2E(カラム追加・削除)が通ることを確認する
- [x] 2.2 `src/main/columns/ListPicker.ts` を実装する(カラムビューと同じ webPreferences、`attachNavigationGuard` 適用、スクリプト実行・CSS 注入なし、ツールバー下の全面に配置、開閉、URL 変化の通知、初期 URL は本番 `https://x.com/home` / テストビルド `${TEST_ORIGIN}/lists.html`)。`ListPicker.ts` に `executeJavaScript`・`insertCSS` がないことを grep で確認する
- [x] 2.3 `ipcChannels.ts` に `picker:open` / `picker:close` / `picker:add` / `picker:state` を追加し、`createGuard` 経由のハンドラを実装する(ログイン前・二重オープンは無視)。`index.ts` でウィンドウの resize 時に再配置する。typecheck が通ることを確認する

## 3. シェル UI

- [x] 3.1 `preload/shell.ts` と `ColumnistApi` に `openPicker` / `closePicker` / `addFromPicker` / `onPickerState` を追加する。typecheck が通ることを確認する
- [x] 3.2 `Toolbar` に「リストから選ぶ」と、選択中の「このリストを追加」(`canAdd` のときのみ有効)・「キャンセル」・案内文を実装し、`App.tsx` で `picker:state` を保持する。lint が通ることを確認する

## 4. E2E

- [x] 4.1 fixture に `lists.html`(リストへのリンク・外部リンク)とリストページを追加し、fixture サーバで `/i/lists/<数字>` をリストページとして返す。既存 E2E がすべて通ることを確認する
- [x] 4.2 E2E を追加する: 開く→案内表示で追加不可→リストを開くと追加可→追加でカラムが「リスト <ID>」として追加・保存され画面が閉じる/キャンセルでカラム構成が変わらない/下位ページでは追加不可/外部リンクは既定ブラウザ/リサイズ追従/二重に開かない。`npm run test:e2e` がすべて通ることを確認する

## 5. ドキュメントと確認

- [x] 5.1 README の使い方に「リストから選ぶ」とタイトルの扱い(「リスト <ID>」になる)を追記し、`check:guardrails` が通ることを確認する
- [x] 5.2 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run check:guardrails` がすべて成功することを確認する
- [x] 5.3 実サイトで、ログイン済みの状態から「リストから選ぶ」→ x.com のメニューで自分のリスト一覧→リストを開く→「このリストを追加」でカラムが追加されることを手動で確認し、初期 URL の見直し要否(design の Open Questions)を記録する
