import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // テストビルドは out-test/ に出力し、本番ビルドとは成果物を分ける
  const isTest = mode === 'test'
  const outRoot = isTest ? 'out-test' : 'out'
  const define = { __COLUMNIST_TEST__: JSON.stringify(isTest) }

  return {
    main: {
      define,
      build: { outDir: `${outRoot}/main` }
    },
    preload: {
      define,
      build: {
        outDir: `${outRoot}/preload`,
        rollupOptions: { input: { shell: resolve('src/preload/shell.ts') } }
      }
    },
    renderer: {
      root: 'src/renderer',
      define,
      build: {
        outDir: `${outRoot}/renderer`,
        rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
      },
      plugins: [react()]
    }
  }
})
