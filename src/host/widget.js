/**
 * Host half of the Luna balance widget: the `luna-balance-widget` row of the
 * `dsh-luna-theme` bundle.
 *
 * Serves artwork, balance, daily spending, size and page script routes under
 * `/dsh-whale/*`. The balance is read with the profile's
 * `DEEPSEEK_API_KEY` first; a profile without that key falls back to the signed
 * in DeepSeek account (`deepseekAccount`), whose recharge and bonus wallets are
 * summed into the one amount the bubble shows. It is deliberately a row of its
 * own rather than a branch of `index.js`: this module is the only one that needs
 * the `credentials` injection, and its own `disabled` patch entry turns the
 * widget off without touching the theme.
 *
 * The row names the package subpath (`dsh-luna-theme/widget`). A second row
 * naming the package root would register a second active client source for one
 * package, which the client module system rejects as a composition error.
 */
import fs from 'node:fs'
import { WIDGET_JS } from '../client/widget/script.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root containing the artwork and persona files. */
const PLUGIN_DIR = fileURLToPath(new URL('../../', import.meta.url))

// The portrait is separate from the white balance bubble, which the page
// renders at the existing reading position. Replacing the portrait therefore
// cannot erase the balance display or change its refresh hit area.
const IMAGE_CANDIDATES = [
  path.join(PLUGIN_DIR, 'assets', 'luna-bot.png'),
]

// The artwork may be WebP or PNG, so the served type follows the file that won.
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000
// Host-only stand-in for the page's client version in Platform client headers;
// the widget's own `/dsh-whale/balance.json` request carries no identity of its own.
const CLIENT_VERSION = '0.14.2'
const DEFAULT_LOCALE = 'zh-CN'
const DEFAULT_TIMEZONE_OFFSET_SECONDS = -8 * 3600

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}



/**
 * Register the widget's routes and its index-injection hook.
 *
 * The page script itself is loaded by the Client half of this bundle, because
 * the desktop shell serves its own static index and never applies `tapIndex`;
 * the hook here only covers shells that do apply it.
 */
