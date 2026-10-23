# Design

## Context

- 前提は `add-columnist-m0-foundation` の実装完了・アーカイブ。M0 の構成(main がレイアウトの唯一の計算主体、`allowedScripts.ts` 集約、`parseColumnInput` のルール配列、`RefreshScheduler`、IPC 送信元検証)をそのまま拡張する。動機は proposal.md の Why を参照。
- 設定スキーマは M0 で `paused` とカラム別の `width`/`refreshIntervalSec`/`zoomFactor` を定義済みのため、`version` は 1 のまま。

## Goals / Non-Goals

**Goals:**
- 既存モジュールの境界を変えずに機能を追加する(新しい main 側モジュールは作らない)
- ショートカットはカラムビューにフォーカスがあっても効くようにする(x.com 側のキー操作に依存しない)

**Non-Goals:**
- カラムビュー(x.com)のダークモード化や配色調整
- ショートカットのカスタマイズ、Windows/Linux 向けキーバインド
- デッキ・複数アカウント(M2)

## Decisions

### D1. 並べ替え: dnd-kit をヘッダ帯のみに適用
シェルのヘッダ帯に `@dnd-kit/sortable` の水平リストを置き、ドロップ確定時に `columns:reorder { ids }` を送る。main は ids が現在のカラム集合と完全一致する場合のみ順序を更新・保存し、`columns:changed` と再レイアウトで応答する。ドラッグ中はシェル内でヘッダだけを動かし、カラム本体(ネイティブビュー)は確定後に移動する。
- 代替案: ドラッグ中もカラム本体を追従させる → IPC と `setBounds` が高頻度になりちらつくため不採用。
- ドラッグ開始は 5px 以上の移動を条件にし(`PointerSensor` の activation constraint)、ヘッダのボタンクリックやタイトルのダブルクリックと競合させない。

### D2. カラム設定・デフォルト設定は `columns:update` と新チャネル `defaults:update`
- カラム単位の変更(タイトル・幅・間隔・ズーム・paused)は既存の `columns:update { id, patch }` に集約し、patch を zod の部分スキーマで検証する。
- デフォルト値の変更のために `defaults:get` / `defaults:update { patch }` を `ipcChannels.ts` に追加する(spec.md 6 に未記載の追加。デフォルト値の読み書き以外の用途は持たせない)。
- 間隔変更時は `RefreshScheduler` が当該カラムのタイマーを張り直す(分散は適用せず、変更時点から新間隔)。ズーム変更は `webContents.setZoomFactor`、幅変更は再レイアウト。

### D3. 一時停止
- カラム単位は `columns:update { id, patch: { paused } }`。全体は `columns:update` を全カラム分送るのではなく、main 側の `ColumnManager.setAllPaused(paused)` を呼ぶ `columns:pauseAll { paused }` チャネルを追加して1回の保存にまとめる。
- `shouldRefresh` は M0 で `paused` を判定済みなので変更しない。手動更新(`columns:refresh`)は paused を見ない。

### D4. ショートカットはアプリメニューのアクセラレータで実装
`menu.ts` のメニュー項目に accelerator を割り当てる。メニューアクセラレータはフォーカスがどの WebContents にあっても main で処理されるため、カラムビューに preload やキー監視スクリプトを入れずに済む(ガードレール 1.3 を維持)。
- `Cmd+1`〜`9`: main がレイアウトから対象カラムの x を求め、カラム全体が見える `scrollX` に更新(右端が切れる場合は右端合わせ、左端が切れる場合は左端合わせ)→ 再レイアウト → `layout:metrics` に `scrollX` を含めてシェルのスクロールバーを同期 → `webContents.focus()`。
- 「フォーカス中カラム」は各カラムビューの `focus`/`blur` イベントで main が追跡する。
- `Cmd+R` 系の既定ロールは使わない(`Cmd+Shift+R` を全カラム更新に割り当てるため、既定の reload/forceReload ロールはメニューから外す)。
- 代替案: `globalShortcut` → アプリ非アクティブ時にも奪うため不採用。`before-input-event` → カラムごとの登録が必要で冗長なため不採用。

### D5. 入力解釈の拡張
`parseColumnInput` のルール配列に `@username`(`^@[A-Za-z0-9_]{1,15}$`)、`search:`(trim 後に空ならエラー、`encodeURIComponent`)、`home`(完全一致・大文字小文字無視)を、既存の「その他 x.com URL」ルールより前に追加する。

### D6. ダークモード
シェルの CSS を CSS 変数で定義し、`prefers-color-scheme` メディアクエリで切り替える。Electron の `nativeTheme.themeSource` は `system` のまま(既定)なので OS 変更は自動で反映される。カラムビューには何もしない。

### D7. タイトル編集
ダブルクリックで input に切り替え、Enter/blur で確定、Escape で取消。trim 後に空なら元の値を維持(送信しない)。最大長は 100 文字(スキーマにも追加。既存データは全て100文字以下と見なせるため version は据え置き)。

## Risks / Trade-offs

- [`Cmd+P`/`Cmd+T` などがアプリメニューに奪われ、x.com 側の同名ショートカットが使えなくなる] → 個人用アプリとして許容。README のショートカット一覧に明記。
- [ドラッグ中はヘッダとカラム本体の位置が一時的にずれる] → 確定時に即再レイアウトするため短時間で解消。視覚的にドラッグ中と分かるスタイルを付ける。
- [IPC チャネル追加(`defaults:*`, `columns:pauseAll`)で spec.md 6 との差分が生じる] → `ipcChannels.ts` を正とし、追加理由をコメントで残す。
- [タイトル最大長の追加] → スキーマの後方互換は保たれるが、100文字超の既存値があると M0 の退避処理が走る。M0 の UI では長大なタイトルは生成されないため実害は小さい。

## Migration Plan

設定ファイルのスキーマは version 1 のまま(タイトル最大長の制約追加のみ)。マイグレーション処理は不要。
