// テストビルド専用の切り替え。本番ビルドでは __COLUMNIST_TEST__ が false に置換され、
// 環境変数の読み取りごと除去される(spec.md 8 / design D6)

/** 許可オリジンに追加する fixture サーバのオリジン(例: http://127.0.0.1:4173) */
export const TEST_ORIGIN: string | null = __COLUMNIST_TEST__
  ? normalizeOrigin(process.env['COLUMNIST_TEST_ORIGIN'])
  : null

/** テスト時にユーザーデータを分離するディレクトリ */
export const TEST_USER_DATA_DIR: string | null = __COLUMNIST_TEST__
  ? (process.env['COLUMNIST_TEST_USER_DATA_DIR'] ?? null)
  : null

export const EXTRA_ORIGINS: readonly string[] = TEST_ORIGIN ? [TEST_ORIGIN] : []

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}
