#!/usr/bin/env node
// spec.md 1 章のガードレールを機械的に検査する。違反があれば一覧を出して終了コード 1 で終わる
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const ALLOWED_SCRIPTS = join('src', 'main', 'columns', 'allowedScripts.ts')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const rel = (path) => relative(ROOT, path).split(sep).join('/')
const sourceFiles = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx|css|html)$/.test(f))

/** UI に表示されうるファイル(アプリ名・メニュー・シェルUI・パッケージ設定・README) */
const uiFiles = [
  ...sourceFiles.filter((f) => rel(f).startsWith('src/renderer/')),
  join(ROOT, 'src', 'main', 'menu.ts'),
  join(ROOT, 'electron-builder.yml'),
  join(ROOT, 'package.json'),
  join(ROOT, 'README.md')
]

const checks = [
  {
    name: 'executeJavaScript は allowedScripts.ts 以外で使わない',
    files: sourceFiles.filter((f) => rel(f) !== ALLOWED_SCRIPTS.split(sep).join('/')),
    pattern: /executeJavaScript/
  },
  { name: 'X API を呼ばない', files: sourceFiles, pattern: /api\.(x|twitter)\.com/i },
  { name: '内部API(GraphQL)を呼ばない', files: sourceFiles, pattern: /graphql/i },
  {
    name: '通信の傍受・改変をしない',
    files: sourceFiles,
    pattern: /\bwebRequest\b|\.debugger\b|protocol\.(handle|intercept)/
  },
  { name: '通知を出さない', files: sourceFiles, pattern: /new Notification\b|\bNotification\./ },
  {
    name: 'カラムビューへ入力を送らない(自動操作の禁止)',
    files: sourceFiles,
    pattern: /sendInputEvent/
  },
  { name: 'UI に商標を使わない', files: uiFiles, pattern: /twitter|tweet/i },
  {
    // カラムビューへの CSS 注入は ColumnView.ts の x.css のみ(テーマ切り替えなどで増やさない)
    name: 'insertCSS は ColumnView.ts 以外で使わない',
    files: sourceFiles.filter((f) => rel(f) !== 'src/main/columns/ColumnView.ts'),
    pattern: /insertCSS/
  },
  {
    name: 'カラムビューへ配色を注入しない(シェルのダークモードは x.com に介入しない)',
    files: [join(ROOT, 'src', 'inject', 'x.css')],
    pattern: /prefers-color-scheme|color-scheme|background|color\s*:/i
  }
]

const violations = []
for (const check of checks) {
  for (const file of check.files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (check.pattern.test(line))
        violations.push(`${check.name}: ${rel(file)}:${i + 1}: ${line.trim()}`)
    })
  }
}

// allowedScripts.ts 以外からカラムビューへスクリプトを実行していないことに加え、
// allowedScripts.ts が想定どおりの関数だけを公開していることも確認する
const allowed = readFileSync(join(ROOT, ALLOWED_SCRIPTS), 'utf8')
const exported = [...allowed.matchAll(/^export (?:async )?function (\w+)/gm)]
  .map((m) => m[1])
  .sort()
const expected = ['getLastInputAt', 'getScrollY', 'installInputTracker', 'scrollToTop']
if (JSON.stringify(exported) !== JSON.stringify(expected)) {
  violations.push(`allowedScripts.ts の公開関数が想定と異なります: ${exported.join(', ')}`)
}

if (violations.length > 0) {
  console.error('ガードレール違反:')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}
console.log(`ガードレール検査 OK(${checks.length + 1} 項目)`)
