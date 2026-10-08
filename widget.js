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
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory holding this module and the `assets/` directory beside it. */
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))

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

// Size memory: written beside this module, which outlives a page reload but not
// a reinstall. The profile-root entry after it is the pre-0.3 location, so an
// existing scale is still found after the upgrade; it only receives a write
// when the packaged location is unwritable.
const SIZE_FILE_CANDIDATES = [
  path.join(PLUGIN_DIR, '.dshw-size.json'),
  path.join(PLUGIN_DIR, '..', '..', '.dshw-size.json'),
]

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000
// Host-only stand-in for the page's client version in Platform client headers;
// the widget's own `/dsh-whale/balance.json` request carries no identity of its own.
const CLIENT_VERSION = '0.14.1'
const DEFAULT_LOCALE = 'zh-CN'
const DEFAULT_TIMEZONE_OFFSET_SECONDS = -8 * 3600

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

const WIDGET_JS = `(function () {
if (window.__dshWhaleWidget) return
window.__dshWhaleWidget = true

var MIN_SCALE = 0.6
var MAX_SCALE = 1.4
var STEP = 0.1
var CLICK_SQ = 9
var REFRESH_MS = 60000
var CHANGE_MS = 900
var ANIM_MS = 700
var FETCH_TIMEOUT_MS = 25000
var BALANCE_PATH = 'dsh-whale/balance.json'
var SPENDING_PATH = 'dsh-whale/spending.json'
var SIZE_URL = 'dsh-whale/size.json'
var IMG_URL = 'dsh-whale/widget-image.png'
var HANDLE_WIDTH = 28
var disposed = false
var activeRequests = new Map()

var messages = {
  zh: { balance: '可用余额', spending: '本日已用金额', switch: '切换', showBalance: '显示可用余额', showSpending: '显示本日已用金额', offPeak: 'DeepSeek 空闲时段', peak: 'DeepSeek 高峰时段', periodUnknown: 'DeepSeek 时段待确认', signIn: '登录账号查看用量', stale: '更新失败 · 点击重试', smaller: '缩小', larger: '放大', collapse: '收起余额挂件', expand: '展开余额挂件', loading: '加载中…', retry: '获取失败 · 点击重试', keyRejected: '密钥无效 · 点击重试', timeout: '请求超时 · 点击重试' },
  en: { balance: 'Available balance', spending: "Today's spending", switch: 'Switch', showBalance: 'Show available balance', showSpending: "Show today's spending", offPeak: 'DeepSeek off-peak', peak: 'DeepSeek peak hours', periodUnknown: 'DeepSeek hours unconfirmed', signIn: 'Sign in to view usage', stale: 'Update failed · Retry', smaller: 'Zoom out', larger: 'Zoom in', collapse: 'Collapse balance widget', expand: 'Expand balance widget', loading: 'Loading…', retry: 'Failed · Click to retry', keyRejected: 'Invalid key · Retry', timeout: 'Timed out · Retry' }
}
function t(key) {
  return messages[/^zh/i.test(document.documentElement.lang || navigator.language) ? 'zh' : 'en'][key]
}
// The Host derives Platform client headers from these two values before it falls
// back to the signed-in DeepSeek account, so the request carries them along.
function readingUrl(mode) {
  var lang = document.documentElement.lang || navigator.language || 'zh-CN'
  return (mode === 'balance' ? BALANCE_PATH : SPENDING_PATH) + '?lang=' + encodeURIComponent(lang) + '&tz=' + String(-new Date().getTimezoneOffset() * 60)
}

// Calendar dates and weekdays both use Beijing time. Adjusted weekend workdays
// remain off-peak under https://api-docs.deepseek.com/quick_start/pricing/.
// 2026 holidays: https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
var holidays = { 2026: [['01-01','01-03'], ['02-15','02-23'], ['04-04','04-06'], ['05-01','05-05'], ['06-19','06-21'], ['09-25','09-27'], ['10-01','10-07']] }
function beijingDate() { return new Date(Date.now() + 8 * 3600000) }
function spendingDate() { return beijingDate().toISOString().slice(0, 10) }
function updatePeriod() {
  var now = beijingDate()
  var day = now.getUTCDay()
  var hour = now.getUTCHours()
  var ranges = holidays[now.getUTCFullYear()]
  var date = now.toISOString().slice(5, 10)
  var offPeak = day === 0 || day === 6 || !(hour >= 9 && hour < 12 || hour >= 14 && hour < 18) ||
    ranges && ranges.some(function (range) { return date >= range[0] && date <= range[1] })
  var period = offPeak ? 'off-peak' : ranges ? 'peak' : 'unknown'
  periodEl.dataset.period = period
  periodEl.textContent = t(period === 'off-peak' ? 'offPeak' : period === 'peak' ? 'peak' : 'periodUnknown')
}

var css = [
  '.dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(96px,calc(min(196px,min(100vw,100vh) * 0.22) * var(--dshw-scale)),292px);width:var(--dshw-base);height:var(--dshw-base);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .3s ease,top .16s ease}',
  '.dshwv-root.dshwv-left .dshwv-body{scale:-1 1}',
  // The left dock mirrors the whole body, which mirrors the portrait with it.
  // This flip cancels that one so the artwork keeps the orientation it is drawn in.
  '.dshwv-root.dshwv-left .dshwv-img{scale:-1 1}',
  '.dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}',
  '.dshwv-root.dshwv-resizing{transition:none}',
  '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1),visibility 0s}',
  '.dshwv-img{position:absolute;right:0;bottom:0;width:62%;height:62%;scale:-1 1;border-radius:var(--dsw-radius-lg,12px);corner-shape:round;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
  '.dshwv-bubble{position:absolute;left:5.5%;top:1%;width:76%;height:48%;box-sizing:border-box;border:calc(var(--dshw-base) * .018) solid #33466b;border-radius:50%;corner-shape:round;background:#fff;pointer-events:none}',
  '.dshwv-bubble:before,.dshwv-bubble:after{content:"";position:absolute;box-sizing:border-box;border:calc(var(--dshw-base) * .014) solid #33466b;border-radius:50%;corner-shape:round;background:#fff}',
  '.dshwv-bubble:before{width:12%;height:15%;left:30%;top:104%}',
  '.dshwv-bubble:after{width:8%;height:11%;left:43%;top:126%}',
  '.dshwv-text{position:absolute;left:43.55%;top:25%;transform:translate(-50%,-50%);text-align:center;color:#4a3a7a;line-height:1.18;white-space:nowrap;--dshw-u:calc(var(--dshw-base) / 1026);pointer-events:none}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 68);font-weight:500;letter-spacing:.02em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 142);font-weight:500;line-height:1.12;font-variant-numeric:tabular-nums}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 54);color:#544c6e;letter-spacing:.02em}',
  '.dshwv-period{font-size:calc(var(--dshw-u) * 66);margin-top:calc(var(--dshw-u) * 16);color:#544c6e}',
  '.dshwv-text[data-notice] .dshwv-amount{font-size:calc(var(--dshw-u) * 119)}',
  '.dshwv-text[data-notice] .dshwv-period{font-size:calc(var(--dshw-u) * 54)}',
  '.dshwv-period[data-period="off-peak"]{color:#237345}',
  '.dshwv-period[data-period="peak"]{color:#bc2d3e}',
  '.dshwv-size{position:absolute;top:4px;left:-62px;display:flex;gap:4px;z-index:2}',
  '.dshwv-control{width:26px;height:26px;box-sizing:border-box;border:1.5px solid var(--luna-sub-edge);border-radius:var(--dsw-radius-md,8px);background:var(--luna-sub-plate-strong);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--luna-sub-ink);font:inherit;font-size:16px;font-weight:500;line-height:1;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none}',
  '.dshwv-control:hover{border-color:var(--luna-sub-edge-hover);background:var(--luna-sub-plate-hover);color:var(--luna-sub-ink-hover)}',
  '.dshwv-control:focus-visible{outline:2px solid var(--luna-sub-ink);outline-offset:2px}',
  '.dshwv-control:disabled{opacity:.45;cursor:default}',
  '.dshwv-switch{width:auto;padding:0 8px;font-size:13px}',
  '.dshwv-toggle{position:absolute;left:0;bottom:8px;width:28px;height:36px;z-index:3}',
  '.dshwv-size,.dshwv-toggle{opacity:0;pointer-events:none;transition:opacity .15s ease}',
  '.dshwv-root.dshwv-near .dshwv-size,.dshwv-root.dshwv-near .dshwv-toggle,.dshwv-root:has(.dshwv-control:focus-visible) .dshwv-size,.dshwv-root:has(.dshwv-control:focus-visible) .dshwv-toggle{opacity:1;pointer-events:auto}',
  '.dshwv-root.dshwv-left .dshwv-toggle{left:auto;right:0}',
  '.dshwv-root.dshwv-collapsed{cursor:default;pointer-events:none}',
  '.dshwv-root.dshwv-collapsed .dshwv-body{visibility:hidden;transition:transform .22s cubic-bezier(.34,1.56,.64,1),visibility 0s .3s}',
  '.dshwv-size[hidden]{display:none}',
  '@media(pointer:coarse){.dshwv-size,.dshwv-toggle{opacity:1;pointer-events:auto}}',
  '@media(prefers-reduced-motion:reduce){.dshwv-root,.dshwv-body,.dshwv-size,.dshwv-toggle{transition:none}}'
].join('\\n')

var styleEl = document.createElement('style')
// Declare ownership before inserting. The client module system assigns every
// untagged <style> to whichever bundle materialises next (claimStyles in
// packages/client/modules), and that package's later replacement deletes it via
// removeOwnedStyles. Untagged, this sheet is collateral damage whenever a
// plugin materialising after this script reloads: the widget loses --dshw-base
// and its image falls back to its natural 1026px.
styleEl.dataset.plugin = 'luna-balance-widget'
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshwv-root'
root.id = 'luna-balance-widget'

var img = document.createElement('img')
img.className = 'dshwv-img'
img.src = IMG_URL
img.alt = ''
img.draggable = false

var sizeBox = document.createElement('div')
sizeBox.className = 'dshwv-size'
function makeBtn(text, key, action) {
  var b = document.createElement('button')
  b.type = 'button'
  b.className = 'dshwv-control'
  b.textContent = text
  b.title = t(key)
  b.setAttribute('aria-label', t(key))
  b.dataset.lunaLabel = key
  b.addEventListener('pointerdown', function (e) { e.stopPropagation() })
  b.addEventListener('click', function (e) { e.stopPropagation(); action() })
  return b
}
var smallerBtn = makeBtn('−', 'smaller', function () { adjust(-STEP) })
var largerBtn = makeBtn('+', 'larger', function () { adjust(STEP) })
sizeBox.appendChild(smallerBtn)
sizeBox.appendChild(largerBtn)
var switchBtn = makeBtn(t('switch'), 'showSpending', switchReading)
switchBtn.classList.add('dshwv-switch')
switchBtn.setAttribute('aria-controls', 'luna-balance-content')
sizeBox.appendChild(switchBtn)
var toggleBtn = makeBtn('›', 'collapse', toggleCollapsed)
toggleBtn.classList.add('dshwv-toggle')
toggleBtn.setAttribute('aria-controls', 'luna-balance-content')
toggleBtn.setAttribute('aria-expanded', 'true')

var textBox = document.createElement('div')
textBox.className = 'dshwv-text'
var labelEl = document.createElement('div')
labelEl.className = 'dshwv-label'
labelEl.textContent = t('balance')
var amountEl = document.createElement('div')
amountEl.className = 'dshwv-amount'
var hintEl = document.createElement('div')
hintEl.className = 'dshwv-hint'
var periodEl = document.createElement('div')
periodEl.className = 'dshwv-period'
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)
textBox.appendChild(periodEl)

var body = document.createElement('div')
body.className = 'dshwv-body'
body.id = 'luna-balance-content'
var bubble = document.createElement('div')
bubble.className = 'dshwv-bubble'
body.appendChild(img)
body.appendChild(bubble)
body.appendChild(textBox)
root.appendChild(body)
root.appendChild(sizeBox)
root.appendChild(toggleBtn)
document.body.appendChild(root)

// Position model: the widget is ALWAYS expressed in left/top px (so edge snaps
// animate smoothly via the CSS transition on both sides — switching to
// right/auto cannot transition and flashes). The anchor info (h/v + offsets)
// lives in state and is used by settle() to recompute coordinates on window
// resize and size changes, keeping the widget glued to its anchored edge.
var state = {
  scale: 1,
  h: 'right',
  hOff: 0,
  v: 'bottom',
  vOff: 0,
  left: 0,
  top: 0,
  collapsed: false,
  dockSide: 'right',
  mode: 'balance',
  readings: {
    balance: { amount: null, currency: null, status: 'loading' },
    spending: { amount: null, currency: null, status: 'loading', date: null }
  }
}
var settleTimer = null
var drag = null
var shown = null
var animId = null

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function fmt(balance, currency) {
  var num = Number(balance)
  var fixed = isFinite(num) ? num.toFixed(2) : '--'
  return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + currency
}
function animateAmount(from, to, currency, duration) {
  if (animId) cancelAnimationFrame(animId)
  if (from === null || !isFinite(from)) from = to
  if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown = to
    amountEl.textContent = fmt(to, currency)
    return
  }
  var startTime = null
  function step(ts) {
    if (startTime === null) startTime = ts
    var t = Math.min(1, (ts - startTime) / duration)
    var eased = 1 - Math.pow(1 - t, 3)
    var val = from + (to - from) * eased
    amountEl.textContent = fmt(val, currency)
    if (t < 1) {
      animId = requestAnimationFrame(step)
    } else {
      animId = null
      shown = to
      amountEl.textContent = fmt(to, currency)
    }
  }
  animId = requestAnimationFrame(step)
}
function render() {
  var reading = state.readings[state.mode]
  labelEl.textContent = t(state.mode)
  switchBtn.textContent = t('switch')
  switchBtn.dataset.lunaLabel = state.mode === 'balance' ? 'showSpending' : 'showBalance'
  switchBtn.title = t(switchBtn.dataset.lunaLabel)
  switchBtn.setAttribute('aria-label', switchBtn.title)
  var amount, hint
  if (reading.status === 'loading') {
    amount = shown !== null ? fmt(shown, reading.currency) : '…'
    hint = t('loading')
  } else if (reading.status === 'error' || reading.status === 'signIn') {
    amount = shown !== null ? fmt(shown, reading.currency) : '--'
    hint = t(reading.status === 'signIn' ? 'signIn' : shown !== null ? 'stale' : reading.errorHint || 'retry')
  } else {
    amount = shown !== null ? fmt(shown, reading.currency) : (reading.amount !== null ? fmt(reading.amount, reading.currency) : '--')
    hint = ''
  }
  amountEl.textContent = amount
  hintEl.textContent = hint
  hintEl.hidden = !hint
  textBox.toggleAttribute('data-notice', !!hint)
  updatePeriod()
}
function switchReading() {
  if (animId) cancelAnimationFrame(animId)
  animId = null
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = null
  state.mode = state.mode === 'balance' ? 'spending' : 'balance'
  expireSpending()
  shown = state.readings[state.mode].amount
  render()
  refresh(false)
  settle()
}
function expireSpending() {
  var reading = state.readings.spending
  if (reading.date !== spendingDate()) {
    reading.amount = null
    reading.currency = null
    reading.status = 'loading'
    reading.date = spendingDate()
    if (state.mode === 'spending') shown = null
  }
}
function express() {
  var vp = viewport()
  var w = root.offsetWidth
  var side = state.collapsed ? state.dockSide : state.h
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = (state.collapsed ? (side === 'left' ? HANDLE_WIDTH - w : vp.w - HANDLE_WIDTH) : state.left) + 'px'
  root.style.top = state.top + 'px'
  var controlWidth = sizeBox.offsetWidth || 56
  var controlsOnRight = state.left + w / 2 < vp.w / 2
  sizeBox.style.left = clamp(controlsOnRight ? w + 6 : -controlWidth - 6, 4 - state.left, vp.w - controlWidth - 4 - state.left) + 'px'
  root.classList.toggle('dshwv-left', side === 'left')
  root.classList.toggle('dshwv-collapsed', state.collapsed)
  body.inert = state.collapsed
  body.setAttribute('aria-hidden', String(state.collapsed))
  sizeBox.hidden = state.collapsed
  toggleBtn.textContent = (side === 'left') === state.collapsed ? '›' : '‹'
  toggleBtn.dataset.lunaLabel = state.collapsed ? 'expand' : 'collapse'
  toggleBtn.title = t(toggleBtn.dataset.lunaLabel)
  toggleBtn.setAttribute('aria-label', toggleBtn.title)
  toggleBtn.setAttribute('aria-expanded', String(!state.collapsed))
  smallerBtn.disabled = state.scale <= MIN_SCALE
  largerBtn.disabled = state.scale >= MAX_SCALE
}
function toggleCollapsed() {
  if (!state.collapsed) state.dockSide = state.left + root.offsetWidth / 2 < viewport().w / 2 ? 'left' : 'right'
  state.collapsed = !state.collapsed
  settle()
  toggleBtn.focus({ preventScroll: true })
}
function settle() {
  var vp = viewport()
  var w = root.offsetWidth || root.getBoundingClientRect().width || 0
  var h = root.offsetHeight || root.getBoundingClientRect().height || 0
  if (drag && drag.active) {
    // mid-drag resize: keep the pointer-follow position, just clamp into view
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w))
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
    express()
    return
  }
  if (state.h === 'right') {
    state.left = Math.max(0, vp.w - w - state.hOff)
  } else if (state.h === 'left') {
    state.left = state.hOff
  } else {
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w))
  }
  if (state.v === 'bottom') {
    state.top = Math.max(0, vp.h - h - state.vOff)
  } else if (state.v === 'top') {
    state.top = state.vOff
  } else {
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
  }
  express()
}
function refresh(manual) {
  if (disposed) return
  expireSpending()
  var mode = state.mode
  var reading = state.readings[mode]
  var requestDate = reading.date
  if (activeRequests.has(mode)) { render(); return }
  if (manual || reading.amount === null) { reading.status = 'loading'; render() }
  var ctrl = new AbortController()
  var timer = setTimeout(function () { ctrl.abort() }, FETCH_TIMEOUT_MS)
  activeRequests.set(mode, { controller: ctrl, timer: timer })
  fetch(readingUrl(mode), { cache: 'no-store', signal: ctrl.signal })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (disposed) return
      if (mode === 'spending' && requestDate !== spendingDate()) { expireSpending(); render(); return }
      if (data && data.ok) {
        var nb = Number(mode === 'balance' ? data.totalBalance : data.totalSpent)
        var nc = String(data.currency || 'CNY')
        if (!isFinite(nb) || mode === 'spending' && data.date !== spendingDate()) {
          reading.status = 'error'
          if (state.mode === mode) render()
          return
        }
        var changed = reading.amount !== null && (nb !== reading.amount || nc !== reading.currency)
        var currencyChanged = reading.currency !== null && nc !== reading.currency
        reading.amount = nb
        reading.currency = nc
        reading.status = data.stale ? 'error' : 'ok'
        if (state.mode !== mode) return
        if (data.stale || currencyChanged) {
          if (animId) cancelAnimationFrame(animId)
          animId = null
          shown = nb
          reading.status = data.stale ? 'error' : 'ok'
          render()
          return
        }
        if (changed) {
          if (!manual) {
            reading.status = 'changing'
            animateAmount(shown, nb, nc, ANIM_MS)
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(function () {
              settleTimer = null
              if (reading.status === 'changing') { reading.status = 'ok'; render() }
            }, CHANGE_MS)
          } else {
            animateAmount(shown, nb, nc, ANIM_MS)
            reading.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = nb
          reading.status = 'ok'
          render()
        }
      } else {
        reading.errorHint = data && data.code === 'API_KEY_REJECTED' ? 'keyRejected' : data && data.code === 'BALANCE_TIMEOUT' ? 'timeout' : 'retry'
        reading.status = data && (data.code === 'ACCOUNT_SIGNED_OUT' || data.code === 'NO_ACCOUNT_SERVICE') ? 'signIn' : 'error'
        if (reading.status === 'signIn') { reading.amount = null; if (state.mode === mode) shown = null }
        if (state.mode === mode) render()
      }
    })
    .catch(function () {
      if (disposed) return
      reading.errorHint = 'retry'
      reading.status = 'error'
      if (state.mode === mode) render()
    })
    .finally(function () {
      activeRequests.delete(mode)
      clearTimeout(timer)
      if (!disposed && state.mode === mode && mode === 'spending' && requestDate !== spendingDate()) refresh(false)
    })
}
function adjust(delta) {
  var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale + delta)) * 10) / 10
  state.scale = next
  root.style.setProperty('--dshw-scale', String(next))
  try {
    fetch(SIZE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: next }) }).catch(function (err) { /* A failed size save keeps the current page scale. */ })
  } catch (err) {}
  settle()
}
var SQUISH = 'scaleY(0.88) scaleX(1.05)'
function pressDown() {
  body.style.transform = SQUISH
}
function pressUp() {
  body.style.transform = 'scaleY(1) scaleX(1)'
}
function onPointerDown(e) {
  if (e.button !== 0 || state.collapsed) return
  try { root.setPointerCapture(e.pointerId) } catch (err) {}
  var vp = viewport()
  var rect = root.getBoundingClientRect()
  drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, moved: false, vp: vp }
  root.classList.add('dshwv-dragging')
  pressDown()
}
function onPointerMove(e) {
  if (!drag || !drag.active) return
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true
  // Keep the pre-drag flip orientation while dragging (state.h/v stay as they
  // were); on release endDrag() recomputes the anchors and settle() flips the
  // class with a smooth transition instead of reverting instantly.
  state.left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  state.top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  express()
}
function endDrag(e, clickAllowed) {
  if (!drag || !drag.active) return
  drag.active = false
  pressUp()
  root.classList.remove('dshwv-dragging')
  try {
    if (root.hasPointerCapture && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
  } catch (err) {}
  if (clickAllowed && !drag.moved) { refresh(true); return }
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  var left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  var top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  var centerX = left + drag.w / 2
  var centerY = top + drag.h / 2
  if (centerX < drag.vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
  } else if (centerX > drag.vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < drag.vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
  } else if (centerY > drag.vp.h * 3 / 4) {
    state.v = 'bottom'
    state.vOff = 0
  } else {
    state.v = null
    state.vOff = top
  }
  state.left = left
  state.top = top
  settle()
}
root.addEventListener('pointerdown', onPointerDown)
root.addEventListener('pointermove', onPointerMove)
root.addEventListener('pointerup', function (e) { endDrag(e, true) })
root.addEventListener('pointercancel', function (e) { endDrag(e, false) })
function onControlsPointerMove(e) {
  if (e.pointerType === 'touch') return
  var regions = state.collapsed ? [toggleBtn] : [root, sizeBox]
  var near = regions.some(function (element) {
    var rect = element.getBoundingClientRect()
    return e.clientX >= rect.left - 24 && e.clientX <= rect.right + 24 &&
      e.clientY >= rect.top - 24 && e.clientY <= rect.bottom + 24
  })
  root.classList.toggle('dshwv-near', near)
}
function hideControls() { root.classList.remove('dshwv-near') }
document.addEventListener('pointermove', onControlsPointerMove)
document.addEventListener('pointerleave', hideControls)
window.addEventListener('blur', hideControls)
function onResize() {
  root.classList.add('dshwv-resizing')
  settle()
  // Flush layout without transitions to keep the edge handle in the resized viewport.
  root.getBoundingClientRect()
  root.classList.remove('dshwv-resizing')
}
window.addEventListener('resize', onResize)
var localeObserver = new MutationObserver(function () {
  for (var button of sizeBox.querySelectorAll('button')) {
    button.title = t(button.dataset.lunaLabel)
    button.setAttribute('aria-label', button.title)
  }
  express()
  render()
})
localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })

var rect0 = root.getBoundingClientRect()
state.left = rect0.left
state.top = rect0.top
express()
render()
refresh(false)
var sizeController = new AbortController()
var sizeTimer = setTimeout(function () { sizeController.abort() }, FETCH_TIMEOUT_MS)
fetch(SIZE_URL, { cache: 'no-store', signal: sizeController.signal })
  .then(function (r) { return r.json() })
  .then(function (d) {
    if (disposed) return
    if (d && typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
      state.scale = d.scale
      root.style.setProperty('--dshw-scale', String(d.scale))
      settle()
    }
  })
  .catch(function (err) { /* The current page scale remains usable without stored size. */ })
  .finally(function () { clearTimeout(sizeTimer) })
function onVisible() { if (!document.hidden) { render(); refresh(false) } }
document.addEventListener('visibilitychange', onVisible)
var periodTimer = setInterval(function () {
  updatePeriod()
  if (state.mode === 'spending' && state.readings.spending.date !== spendingDate()) { expireSpending(); render(); refresh(false) }
}, 1000)
var refreshTimer = setInterval(function () { refresh(false) }, REFRESH_MS)
window.__dshWhaleWidgetDispose = function () {
  disposed = true
  sizeController.abort()
  clearTimeout(sizeTimer)
  for (var request of activeRequests.values()) { request.controller.abort(); clearTimeout(request.timer) }
  activeRequests.clear()
  if (settleTimer) clearTimeout(settleTimer)
  if (animId) cancelAnimationFrame(animId)
  clearInterval(refreshTimer)
  clearInterval(periodTimer)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('pointermove', onControlsPointerMove)
  document.removeEventListener('pointerleave', hideControls)
  window.removeEventListener('blur', hideControls)
  localeObserver.disconnect()
  document.removeEventListener('visibilitychange', onVisible)
  root.remove()
  styleEl.remove()
  window.__dshWhaleWidget = false
  delete window.__dshWhaleWidgetDispose
}
})()`

/**
 * Register the widget's routes and its index-injection hook.
 *
 * The page script itself is loaded by the Client half of this bundle, because
 * the desktop shell serves its own static index and never applies `tapIndex`;
 * the hook here only covers shells that do apply it.
 */
export default {
  name: 'luna-balance-widget',
  inject: ['webServer', 'credentials'],
  apply(ctx) {
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
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') return { scale: parsed.scale }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale) {
      const body = JSON.stringify({ scale: scale, updatedAt: new Date().toISOString() })
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return { ok: true, scale: scale }
        } catch (err) {}
      }
      return { ok: false, error: '无法持久化挂件尺寸' }
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
