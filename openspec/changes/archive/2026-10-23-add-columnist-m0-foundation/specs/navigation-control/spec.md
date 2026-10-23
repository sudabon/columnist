# Spec Delta

## Purpose

カラムビューを x.com の閲覧に限定し、それ以外のリンクは既定ブラウザで開くことで、アプリが汎用ブラウザとして振る舞わないようにする。

## ADDED Requirements

### Requirement: カラム内遷移の x.com 限定
カラムビュー内の遷移およびリダイレクトは、`x.com` ドメインへのもののみ許可しなければならない(MUST)。それ以外への遷移はカラム内で行ってはならない(MUST NOT)。

#### Scenario: x.com 内の遷移
- **WHEN** カラム内で投稿をクリックし `https://x.com/<user>/status/<id>` へ遷移する
- **THEN** 遷移はカラム内で行われる

#### Scenario: 外部ドメインへの遷移
- **WHEN** カラム内で `https://example.com/` へのリンクをクリックする
- **THEN** カラムは遷移せず、そのURLは OS の既定ブラウザで開かれる

### Requirement: 新規ウィンドウの拒否
カラムビューから開かれようとする新規ウィンドウはすべて拒否しなければならない(MUST)。対象の URL が `http` または `https` の場合のみ OS の既定ブラウザで開き、それ以外のスキームは開いてはならない(MUST NOT)。

#### Scenario: 新しいタブで開くリンク
- **WHEN** カラム内で `target="_blank"` の外部リンクをクリックする
- **THEN** アプリ内に新規ウィンドウは開かず、既定ブラウザでそのURLが開かれる

#### Scenario: http(s) 以外のスキーム
- **WHEN** カラムから `file:` や独自スキームの新規ウィンドウが要求される
- **THEN** 要求は拒否され、何も開かれない

### Requirement: テスト用オリジンの切り替え
環境変数 `COLUMNIST_TEST_ORIGIN` が設定されている場合、テストビルドに限り、許可するオリジンを指定されたローカルの fixture サーバへ切り替えられなければならない(MUST)。本番ビルドではこの切り替えは無効でなければならない(MUST)。

#### Scenario: 本番ビルドでは無効
- **WHEN** 本番ビルドのアプリを `COLUMNIST_TEST_ORIGIN` を設定して起動する
- **THEN** 許可オリジンは x.com のままで、fixture のオリジンへの遷移は拒否される

#### Scenario: テスト時は fixture を表示
- **WHEN** テストビルドを `COLUMNIST_TEST_ORIGIN=http://127.0.0.1:<port>` で起動する
- **THEN** カラムは fixture サーバのページを表示できる
