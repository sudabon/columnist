import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __COLUMNIST_TEST__: 'false' },
  resolve: {
    // ユニットテストは Electron 外で実行するため、electron モジュールはスタブに差し替える
    alias: { electron: resolve('tests/unit/electronStub.ts') }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
})
