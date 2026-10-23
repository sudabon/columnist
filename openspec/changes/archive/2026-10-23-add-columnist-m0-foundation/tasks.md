# Tasks

## 1. プロジェクト初期化

- [x] 1.1 electron-vite の React + TypeScript テンプレートで初期化し、Electron を着手時点の最新安定版に厳密固定する。`npm run dev` で空ウィンドウが起動することを確認する
- [x] 1.2 `tsconfig` を strict にし、ESLint + Prettier を設定する。`npm run lint` と `npm run typecheck` が成功することを確認する
- [x] 1.3 Vitest を設定し、サンプルテストで `npm test` が成功することを確認する
- [x] 1.4 spec.md 3.3 のディレクトリ構成(空ファイル/プレースホルダ)を作成し、ビルドが通ることを確認する
- [x] 1.5 ビルドモード `test` で `__COLUMNIST_TEST__` を define する設定を追加し、本番ビルド成果物に `COLUMNIST_TEST_ORIGIN` の文字列が含まれないことを grep で確認する

## 2. 共有型と設定

- [x] 2.1 `shared/types.ts`(Column, Config, IPC ペイロード型)と `shared/ipcChannels.ts`(spec.md 6 の全チャネル定数)を作成し、typecheck が通ることを確認する
- [x] 2.2 `config/schema.ts` に zod スキーマ(type 列挙、URL 正規化と `https://x.com/` 制約、width 300〜640、refreshIntervalSec 60〜3600、zoomFactor 0.5〜1.5、既定値)を実装し、境界値・正規化のユニットテストが通ることを確認する
- [x] 2.3 `config/store.ts` に読み込み・マイグレーション(version 別変換マップ、未知の新版は失敗)・原子的書き込み・`config.broken-<timestamp>.json` 退避を実装し、不正JSON/スキーマ違反/version 99/ファイルなしのユニットテストが通ることを確認する
- [x] 2.4 `shared/parseColumnInput.ts` に M0 範囲の入力解釈(数字のみ、x.com/twitter.com のリストURL、スキームなし、その他 x.com URL、エラー)を順序付きルールで実装し、spec の全シナリオのユニットテストが通ることを確認する

## 3. レイアウト

- [x] 3.1 `window/layout.ts` に `computeLayout` を純粋関数で実装し、カラム数0/1/多数、scrollX のクランプ、画面外カラムの visible=false、ツールバー40px+ヘッダ32px+スクロールバー領域を考慮した y/height のユニットテストが通ることを確認する
- [x] 3.2 `window/windowState.ts` にウィンドウ位置・サイズの保存(500ms デバウンス)と、ディスプレイ外の場合の補正を実装し、補正ロジックのユニットテストが通ることを確認する

## 4. ウィンドウとビューの骨格

- [x] 4.1 `main/index.ts` で `BaseWindow` + シェルビュー(全面)を生成し、`windowState` で位置・サイズを復元する。`npm run dev` でシェル UI が表示されることを確認する
- [x] 4.2 `session/session.ts` で `persist:columnist-default` を生成し、`setPermissionRequestHandler`/`setPermissionCheckHandler` で全権限拒否を設定する。fixture ページの通知要求が拒否されることを E2E で確認する
- [x] 4.3 `columns/ColumnView.ts` を実装する(カラムビューは contextIsolation/sandbox 有効・nodeIntegration 無効・preload なし、zoomFactor 適用)。x.com のリスト1本がカラム位置に表示されることを手動で確認する
- [x] 4.4 `preload/shell.ts` で contextBridge による最小 API(IPC チャネルごとの関数のみ)を公開し、シェルに `default-src 'self'` 基本の CSP を設定する。カラムビューで `typeof require` / `typeof window.columnist` が `undefined` であることを DevTools で確認する

## 5. ガードレールの集約

- [x] 5.1 `columns/allowedScripts.ts` に `GET_SCROLL_Y`/`SCROLL_TO_TOP`/`INSTALL_INPUT_TRACKER`/`GET_LAST_INPUT` とその実行関数を実装する。入力トラッカーが時刻以外を記録しないことをコードレビューで確認する
- [x] 5.2 ESLint の `no-restricted-syntax` で `allowedScripts.ts` 以外での `executeJavaScript` 呼び出しを禁止し、違反コードを一時的に書いて lint が失敗することを確認する
- [x] 5.3 `npm run check:guardrails`(`executeJavaScript`・`api.x.com`・`graphql`・商標文字列の grep)を追加し、成功することを確認する

## 6. ログイン

- [x] 6.1 `session/auth.ts` に `auth_token` cookie の有無判定(値は参照しない)と `cookies.on('changed')` による出現検知を実装する。テストビルドでは fixture オリジンの cookie を見るよう切り替える
- [x] 6.2 未ログイン時に全面のログインビューで `https://x.com/i/flow/login` を表示し、ログイン検知後に破棄してカラム画面を構築する。E2E(fixture で cookie をセット)で画面遷移を確認する

## 7. カラム管理と IPC

