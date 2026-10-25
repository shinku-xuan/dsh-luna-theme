/** Validated background preferences and package-owned media routes. */
import z from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import catalog from '../../resources/backgrounds.json' with { type: 'json' }

/** Background fields exposed through the owning plugin's DSH ConfigForm. */
export const Config = z.object({
  backgroundId: z.union([...catalog.backgrounds.map(item => item.id), ...Object.keys(catalog.aliases)]).default(catalog.defaultId).volatile(),
  backgroundMode: z.union(['rotate', 'fixed']).default(catalog.defaults.backgroundMode).volatile(),
  rotationSeconds: z.number().min(catalog.rotation.minimumSeconds).max(Number.MAX_SAFE_INTEGER).step(1).default(catalog.defaults.rotationSeconds).volatile(),
  transitionMilliseconds: z.number().min(0).max(5000).step(1).default(catalog.defaults.transitionMilliseconds).volatile(),
  animated: z.boolean().default(catalog.defaults.animated).volatile(),
  ...Object.fromEntries(Object.entries(catalog.controls).map(([key, spec]) => [
    key, z.number().min(spec.min).max(spec.max).step(spec.step).default(catalog.defaults[key]).volatile(),
  ])),
})

/**
 * Serve a selected byte interval, including suffix ranges used by media players.
 * @param header HTTP Range header, or undefined for a complete response.
 * @param size Total byte length.
 * @returns An inclusive interval, null for an unsatisfiable range, or undefined for a full response.
 */
export function byteRange(header, size) {
  if (header === undefined) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null
  return { start, end }
}

/**
 * Register immutable catalog assets and expose live preferences to DSH settings.
 * Missing package assets reject activation before any route is registered.
 * @param ctx Host plugin context owning routes and settings registration.
 */
export function installBackgroundHost(ctx) {
  const ids = new Set()
  const orders = new Set()
  const media = catalog.backgrounds.flatMap(item => {
    if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate background id: ${item.id}`)
    ids.add(item.id)
    if (!Number.isSafeInteger(item.order) || item.order < 0 || orders.has(item.order)) throw new Error(`Invalid or duplicate background order: ${item.order}`)
    if (!/^[a-f0-9]{12}$/.test(item.revision)) throw new Error(`Invalid background revision: ${item.id}`)
    if (item.video && (!Number.isFinite(item.duration) || item.duration <= 0)) throw new Error(`Invalid background duration: ${item.id}`)
    orders.add(item.order)
    return ['poster', ...(item.video ? ['video'] : [])].map(kind => {
      const path = item[kind]
      const extension = kind === 'poster' ? 'png' : 'mp4'
      if (path !== `assets/backgrounds/${item.id}.${extension}`) throw new Error(`Invalid background asset: ${path}`)
      const bytes = readFileSync(new URL('../../' + path, import.meta.url))
      if (bytes.length === 0) throw new Error(`Empty background asset: ${path}`)
      return { path: `/dsh-luna/backgrounds/${item.id}.${extension}`, bytes, mime: kind === 'poster' ? 'image/png' : 'video/mp4' }
    })
  })
  if (!ids.has(catalog.defaultId)) throw new Error('Missing default background')
  for (const target of Object.values(catalog.aliases)) if (!ids.has(target)) throw new Error(`Missing background alias target: ${target}`)
  for (const asset of media) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: asset.path, handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      const interval = byteRange(req.headers.range, asset.bytes.length)
      if (interval === null) {
        res.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` })
        res.end()
        return
      }
      const bytes = interval ? asset.bytes.subarray(interval.start, interval.end + 1) : asset.bytes
      res.writeHead(interval ? 206 : 200, {
        'Content-Type': asset.mime,
        'Accept-Ranges': 'bytes',
        'Content-Length': bytes.length,
        'Cache-Control': 'public, max-age=86400',
        ...(interval ? { 'Content-Range': `bytes ${interval.start}-${interval.end}/${asset.bytes.length}` } : {}),
      })
      res.end(req.method === 'HEAD' ? undefined : bytes)
    } }))
  }
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
