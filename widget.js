/**
 * Host half of the Luna balance widget: the `luna-balance-widget` row of the
 * `dsh-luna-theme` bundle.
 *
 * Serves the four `/dsh-whale/*` routes the widget page script talks to (art,
 * balance, size, script) and reads the DeepSeek balance with the profile's
 * `DEEPSEEK_API_KEY`. It is deliberately a row of its own rather than a branch
 * of `index.js`: this module is the only one that needs the `credentials`
 * injection, and its own `disabled` patch entry turns the widget off without
 * touching the theme.
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
var BALANCE_URL = '/dsh-whale/balance.json'
var SIZE_URL = '/dsh-whale/size.json'
var IMG_URL = '/dsh-whale/widget-image.png'
var HANDLE_WIDTH = 28
var disposed = false
var activeAbort = null

var messages = {
  zh: { balance: 'DeepSeek 余额', smaller: '缩小', larger: '放大', collapse: '收起余额挂件', expand: '展开余额挂件', loading: '加载中…', retry: '获取失败 · 点击重试', refresh: '点击刷新' },
  en: { balance: 'DeepSeek balance', smaller: 'Zoom out', larger: 'Zoom in', collapse: 'Collapse balance widget', expand: 'Expand balance widget', loading: 'Loading…', retry: 'Failed · Click to retry', refresh: 'Click to refresh' }
}
function t(key) {
  return messages[/^zh/i.test(document.documentElement.lang || navigator.language) ? 'zh' : 'en'][key]
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
  '.dshwv-text{position:absolute;left:43.55%;top:25.26%;transform:translate(-50%,-50%);text-align:center;color:#4a3a7a;line-height:1.18;white-space:nowrap;--dshw-u:calc(var(--dshw-base) / 1026);pointer-events:none}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 68);font-weight:500;letter-spacing:.02em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 119);font-weight:500;line-height:1.12;font-variant-numeric:tabular-nums}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 54);color:#544c6e;letter-spacing:.02em}',
  '.dshwv-size{position:absolute;top:4px;left:-62px;display:flex;gap:4px;z-index:2}',
  '.dshwv-control{width:26px;height:26px;box-sizing:border-box;border:1.5px solid var(--luna-sub-edge);border-radius:var(--dsw-radius-md,8px);background:var(--luna-sub-plate-strong);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--luna-sub-ink);font:inherit;font-size:16px;font-weight:500;line-height:1;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none}',
  '.dshwv-control:hover{border-color:var(--luna-sub-edge-hover);background:var(--luna-sub-plate-hover);color:var(--luna-sub-ink-hover)}',
  '.dshwv-control:focus-visible{outline:2px solid var(--luna-sub-ink);outline-offset:2px}',
  '.dshwv-control:disabled{opacity:.45;cursor:default}',
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
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)

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
  balance: null,
  currency: null,
  status: 'loading'
}
var busy = false
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
  var amount, hint
  if (state.status === 'loading') {
    amount = shown !== null ? fmt(shown, state.currency) : '…'
    hint = t('loading')
  } else if (state.status === 'error') {
    amount = shown !== null ? fmt(shown, state.currency) : '--'
    hint = t('retry')
  } else {
    amount = shown !== null ? fmt(shown, state.currency) : (state.balance !== null ? fmt(state.balance, state.currency) : '--')
    hint = state.status === 'changing' ? t('loading') : t('refresh')
  }
  amountEl.textContent = amount
  hintEl.textContent = hint
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
  if (busy || disposed) return
  busy = true
  if (manual || state.balance === null) { state.status = 'loading'; render() }
  var ctrl = null
  var timer = null
  try {
    ctrl = new AbortController()
    activeAbort = ctrl
    timer = setTimeout(function () { try { ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch(BALANCE_URL, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (disposed) return
      if (data && data.ok) {
        var nb = Number(data.totalBalance)
        var nc = String(data.currency || 'CNY')
        var changed = state.balance !== null && (nb !== state.balance || nc !== state.currency)
        var currencyChanged = state.currency !== null && nc !== state.currency
        state.balance = nb
        state.currency = nc
        if (changed && !currencyChanged) {
          if (!manual) {
            state.status = 'changing'
            animateAmount(shown, nb, nc, ANIM_MS)
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(function () {
              settleTimer = null
              if (state.status === 'changing') { state.status = 'ok'; render() }
            }, CHANGE_MS)
          } else {
            animateAmount(shown, nb, nc, ANIM_MS)
            state.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = nb
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        render()
      }
    })
    .catch(function () {
      if (disposed) return
      state.status = 'error'
      render()
    })
    .finally(function () {
      busy = false
      activeAbort = null
      if (timer) clearTimeout(timer)
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
  labelEl.textContent = t('balance')
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
fetch(SIZE_URL, { cache: 'no-store' })
  .then(function (r) { return r.json() })
  .then(function (d) {
    if (disposed) return
    if (d && typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
      state.scale = d.scale
      root.style.setProperty('--dshw-scale', String(d.scale))
      settle()
    }
    refresh(false)
  })
  .catch(function () { refresh(false) })
var refreshTimer = setInterval(function () { refresh(false) }, REFRESH_MS)
window.__dshWhaleWidgetDispose = function () {
  disposed = true
  if (activeAbort) activeAbort.abort()
  if (settleTimer) clearTimeout(settleTimer)
  if (animId) cancelAnimationFrame(animId)
  clearInterval(refreshTimer)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('pointermove', onControlsPointerMove)
  document.removeEventListener('pointerleave', hideControls)
  window.removeEventListener('blur', hideControls)
  localeObserver.disconnect()
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

    async function fetchBalance() {
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
        let res
        try {
          res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal: AbortSignal.timeout(20000),
          })
        } catch (err) {
          lastErr = err
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!res.ok) {
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
        const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
        if (!info || info.total_balance === undefined) {
          return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
        }
        return {
          ok: true,
          totalBalance: Number(info.total_balance),
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

    function getBalance() {
      const now = Date.now()
      if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
        return Promise.resolve(balanceCache.payload)
      }
      if (balanceInFlight) return balanceInFlight
      balanceInFlight = fetchBalance()
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
      kind: 'exact',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const payload = await getBalance()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
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
      if (html.indexOf('/dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
  },
}