- [x] 7.1 `ipc/handlers.ts` に送信元検証(`event.sender.id` がシェルの id と一致しなければ無視)とペイロードの zod 検証を行う共通ラッパを実装し、不一致時に無視されることをユニットテストで確認する
- [x] 7.2 `columns/ColumnManager.ts` にカラムの生成・破棄・レイアウト適用を実装し、`columns:list`/`columns:add`/`columns:remove`/`layout:scroll` ハンドラと `columns:changed`/`layout:metrics` 通知を実装する。追加・削除が設定ファイルに即時反映されることを E2E で確認する
- [x] 7.3 `columns:refresh`(単体/all)と `columns:navigate`(back/home)ハンドラ、`column:status`(lastRefreshedAt, isOnBaseUrl, canGoBack)通知を実装する。`isOnBaseUrl`(origin+pathname、/search は q も比較)のユニットテストが通ることを確認する
- [x] 7.4 ウィンドウの resize と起動時に全カラムの bounds を再計算し、リサイズでカラム高さが追従することを手動で確認する

## 8. シェル UI

- [x] 8.1 `Toolbar.tsx`(カラム追加ボタン、全カラム更新)と `AddColumnDialog.tsx`(入力・エラーメッセージ表示)を実装し、不正入力でエラーが表示されカラムが増えないことを E2E で確認する
- [x] 8.2 `ColumnHeader.tsx`(タイトル、相対表記の最終更新時刻、手動更新・戻る・先頭へ・削除、戻る/先頭へは基準URL外のみ表示)を実装し、fixture の詳細ページで「先頭へ」が機能することを E2E で確認する
- [x] 8.3 `HorizontalScroller.tsx` を実装し(rAF で間引いて `layout:scroll` 送信)、ウィンドウ幅を超えるカラム数で横スクロールにより全カラムを表示できることを E2E で確認する
- [x] 8.4 UI 文言・アプリ名・アイコンに X の商標が含まれないことを `check:guardrails` で確認する

## 9. ナビゲーション制御

- [x] 9.1 `columns/navigationGuard.ts` に `isAllowedUrl` を純粋関数で実装し、x.com/サブドメイン/外部ドメイン/http(s)以外のスキーム/テストオリジンのユニットテストが通ることを確認する
- [x] 9.2 `will-navigate`/`will-redirect` での遮断と `shell.openExternal`、`setWindowOpenHandler` の常時 deny を実装し、fixture の外部リンク・`target=_blank` リンクがアプリ内で開かないことを E2E で確認する(`shell.openExternal` はテストでスタブ化)

## 10. 自動更新

- [x] 10.1 `columns/refresh.ts` に `shouldRefresh` を純粋関数で実装し、paused/基準URL外/読み込み中/再生中/scrollY>10/操作15秒未満/全条件クリアの全分岐のユニットテストが通ることを確認する
- [x] 10.2 `RefreshScheduler`(カラムごとの setTimeout チェーン、初回遅延 `interval × i / N`、スキップ時も追いかけない)を実装し、フェイクタイマーで発火タイミングのユニットテストが通ることを確認する
- [x] 10.3 ウィンドウの minimize/hide で全停止、restore/show で再開する処理を実装し、フェイクタイマーまたはE2Eで最小化中に再読み込みされないことを確認する
- [x] 10.4 カラムビューの `dom-ready` で入力トラッカーと CSS を再注入し、再読み込み後に `lastRefreshedAt` がシェルへ通知されることを確認する(更新間隔の下限60秒は緩めない。E2E では手動更新経由で通知を確認し、自動発火はスケジューラのフェイクタイマー結合テストで確認する)

## 11. メニュー

- [x] 11.1 `menu.ts` にアプリメニュー(シェルの DevTools、各カラムの DevTools)を実装し、メニューから各 DevTools が開くことを手動で確認する

## 12. E2E 基盤

- [x] 12.1 `tests/fixtures/` に縦長ダミータイムライン・詳細ページ・外部リンク・通知要求ページを用意し、ローカルサーバで配信する仕組みを作る
- [x] 12.2 Playwright for Electron をテストビルド + 一時ユーザーデータディレクトリで起動するヘルパを作成し、`npm run test:e2e` が成功することを確認する

## 13. CSS とドキュメント

- [x] 13.1 実サイトで 380px 幅の表示を CSS なしで確認し、必要最小限の非表示ルールを `src/inject/x.css`(先頭に最終確認日、`data-testid` 優先)に追加する。追加前後のスクリーンショットで確認する
- [x] 13.2 README を書き直す(概要、X Corp. との無関係・データ収集/自動操作なし・規約遵守は自己責任の免責、ユーザー名+パスワードでのログイン前提、ビルド方法)。現行の「TweetDeck」表記を除去し、`check:guardrails` が通ることを確認する

## 14. 受け入れ確認

- [x] 14.1 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run check:guardrails` がすべて成功することを確認する
- [x] 14.2 spec.md 7 の M0 受け入れ基準10項目を実サイトで手動確認し、結果を記録する(初回ログイン→再起動でログイン不要、3カラム表示、横スクロール、放置で再読み込み、スクロール中は更新しない、詳細画面中は更新せず「先頭へ」で戻る、外部リンク、再起動で構成・ウィンドウ位置復元、x.css 調整、allowedScripts 以外の executeJavaScript なし)