export default {
  name: 'luna-balance-widget',
  inject: ['webServer', 'credentials', 'profileContext'],
  apply(ctx) {
    const sizeFile = path.join(ctx.profileContext.dir, 'luna-widget-size.json')
    const sizeCandidates = [sizeFile, path.join(PLUGIN_DIR, '.dshw-size.json'),
      path.join(ctx.profileContext.dir, '.dshw-size.json'), path.join(PLUGIN_DIR, '..', '..', '.dshw-size.json')]
    let image = null
    let balanceCache = null
    let balanceInFlight = null
    const widgetLifetime = new AbortController()
    const spendingRequests = new Set()

    // Platform's daily cost buckets already include the billed rate and wallet
    // deductions. Balance differences would also count top-ups and bonus grants.
    async function fetchSpending(client) {
      const account = ctx.get('deepseekAccount')
      if (!account || typeof account.getPlatformSession !== 'function') {
        return { ok: false, code: 'NO_ACCOUNT_SERVICE' }
      }
      const session = await account.getPlatformSession()
      if (!session) return { ok: false, code: 'ACCOUNT_SIGNED_OUT' }
      const now = Date.now()
      const start = Math.floor((now / 1000 + 28800) / 86400) * 86400 - 28800
      const end = start + 86400
      const date = new Date(now + 8 * 3600000).toISOString().slice(0, 10)
      const url = new URL('/api/v0/usage/by_api_key/cost', session.origin)
      url.searchParams.set('start', String(start))
      url.searchParams.set('end', String(end))
      url.searchParams.set('tz', '28800')
      const response = await fetch(url, {
        headers: {
          ...session.requestHeaders,
          'x-client-bundle-id': '',
          'x-client-platform': 'web',
          'x-client-version': client.version,
          'x-client-locale': /^zh/i.test(client.locale) ? 'zh_CN' : 'en_US',
          'x-client-timezone-offset': String(client.timezoneOffsetSeconds),
          'x-dsh-auth-token': session.token,
        },
        signal: AbortSignal.any([widgetLifetime.signal, AbortSignal.timeout(20000)]),
        redirect: 'error',
      })
      if (!response.ok) return { ok: false, code: response.status === 401 ? 'ACCOUNT_SIGNED_OUT' : 'USAGE_HTTP' }
      const body = await response.json()
      const data = body?.data?.biz_data
      if (body?.code !== 0 || body?.data?.biz_code !== 0 || !Array.isArray(data?.data)) {
        return { ok: false, code: 'USAGE_RESPONSE' }
      }
      const totals = new Map()
      for (const row of data.data) {
        if (!['CNY', 'USD'].includes(row.currency) || !Array.isArray(row.series)) {
          return { ok: false, code: 'USAGE_RESPONSE' }
        }
        let total = totals.get(row.currency) || 0
        for (const series of row.series) {
          if (!Array.isArray(series.buckets)) return { ok: false, code: 'USAGE_RESPONSE' }
          for (const bucket of series.buckets) {
            const cost = bucket.cost
            const amount = typeof cost === 'string' && cost.trim() !== '' || typeof cost === 'number' ? Number(cost) : Number.NaN
            if (!Number.isFinite(amount) || amount < 0) return { ok: false, code: 'USAGE_RESPONSE' }
            total += amount
          }
        }
        if (!Number.isFinite(total)) return { ok: false, code: 'USAGE_RESPONSE' }
        totals.set(row.currency, total)
      }
      const current = await account.getPlatformSession()
      if (!current || current.token !== session.token || current.origin !== session.origin) {
        return { ok: false, code: 'ACCOUNT_SIGNED_OUT' }
      }
      const currency = totals.has('CNY') ? 'CNY' : totals.keys().next().value || 'CNY'
      return { ok: true, totalSpent: totals.get(currency) || 0, currency, date }
    }

    function getSpending(client) {
      const request = fetchSpending(client).catch(() => ({ ok: false, code: 'USAGE_ERROR' }))
        .finally(() => spendingRequests.delete(request))
      spendingRequests.add(request)
      return request
    }

    function loadImage() {
      if (image) return image
      for (const p of IMAGE_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            image = { bytes: bytes, type: MIME_BY_EXT[path.extname(p).toLowerCase()] || 'application/octet-stream' }
            return image
          }
        } catch (err) {}
      }
      throw new Error('whale image not found')
    }

    async function fetchApiKeyBalance(signal) {
      let cred
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
      } catch (err) {
        return { ok: false, code: 'NO_KEY', error: '凭据读取失败: ' + String((err && err.message) || err).slice(0, 160) }
      }
      if (!cred) {
        return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
      }
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.aborted) return { ok: false, code: 'BALANCE_TIMEOUT', transient: true }
        let res
        try {
          res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal,
          })
        } catch (err) {
          lastErr = err
          if (signal.aborted) return { ok: false, code: 'BALANCE_TIMEOUT', transient: true }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return { ok: false, code: 'API_KEY_REJECTED', error: 'HTTP ' + res.status }
          lastErr = new Error('HTTP ' + res.status)
          if (res.status < 500) break
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        let data
        try {
          data = await res.json()
        } catch (err) {
          return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' }
        }
        const balances = data && Array.isArray(data.balance_infos) ? data.balance_infos : []
        const info = balances.find(info => info.currency === 'CNY') || balances.find(info => info.currency === 'USD') || balances[0]
        const amount = typeof info?.total_balance === 'number' || typeof info?.total_balance === 'string' && info.total_balance.trim() !== '' ? Number(info.total_balance) : Number.NaN
        if (!Number.isFinite(amount)) {
          return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
        }
        return {
          ok: true,
          source: 'api-key',
          totalBalance: amount,
          currency: String(info.currency || 'CNY'),
          updatedAt: new Date().toISOString(),
        }
      }
      const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
      return {
        ok: false,
        code: 'HTTP',
        transient: transient,
        error: '余额接口请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
      }
    }

    // Totals one wallet list. A wallet the list does not hold contributes 0 while
    // an empty list still reports its absence, so a recharge-only or bonus-only
    // account stays distinguishable from one Platform returned no wallet for.
    function walletTotal(wallets) {
      let total = 0
      let present = false
      for (const wallet of wallets) {
        const amount = Number(wallet && wallet.balance)
        if (Number.isFinite(amount)) total += amount
        present = true
      }
      return { total: total, present: present }
    }

    // One page balance for wallets of one currency: same-currency recharge and
    // bonus balances add up, and the first currency present wins otherwise, so a
    // stray USD bonus cannot be added to a CNY amount.
    function mergeWallets(details) {
      const currencies = []
      for (const wallet of [...details.value, ...details.bonusWallets]) {
        const currency = String((wallet && wallet.currency) || 'CNY')
        if (!currencies.includes(currency)) currencies.push(currency)
      }
      if (currencies.length === 0) return null
      const currency = currencies.includes('CNY') ? 'CNY' : currencies[0]
      const recharge = walletTotal(details.value.filter((wallet) => String((wallet && wallet.currency) || 'CNY') === currency))
      const bonus = walletTotal(details.bonusWallets.filter((wallet) => String((wallet && wallet.currency) || 'CNY') === currency))
      return { totalBalance: recharge.total + bonus.total, currency: currency, wallets: recharge.present || bonus.present }
    }

    // The signed-in account route reads the recharge and bonus wallets Platform
    // reports and serves their sum, which is what an API-key response reduces to.
    // Its timezone offset keeps the sign a page reports: negative east of UTC.
    async function fetchAccountBalance(client) {
      const account = ctx.get('deepseekAccount')
      if (!account || typeof account.getBalance !== 'function') {
        return { ok: false, code: 'NO_ACCOUNT_SERVICE', error: 'DeepSeek 账号服务不可用' }
      }
      let details
      try {
        details = await account.getBalance(client)
      } catch (err) {
        return {
          ok: false,
          code: 'ACCOUNT_ERROR',
          transient: true,
          error: '账号余额查询失败: ' + String((err && err.message) || err).slice(0, 200),
        }
      }
      if (details === null || details === undefined) {
        return { ok: false, code: 'ACCOUNT_SIGNED_OUT', error: 'DeepSeek 账号未登录' }
      }
      if (details.status !== 'ready') {
        return { ok: false, code: 'ACCOUNT_BALANCE', error: '账号余额查询失败' }
      }
      const merged = mergeWallets(details)
      if (merged === null) {
        return { ok: false, code: 'ACCOUNT_EMPTY', error: '账号没有可用钱包' }
      }
      if (!merged.wallets) {
        return { ok: false, code: 'ACCOUNT_EMPTY', error: '账号返回的钱包列表为空' }
      }
      return {
        ok: true,
        source: 'account',
        totalBalance: merged.totalBalance,
        currency: merged.currency,
        updatedAt: new Date().toISOString(),
      }
    }

    // API-key balances take priority over account wallets. An unavailable account
    // preserves the key failure instead of replacing it with a sign-in prompt.
    async function fetchBalance(client, signal) {
      const viaKey = await fetchApiKeyBalance(signal)
      if (viaKey.ok) return viaKey
      if (signal.aborted) return { ok: false, code: 'BALANCE_TIMEOUT', transient: true }
      const viaAccount = await fetchAccountBalance(client)
      if (viaAccount.ok) return viaAccount
      if (viaKey.code === 'NO_KEY' && viaAccount.code === 'ACCOUNT_SIGNED_OUT') return viaKey
      if (viaKey.code !== 'NO_KEY' && (viaAccount.code === 'ACCOUNT_SIGNED_OUT' || viaAccount.code === 'NO_ACCOUNT_SERVICE')) return viaKey
      viaAccount.keyError = viaKey.code
      viaAccount.keyDetail = viaKey.error
      return viaAccount
    }

    // Locale and timezone travel with each page request: the Platform client
    // headers are derived from them, and the page already knows both.
    function readClient(req) {
      const query = new URL(String(req?.url || '/'), 'http://localhost').searchParams
      const lang = query.get('lang') || DEFAULT_LOCALE
      const rawOffset = query.get('tz')
      const offset = rawOffset === null ? Number.NaN : Number(rawOffset)
      return {
        version: CLIENT_VERSION,
        locale: /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(lang) ? lang : DEFAULT_LOCALE,
        timezoneOffsetSeconds: Number.isFinite(offset) && Math.abs(offset) <= 86400
          ? Math.trunc(offset)
          : DEFAULT_TIMEZONE_OFFSET_SECONDS,
      }
    }

    function getBalance(client) {
      const now = Date.now()
      if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
        return Promise.resolve(balanceCache.payload)
      }
      if (balanceInFlight) return balanceInFlight
      // The entire key/retry/account query has one deadline shorter than the
      // page's 25-second request timeout. Account queries own their cancellation.
      const signal = AbortSignal.any([widgetLifetime.signal, AbortSignal.timeout(20000)])
      let onAbort
      const cancelled = new Promise(resolve => {
        onAbort = () => resolve({ ok: false, code: 'BALANCE_TIMEOUT', transient: true })
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      })
      balanceInFlight = Promise.race([fetchBalance(client, signal), cancelled])
        .then((payload) => {
          if (payload.ok) {
            balanceCache = { at: now, payload }
            return payload
          }
          if (payload.transient && balanceCache) {
            // transient network/API blip: keep serving the last known balance
            return { ...balanceCache.payload, stale: true, error: payload.error }
          }
          if (!payload.transient) console.error('[whale-balance]', payload.code, payload.error)
          return payload
        })
        .catch((err) => ({
          ok: false,
          code: 'ERROR',
          error: '余额服务异常: ' + String((err && err.message) || err).slice(0, 200),
        }))
        .finally(() => {
          signal.removeEventListener('abort', onAbort)
          balanceInFlight = null
        })
      return balanceInFlight
    }

    function readSizeConfig() {
      for (const p of sizeCandidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') return { scale: parsed.scale }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale) {
      const body = JSON.stringify({ scale: scale, updatedAt: new Date().toISOString() })
      try {
        fs.writeFileSync(sizeFile, body, 'utf8')
        return { ok: true, scale: scale }
      } catch (error) {
        return { ok: false, error: '无法持久化挂件尺寸' }
      }
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 8192) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    const disposers = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/widget-image.png',
      handler: (req, res) => {
        try {
          const loaded = loadImage()
          res.writeHead(200, {
            'Content-Type': loaded.type,
            // The artwork sits beside this plugin and can be swapped without
            // touching any package, so the renderer must not serve a stale copy
            // from its cache after a restart.
            'Cache-Control': 'no-cache',
            'Content-Length': String(loaded.bytes.length),
          })
          res.end(loaded.bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('whale image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const payload = await getBalance(readClient(req))
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-whale/spending.json',
      handler: async (req, res) => {
        const payload = await getSpending(readClient(req))
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(payload))
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/size.json',
      handler: async (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const scale = typeof parsed.scale === 'number' ? parsed.scale : null
            if (scale === null) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'missing scale' }))
              return
            }
            const result = writeSizeConfig(scale)
            res.writeHead(result.ok ? 200 : 500, JSON_HEADERS)
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(readSizeConfig() || {}))
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(WIDGET_JS)
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => async () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
      widgetLifetime.abort()
      await Promise.allSettled([...spendingRequests, balanceInFlight])
    })
  },
}
