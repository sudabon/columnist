# Spec Delta

## Purpose

x.com を表示するビューとアプリ自身の UI を分離し、権限・IPC・コンテンツ読み込みを最小限に絞ることで、表示中のWebページからアプリへの影響を防ぐ。開発者ツールは常に利用可能にする。

## ADDED Requirements

### Requirement: ビューの隔離設定
カラムビューは `contextIsolation` 有効、`sandbox` 有効、`nodeIntegration` 無効、preload なしで作成しなければならない(MUST)。シェルビューは `contextIsolation` 有効、`sandbox` 有効、`nodeIntegration` 無効で、シェル専用の preload のみを読み込まなければならない(MUST)。シェルの preload は必要最小限の API のみを公開しなければならない(MUST)。

#### Scenario: カラムビューから Node API が使えない
- **WHEN** カラムビューの DevTools コンソールで `typeof require` や `typeof window.columnist` を評価する
- **THEN** いずれも `undefined` である

### Requirement: 全権限の拒否
セッションへの権限要求(通知・位置情報・カメラ・マイク等)はすべて拒否しなければならない(MUST)。

#### Scenario: 通知権限の要求
- **WHEN** カラム内のページが通知権限を要求する
- **THEN** 要求は拒否され、許可ダイアログは表示されない

### Requirement: シェルの CSP
シェルビューは `default-src 'self'` を基本とする Content Security Policy を適用しなければならない(MUST)。

#### Scenario: 外部スクリプトの読み込み拒否
- **WHEN** シェルビューに外部オリジンのスクリプト読み込みが含まれる
- **THEN** CSP により読み込みはブロックされる

### Requirement: IPC 送信元の検証
main プロセスは、シェルビュー以外の送信元からの IPC メッセージを無視しなければならない(MUST)。

#### Scenario: カラムビューからの IPC
- **WHEN** シェルビュー以外の webContents から IPC メッセージが届く
- **THEN** メッセージは処理されず、状態は変化しない

### Requirement: メニューからの DevTools
アプリメニューから、各カラムおよびシェルの開発者ツールを個別に開けなければならない(MUST)。

#### Scenario: カラムの DevTools を開く
- **WHEN** ユーザーがメニューから特定カラムの開発者ツールを選ぶ
- **THEN** そのカラムの開発者ツールが開く

#### Scenario: シェルの DevTools を開く
- **WHEN** ユーザーがメニューからシェルの開発者ツールを選ぶ
- **THEN** シェルビューの開発者ツールが開く
