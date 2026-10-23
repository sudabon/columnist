# Proposal

## Why

M0(`add-columnist-m0-foundation`)で「並べて自動更新しながら眺める」最小構成はできるが、カラムの順序・幅・間隔を変えられず、キーボード操作もできないため日常使いには不便が残る。spec.md の M1 として、毎日使い続けられる操作性を追加する。

## What Changes

- ドラッグ&ドロップでのカラム並べ替え(順序は保存され再起動後も保持)
- カラムごとの幅・更新間隔・ズームの設定、およびデフォルト値(幅・間隔・ズーム)の設定ダイアログ
- カラムヘッダの全機能: タイトルのダブルクリック編集、一時停止/再開、カラム設定(M0 の手動更新・戻る・先頭へ・削除・最終更新時刻に追加)
- 全カラムの一時停止/再開(ツールバー)
- キーボードショートカット(`Cmd+T`、`Cmd+Shift+R`、`Cmd+1`〜`9`、`Cmd+P`、`Cmd+Option+I`、`Cmd+=`/`-`/`0`)
- カラム追加の入力形式の拡張(`@username`、`search:キーワード`、`home`)
- シェルUIのダークモード(OS 設定に追従。x.com の表示には介入しない)

## Capabilities

### New Capabilities
- `keyboard-shortcuts`: カラム追加・全更新・カラムフォーカス(画面外なら横スクロール)・全一時停止・DevTools・ズームのショートカット
- `shell-theme`: シェルUIの外観を OS のライト/ダーク設定に追従させる

### Modified Capabilities
- `column-management`: 入力解釈に `@username`/`search:`/`home` を追加(既存要件の変更)。並べ替え、カラム別設定、デフォルト設定、タイトル編集、カラム単位および全カラムの一時停止/再開を追加

## Impact

- 前提: `add-columnist-m0-foundation` が実装・アーカイブ済みであること(本 change の `column-management` デルタは M0 で作成される main spec に対して適用される)
- 変更コード: `src/shared/parseColumnInput.ts`, `src/main/columns/ColumnManager.ts`, `src/main/columns/refresh.ts`(スケジューラの間隔変更・一時停止反映), `src/main/ipc/handlers.ts`(`columns:reorder`, `columns:update`), `src/main/menu.ts`, `src/renderer/**`
- 新規コード: カラム設定ダイアログ、デフォルト設定ダイアログ、ドラッグ&ドロップ用のヘッダ帯コンポーネント
- 依存追加: `@dnd-kit/core`, `@dnd-kit/sortable`
- 設定ファイル: スキーマ変更なし(`paused`・カラム別値は M0 で定義済み)
