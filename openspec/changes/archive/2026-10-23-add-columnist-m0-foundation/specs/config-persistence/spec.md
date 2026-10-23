# Spec Delta

## Purpose

カラム構成・デフォルト値・ウィンドウ状態を設定ファイルに保存し、再起動後に復元する。不正な設定ファイルでもアプリが起動できるようにする。

## ADDED Requirements

### Requirement: 設定ファイルの保存場所と構造
設定はユーザーデータディレクトリ直下の `config.json` に保存しなければならない(MUST)。設定は `version`、`window`(x, y, width, height)、`defaults`(columnWidth, refreshIntervalSec, zoomFactor)、`columns`(id, title, type, url, width, refreshIntervalSec, zoomFactor, paused)を含まなければならない(MUST)。デフォルト値は columnWidth 380、refreshIntervalSec 120、zoomFactor 1.0 でなければならない(MUST)。

#### Scenario: 初回起動
- **WHEN** `config.json` が存在しない状態で起動する
- **THEN** デフォルト値・カラムなしの設定で起動する

### Requirement: 設定値の検証
設定の読み込み・保存時、システムは次の制約で検証しなければならない(MUST)。`type` は `list`/`search`/`home`/`profile`/`custom` のいずれか、`url` は `https://x.com/` で始まる(`twitter.com` は保存時に `x.com` へ正規化)、`width` は 300〜640、`refreshIntervalSec` は 60〜3600、`zoomFactor` は 0.5〜1.5。

#### Scenario: twitter.com の正規化
- **WHEN** URL `https://twitter.com/i/lists/1` のカラムを保存する
- **THEN** 設定ファイルには `https://x.com/i/lists/1` として保存される

#### Scenario: 範囲外の値を拒否
- **WHEN** `width` が 200、または `refreshIntervalSec` が 59 のカラムを保存しようとする
- **THEN** 検証エラーとなり保存されない

### Requirement: 壊れた設定ファイルの退避
読み込んだ設定ファイルが JSON として不正、またはスキーマに違反する場合、システムはそのファイルを `config.broken-<timestamp>.json` として退避し、デフォルト設定で起動しなければならない(MUST)。

#### Scenario: 不正な設定ファイル
- **WHEN** `config.json` に `refreshIntervalSec: 10` のカラムが書かれた状態で起動する
- **THEN** 元のファイルが `config.broken-<timestamp>.json` に退避され、アプリはデフォルト設定で起動する

### Requirement: バージョンによるマイグレーション
設定ファイルは `version` を持ち、読み込み時に旧バージョンを現行バージョンへ順に変換できる構造でなければならない(MUST)。現行バージョンより新しい `version` のファイルは不正として扱わなければならない(MUST)。

#### Scenario: 現行バージョン
- **WHEN** `version: 1` の正しい設定ファイルを読み込む
- **THEN** 変換なしでそのまま読み込まれる

#### Scenario: 未知の新バージョン
- **WHEN** `version: 99` の設定ファイルを読み込む
- **THEN** ファイルは退避され、デフォルト設定で起動する

### Requirement: カラム構成とウィンドウ状態の復元
システムはカラム構成(順序を含む)とウィンドウの位置・サイズを保存し、再起動時に復元しなければならない(MUST)。保存されたウィンドウ位置がどのディスプレイにも収まらない場合は、表示可能な位置に補正しなければならない(MUST)。

#### Scenario: 再起動後の復元
- **WHEN** カラムを3本追加しウィンドウを移動・リサイズしてから再起動する
- **THEN** 同じ3本のカラムが同じ順序で表示され、ウィンドウは同じ位置・サイズで開く

#### Scenario: 外部ディスプレイを外した後
- **WHEN** 外部ディスプレイ上にあったウィンドウ位置が保存された状態で、そのディスプレイを外して起動する
- **THEN** ウィンドウは接続中のディスプレイ内に表示される
