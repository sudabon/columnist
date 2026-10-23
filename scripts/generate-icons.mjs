// build/icon.svg から各種アイコン(icon.png / icon.icns / icon.ico と resources/icon.png)を生成する。
// 実行: node scripts/generate-icons.mjs (macOS の iconutil と Playwright の Chromium を使う)
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const svg = readFileSync('build/icon.svg', 'utf8')
const workDir = mkdtempSync(join(tmpdir(), 'columnist-icons-'))

const browser = await chromium.launch()
const page = await browser.newPage()

async function render(size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`
  )
  return page.locator('svg').screenshot({ omitBackground: true })
}

try {
  writeFileSync('build/icon.png', await render(512))
  copyFileSync('build/icon.png', 'resources/icon.png')

  const iconset = join(workDir, 'icon.iconset')
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${size}x${size}.png`), await render(size))
    writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), await render(size * 2))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns'])

  // ICO は PNG をそのまま格納する形式で組み立てる
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const images = []
  for (const size of icoSizes) images.push(await render(size))
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((png, i) => {
    const entry = 6 + 16 * i
    const size = icoSizes[i]
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  writeFileSync('build/icon.ico', Buffer.concat([header, ...images]))
} finally {
  await browser.close()
  rmSync(workDir, { recursive: true, force: true })
}
