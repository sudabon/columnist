import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  // Electron を複数同時に起動すると不安定になりやすいため直列で実行する
  workers: 1,
  reporter: 'list'
})
