import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/out-test',
      'openspec/**',
      '.uv-cache/**',
      '.claude/**',
      '.agents/**',
      '.cursor/**',
      'test-results/**',
      'playwright-report/**'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    // ガードレール(spec.md 1.3): カラムビューでのスクリプト実行は allowedScripts.ts に集約する
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/columns/allowedScripts.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^executeJavaScript/]',
          message: 'executeJavaScript は src/main/columns/allowedScripts.ts 以外で使用できません'
        }
      ]
    }
  },
  {
    files: ['**/*.mjs'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  },
  eslintConfigPrettier
)
