/**
 * Host half of the Luna restyle.
 *
 * The Client half carries the wallpaper inline, so this half has no artwork to
 * serve. It exists to record what the Client half reports about itself: a
 * plugin that never activated is otherwise indistinguishable from one that
 * activated and changed nothing, because the shell's browser console is not
 * reachable from outside. Each report is appended to `luna-theme-ping.log` in
 * the profile directory.
 */
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))

/** Plugin name, matching the Client bundle id and the patch row. */
export const name = 'dsh-luna-theme'

/** The report route is the only capability this half needs. */
export const inject = ['webServer']

/** Route the Client half beacons to. */
const PING_ROUTE = '/dsh-luna/ping'

/** Report file; the profile directory is writable and outlives package replacement. */
const LOG_PATH = join(process.env.DSH_PROFILE_DIR ?? PACKAGE_DIR, 'luna-theme-ping.log')

/**
 * Register the report route.
 * @param ctx - the plugin fiber's Host context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PING_ROUTE,
    handler: (req, res) => {
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams
      const line = `${new Date().toISOString()} ${[...query].map(([k, v]) => `${k}=${v}`).join(' ')}\n`
      try {
        appendFileSync(LOG_PATH, line)
      } catch {
        // A failed report must not fail the request; the Client ignores the body either way.
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      res.end()
    },
  }))
}
