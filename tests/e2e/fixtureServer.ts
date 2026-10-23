import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../fixtures')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
}

/** x.com のリストのページ(`/i/lists/<数字>`)とその下位ページは list.html で代用する */
const LIST_PAGE = /^\/i\/lists\/\d+(\/[^/]*)?$/

/** tests/fixtures を配信するローカルサーバ(x.com の代わり) */
export async function startFixtureServer(): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = LIST_PAGE.test(url.pathname) ? '/list.html' : url.pathname
    const file = normalize(join(ROOT, pathname))
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => server.close(() => done()))
  }
}
