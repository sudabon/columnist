# Proposal

## Why

M0 ではリストを追加するのにリストIDかURLを入力する必要があり、ユーザーは x.com でリストを開いてURLをコピーしてから貼り付けている。アプリが自分のリスト一覧を取得して選ばせる方法は、X API・内部API・DOM 読み取りのいずれかが必要になり、spec.md 1.2 のガードレールに反するため採れない。そこで、x.com の公式画面上でユーザー自身がリストを開き、アプリはその URL だけを見て追加する方法で、入力の手間をなくす。

## What Changes

- ツールバーに「リストから選ぶ」ボタンを追加する
- 押すと、ツールバーの下の領域全体に x.com の画面(リスト選択画面)を開く。セッションはカラムと共有し、ログイン済みの状態で表示する
- リスト選択画面では、ユーザーが x.com の通常の操作で自分のリスト一覧を開き、追加したいリストを開く
- リスト選択画面がリストのページ(`https://x.com/i/lists/<数字>`)を表示している間だけ、ツールバーの「このリストを追加」を押せるようにする。押すとそのリストがカラムとして追加され、リスト選択画面は閉じる
- 「キャンセル」でリスト選択画面を閉じる
- アプリはリスト選択画面の URL のみを観測し、DOM・ページタイトル・リスト名は読み取らない。リスト選択画面にスクリプト実行や CSS 注入は行わない
- 追加されるカラムのタイトルは既存の入力時と同じ規則(「リスト <ID>」)とする

## Capabilities

### New Capabilities
- `list-picker`: x.com の公式画面上でユーザーが開いたリストを、その URL のみに基づいてカラムとして追加するリスト選択画面

### Modified Capabilities
- なし(既存の `column-management` の入力解釈・追加処理と、`navigation-control`・`execution-guardrails` の制約をそのまま利用する)

## Impact

- 前提: `add-columnist-m0-foundation` の実装(カラム管理・ナビゲーション制御・セッション・IPC)。M1 とは独立して適用できる
- 変更コード: `src/main/index.ts`(ウィンドウのリサイズ追従)、`src/main/ipc/handlers.ts`、`src/main/columns/ColumnManager.ts`(URL からの追加)、`src/shared/ipcChannels.ts`、`src/shared/types.ts`、`src/preload/shell.ts`、`src/renderer/App.tsx`、`src/renderer/components/Toolbar.tsx`
- 新規コード: `src/main/columns/ListPicker.ts`(リスト選択画面の WebContentsView)、テスト用 fixture(リスト一覧・リストページ)
- 依存追加なし。設定ファイルのスキーマ変更なし
- ドキュメント: README の使い方に「リストから選ぶ」を追記
