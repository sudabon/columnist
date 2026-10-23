# Proposal

## Why

x.com のリスト・検索・タイムラインを複数並べて自動更新しながら眺めたいが、X API は開発者契約の対象外であり使えない。公式Web画面を縦カラムで並べるだけの個人用デスクトップアプリ「Columnist」を、規約上のガードレールを守った最小構成(spec.md の M0)として立ち上げる。リポジトリは現在 README と LICENSE のみの空の状態であり、以降のマイルストーン(M1/M2)の土台となる。

## What Changes

- electron-vite + React + TypeScript(strict) のプロジェクトを新規に初期化し、ESLint / Prettier / Vitest / Playwright for Electron を整備する
- `BaseWindow` + シェルビュー(ツールバー・カラムヘッダ・横スクロールバー) + カラムビュー(x.com を表示する `WebContentsView`)の基本構成を作る
- 永続セッション `persist:columnist-default` を共有したログインフロー(`auth_token` cookie の有無のみで判定)
- カラムの追加(リストID / リストURL / 任意の x.com URL)・削除と、固定幅カラムの横並び + 横スクロール
- `webContents.reload()` のみによる自動更新(スクロール中・操作中・詳細画面閲覧中・再生中はスキップ、開始タイミング分散、非表示時停止)
- カラムヘッダの最小機能(最終更新時刻、手動更新、戻る、先頭へ、削除)
- 設定(`config.json`、zod 検証、壊れたファイルの退避、マイグレーション構造)とウィンドウ状態の保存・復元
- x.com 以外への遷移の拒否と外部リンクの既定ブラウザ起動
- セキュリティ設定(sandbox / contextIsolation / 全権限拒否 / CSP / IPC 送信元検証)と、メニューからの DevTools
- カラムビューで実行する JavaScript を `allowedScripts.ts` に限定し、注入 CSS を見た目調整のみに限定するガードレール
- README を全面的に書き直す(概要・免責・ログイン方法・ビルド方法)。現行 README の「TweetDeck」表記は商標ガードレールに抵触するため除去する

## Capabilities

### New Capabilities
- `execution-guardrails`: X API・内部API・DOM読み取り・自動操作・中身依存機能を行わないこと、カラムビューで許可されるスクリプト/CSS、商標不使用、テレメトリ不搭載などの横断的禁止事項
- `session-login`: 永続パーティションの共有、cookie 有無のみによるログイン判定、ログイン画面からカラム画面への遷移
- `column-management`: カラム追加時の入力解釈(M0範囲)、追加・削除、カラムヘッダの最小操作(手動更新・戻る・先頭へ・削除・最終更新時刻)
- `column-layout`: 固定幅カラムの横並び、横スクロール、画面外カラムの非表示、x.com への見た目調整 CSS の注入
- `auto-refresh`: カラムごとの独立タイマーによる再読み込みと、スキップ条件・開始分散・非表示時停止
- `navigation-control`: カラム内遷移の x.com 限定、新規ウィンドウ拒否、外部リンクの既定ブラウザ起動、テスト用オリジン切り替え
- `config-persistence`: 設定ファイルのスキーマ検証・保存・退避・マイグレーション、ウィンドウ位置/サイズの復元
- `app-security`: ビューごとの webPreferences、全権限拒否、シェルの CSP、IPC 送信元検証、メニューからの DevTools

### Modified Capabilities
- なし(既存 spec なし)

## Impact

- 新規コード: `src/main/**`, `src/preload/shell.ts`, `src/renderer/**`, `src/inject/x.css`, `src/shared/**`, `tests/**`
- 新規設定: `package.json`, `electron.vite.config.ts`, `electron-builder.yml`, ESLint/Prettier/Vitest/Playwright 設定
- 依存追加: electron, electron-vite, react, react-dom, zod, typescript, vitest, @playwright/test, eslint, prettier, electron-builder
- ドキュメント: `README.md` を書き換え
- 後続: `add-columnist-m1-daily-use` は本 change のアーカイブ後に適用する前提
