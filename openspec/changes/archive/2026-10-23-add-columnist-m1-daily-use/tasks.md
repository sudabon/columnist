# Tasks

## 1. 前提確認と依存追加

- [x] 1.1 `add-columnist-m0-foundation` がアーカイブ済みで `openspec/specs/column-management/spec.md` が存在することを確認し、`openspec validate add-columnist-m1-daily-use --strict` が INFO なしで成功することを確認する
- [x] 1.2 `@dnd-kit/core` と `@dnd-kit/sortable` を追加し、`npm run build` が成功することを確認する

## 2. 入力解釈の拡張

- [x] 2.1 `parseColumnInput` のルール配列に `@username`/`search:`/`home` を「その他 x.com URL」より前に追加し、spec の全シナリオ(空の `search:`、日本語キーワードのエンコード、大文字の `HOME` を含む)のユニットテストが通ることを確認する

## 3. main 側の拡張

- [x] 3.1 `ipcChannels.ts` に `defaults:get`/`defaults:update`/`columns:pauseAll` を追加し、タイトル最大長100文字をスキーマに追加する。typecheck とスキーマのユニットテストが通ることを確認する
- [x] 3.2 `columns:update` ハンドラで部分スキーマ検証を行い、タイトル・幅・間隔・ズーム・paused の変更を反映・保存する。範囲外値が拒否されることをユニットテストで確認する
- [x] 3.3 `RefreshScheduler` にカラム単位の間隔変更(タイマーの張り直し)を追加し、フェイクタイマーで新間隔で発火することをユニットテストで確認する
- [x] 3.4 `columns:reorder` ハンドラ(ids が現在の集合と完全一致する場合のみ更新)を実装し、不一致時に拒否されること・保存されることをユニットテストで確認する
- [x] 3.5 `ColumnManager.setAllPaused` と `columns:pauseAll` ハンドラを実装し、1回の保存で全カラムの paused が切り替わることをユニットテストで確認する
- [x] 3.6 `defaults:get`/`defaults:update` ハンドラを実装し、既存カラムの値が変わらず新規カラムにのみ適用されることをユニットテストで確認する

## 4. シェル UI

- [x] 4.1 ヘッダ帯を dnd-kit の水平 sortable にし(5px の activation constraint)、ドロップ確定時に `columns:reorder` を送る。E2E で並べ替え後に再起動しても順序が保たれることを確認する
- [x] 4.2 `ColumnHeader.tsx` にタイトルのダブルクリック編集(Enter/blur 確定、Escape 取消、空は維持)と一時停止/再開ボタン(状態を識別できる表示)を追加し、E2E で編集・一時停止の保存を確認する
- [x] 4.3 カラム設定ダイアログ(幅・間隔・ズーム、範囲外はエラー表示)を実装し、E2E でカラムごとに異なる値が保存・反映されることを確認する
- [x] 4.4 ツールバーに全カラム一時停止/再開とデフォルト設定ダイアログを追加し、E2E でデフォルト幅変更後の新規カラムにのみ適用されることを確認する
- [x] 4.5 シェルの CSS を CSS 変数化し `prefers-color-scheme` でダーク配色を定義する。Playwright の `colorScheme` エミュレーションでダーク配色になることを確認し、カラムビューへ追加の注入がないことを `check:guardrails` で確認する

## 5. ショートカット

- [x] 5.1 `menu.ts` に `Cmd+T`/`Cmd+Shift+R`/`Cmd+P` のアクセラレータを割り当て、既定の reload 系ロールを外す。カラムにフォーカスがある状態でも動作することを手動で確認する
- [x] 5.2 カラムビューの `focus`/`blur` でフォーカス中カラムを追跡し、`Cmd+Option+I` と `Cmd+=`/`-`/`0`(0.5〜1.5 にクランプ、保存)を実装する。ズームのクランプ計算をユニットテストで、DevTools とズーム保存を手動で確認する
- [x] 5.3 `Cmd+1`〜`9` で対象カラム全体が見える `scrollX` を計算する関数を `layout.ts` に純粋関数で追加し(ユニットテストで左端/右端合わせ・存在しないカラムを確認)、スクロール同期とフォーカス移動を E2E で確認する

## 6. ドキュメントと受け入れ確認

- [x] 6.1 README にショートカット一覧と入力形式(`@user`/`search:`/`home`)を追記し、`check:guardrails` が通ることを確認する
- [x] 6.2 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run check:guardrails` がすべて成功することを確認する
- [x] 6.3 spec.md 7 の M1 受け入れ基準4項目を実サイトで手動確認し、結果を記録する(並べ替えの永続化、カラムごとの幅・間隔・ズームの保存、`Cmd+1`〜`9` で画面外カラムへスクロール・フォーカス、一時停止中は再読み込みされない)
  - 2026-10-23 実サイトで確認: 4項目すべて OK(並べ替えの永続化 / カラムごとの幅・間隔・ズームの保存 / `Cmd+1`〜`9` のスクロール・フォーカス / 一時停止中は再読み込みされない)。5.1・5.2 のショートカットも手動確認 OK
