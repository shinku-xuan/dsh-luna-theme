/** Luna theme Host: background media, live settings, and memory diagnostics. */
import { installBackgroundHost } from './background.js'
export { Config } from './background.js'
import { execFile } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { freemem, totalmem } from 'node:os'
import { basename, join } from 'node:path'

/** Plugin name, matching the Client bundle id and the patch row. */
export const name = 'dsh-luna-theme'

/** Media and diagnostic routes require the web server; settings bind when available. */
export const inject = ['webServer', 'profileContext']

/** Route the Client half beacons to. */
const PING_ROUTE = '/dsh-luna/ping'

/** Route the memory badge polls for the cheap system reading. */
const MEMORY_ROUTE = '/dsh-luna/memory.json'

/** Route the badge fetches when its detail panel opens. */
const MEMORY_DETAIL_ROUTE = '/dsh-luna/memory-detail.json'

/** Kibibytes per mebibyte, and bytes per kibibyte. */
const KIB = 1024

/** Headers for both memory responses. */
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

/**
 * The executable every process of this application runs from.
 *
 * The desktop shell starts this Host as its own Electron binary in Node mode,
 * and the renderer, GPU and utility processes share that binary, so its name
 * selects exactly this application's processes.
 */
const APP_IMAGE = basename(process.execPath)

/** How long a process listing is reused; a listing costs a child process. */
const PROCESS_CACHE_MS = 2000

/** The last listing, with the time it was taken. */
let processCache = { at: 0, value: null }

/**
 * Read the machine's memory.
 * @returns total, used and percentage-used figures in megabytes.
 */
function systemReading() {
  const totalMb = totalmem() / (KIB * KIB)
  const freeMb = freemem() / (KIB * KIB)
  const usedMb = Math.max(0, totalMb - freeMb)
  return { totalMb, usedMb, percent: totalMb === 0 ? 0 : (usedMb / totalMb) * 100 }
}

/**
 * Sum the working sets in a `tasklist` CSV listing.
 * @param stdout - `tasklist /FO CSV /NH` output.
 * @returns the summed megabytes and the number of processes counted.
 */
function sumTasklist(stdout) {
  let totalMb = 0
  let count = 0
  for (const raw of stdout.split(/\r?\n/)) {
    // "Image Name","PID","Session Name","Session#","Mem Usage"
    const match = /^"[^"]*","(\d+)","[^"]*","[^"]*","([^"]*)"/.exec(raw.trim())
    if (match === null) continue
    const kilobytes = Number(match[2].replace(/[^\d]/g, ''))
    if (!Number.isFinite(kilobytes)) continue
    totalMb += kilobytes / KIB
    count += 1
  }
  return { totalMb, count }
}

/**
 * This application's process group, or this process alone where the platform
 * offers no portable listing.
 * @returns the group total, the Host's own working set, and the display rows.
 */
function appProcesses() {
  const hostMb = process.memoryUsage().rss / (KIB * KIB)
  const now = Date.now()
  if (processCache.value !== null && now - processCache.at < PROCESS_CACHE_MS) return Promise.resolve(processCache.value)

  const settle = (value) => {
    processCache = { at: Date.now(), value }
    return value
  }
  const host = settle({
    totalMb: hostMb,
    hostMb,
    rows: [{ label: 'Host 进程', mb: hostMb, count: 1 }],
  })
  if (process.platform !== 'win32') return Promise.resolve(host)

  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `IMAGENAME eq ${APP_IMAGE}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 5000, maxBuffer: 4 * KIB * KIB },
      (error, stdout) => {
        // A failed or empty listing is a diagnostic gap, never a failed request.
        if (error !== null) { resolve(host); return }
        const { totalMb, count } = sumTasklist(stdout)
        if (count === 0) { resolve(host); return }
        resolve(settle({
          totalMb,
          hostMb,
          rows: [
            { label: `${APP_IMAGE} 进程`, mb: totalMb, count },
            { label: '其中 Host 进程', mb: hostMb, count: 1 },
          ],
        }))
      },
    )
  })
}

/**
 * Answer one memory request.
 * @param detailed - whether the caller also wants this application's breakdown.
 * @param res - the HTTP response.
 */
async function answerMemory(detailed, res) {
  const system = systemReading()
  if (!detailed) {
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({ ok: true, percent: system.percent, usedMb: system.usedMb, totalMb: system.totalMb }))
    return
  }
  const processes = await appProcesses()
  res.writeHead(200, JSON_HEADERS)
  res.end(JSON.stringify({
    ok: true,
    system,
    dsh: { totalMb: processes.totalMb, hostMb: processes.hostMb, rows: processes.rows },
  }))
}

/**
 * Register the report and memory routes.
 * @param ctx - the plugin fiber's Host context.
 */
export function apply(ctx) {
  const logPath = join(ctx.profileContext.dir, 'luna-theme-ping.log')
  installBackgroundHost(ctx)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PING_ROUTE,
    handler: (req, res) => {
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams
      const line = `${new Date().toISOString()} ${[...query].map(([k, v]) => `${k}=${v}`).join(' ')}\n`
      try {
        appendFileSync(logPath, line)
      } catch {
        // A failed report must not fail the request; the Client ignores the body either way.
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
    },
  }))

  const memory = (detailed) => async (req, res) => {
    try {
      await answerMemory(detailed, res)
    } catch (error) {
      // The badge hides itself after repeated misses, so a broken reading is
      // reported rather than thrown into the Host's request pipeline.
      res.writeHead(500, JSON_HEADERS)
      res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: MEMORY_ROUTE, handler: memory(false) }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: MEMORY_DETAIL_ROUTE, handler: memory(true) }))
}
