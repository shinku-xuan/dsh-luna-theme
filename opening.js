/** Host component for the theme's boot skin, title artwork and opening voice. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Independently switchable component id in the theme bundle. */
export const name = 'luna-opening'

/** Static assets and the first-paint skin require the web server. */
export const inject = ['webServer']

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = join(PACKAGE_DIR, 'assets', 'opening')
const ROUTE_BASE = '/dsh-luna-opening'
const ASSET_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.wav', 'audio/wav'],
  ['.html', 'text/html; charset=utf-8'],
])

/**
 * Serve a basename from the component's assets, or its shared-code preview.
 * @param req - Request containing the asset pathname.
 * @param res - Response receiving uncached asset bytes or a missing-file status.
 */
function serveAsset(req, res) {
  let asset
  try {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    asset = decodeURIComponent(pathname.slice(ROUTE_BASE.length + 1))
  } catch (error) {
    // Invalid URL escapes cannot name an asset.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('luna-opening: malformed asset path')
    return
  }
  const type = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset) && !asset.includes('..')
    ? ASSET_TYPES.get(asset.slice(asset.lastIndexOf('.')))
    : undefined
  if (type === undefined) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('luna-opening: no such asset')
    return
  }
  try {
    const bytes = readFileSync(asset === 'preview.html'
      ? join(PACKAGE_DIR, 'preview', 'opening.html')
      : join(ASSET_DIR, asset))
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(bytes)
  } catch (error) {
    // Absent assets remain ordinary 404 responses, including a disabled component.
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('luna-opening: missing asset')
  }
}

/**
 * Install the first-paint skin and static routes for this component.
 * @param ctx - Host plugin context; registrations are removed with this row.
 */
export function apply(ctx) {
  // Desktop captures the injection table at Host-ready, before asynchronous work.
  const skin = readFileSync(join(ASSET_DIR, 'boot-skin.css'), 'utf8')
  ctx.on('webserver/index-inject', table => {
    if (!Array.isArray(table)) return
    table.push({
      kind: 'html', placement: 'head',
      html: ['asahi-idle.webp', 'asahi-happy.webp']
        .map(asset => `<link rel="preload" as="image" href="${ROUTE_BASE}/${asset}">`).join(''),
    })
    table.push({ kind: 'style', text: `/* dsh-luna-theme:boot-skin */\n${skin}` })
  })
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE_BASE, handler: serveAsset }))
}
