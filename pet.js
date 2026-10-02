/**
 * Host half of the Luna desktop pet: the `luna-pet` row of the
 * `dsh-luna-theme` bundle.
 *
 * Serves the `/dsh-luna-pet/*` routes the pet page script talks to — page
 * script, artwork, work status, and the two chat routes — and reduces the
 * Host's `session/event` feed to the one work-status snapshot the pet mirrors.
 *
 * The chat routes live here rather than in the page script because the page
 * runs in the renderer and cannot reach `ctx.llm`. They read the persona from
 * `persona/asahi-chat.md` and answer under the shell's own request fence; see
 * `admitted()` for why that fence is not optional.
 *
 * It is deliberately a row of its own rather than a branch of `widget.js`: its
 * own `disabled` patch entry turns the pet off without touching either the
 * theme or the balance widget.
 *
 * The row names the package subpath (`dsh-luna-theme/pet`). A second row
 * naming the package root would register a second active client source for one
 * package, which the client module system rejects as a composition error.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory holding this module and the `assets/` directory beside it. */
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))

// The pose set ships inside the package, and the same lookup also reads the
// install tree, so a user can drop their own art beside the profile without
// editing an installed package. The install tree is searched FIRST for that
// reason: with the packaged copy first, a local file could never take effect.
//
// This list is the whole input surface of the image route. A request naming an
// id outside it is answered with the default pose, so the route can never be
// steered at a file of the caller's choosing.
const ART_IDS = [
  'idle',
  'walk-a',
  'sleep',
  'drag',
  'thinking',
  'working',
  'waiting',
  'happy',
  'sad',
  'wave',
  'surprise',
]

/** Directories searched for one pose, in lookup order. */
const ART_DIRS = [
  path.join(PLUGIN_DIR, '..', '..', 'pet-art'),
  path.join(PLUGIN_DIR, 'pet-art'),
  path.join(PLUGIN_DIR, 'assets', 'pet-art'),
]

/** Extensions tried for one pose, in lookup order. */
const ART_EXTS = ['.webp', '.png']

// The single-sheet artwork the pet shipped with, kept as the last resort for an
// install that carries a character sheet but no per-pose set: every pose then
// shows the same picture instead of no pet at all. Same lookup order as the
// poses, install tree first.
const SINGLE_IMAGE_CANDIDATES = [
  path.join(PLUGIN_DIR, '..', '..', 'asahi.webp'),
  path.join(PLUGIN_DIR, '..', '..', 'asahi.png'),
  path.join(PLUGIN_DIR, 'asahi.webp'),
  path.join(PLUGIN_DIR, 'asahi.png'),
  path.join(PLUGIN_DIR, 'assets', 'asahi.webp'),
  path.join(PLUGIN_DIR, 'assets', 'asahi.png'),
]

/** Served type follows the file that won the lookup. */
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}

/**
 * The pose a request asks for.
 *
 * An id outside `ART_IDS` is not an error to report: the route answers with the
 * default pose, which keeps the lookup inside the artwork directories whatever
 * the caller sends.
 * @param url - the request target.
 * @returns one of `ART_IDS`.
 */
function requestedArt(url) {
  let id = ART_IDS[0]
  try {
    const asked = new URL(url || '/', 'http://localhost').searchParams.get('id')
    if (asked && ART_IDS.includes(asked)) id = asked
  } catch (err) {
    // An unparsable request target asks for the default pose.
  }
  return id
}

/** Work-status states the pet mirrors, ordered as the page script indexes them. */
const WORK_STATES = ['thinking', 'working', 'result', 'waiting', 'success', 'error']

/**
 * How long a busy snapshot may go untouched before the page treats it as
 * stale and falls back to idle.
 *
 * The `turn/end` feed covers every end reason, so this is a second line of
 * defence rather than the primary path: a turn that dies without appending its
 * end event (a killed Host, a crashed provider) must not pin the pet in
 * `working` forever.
 */
const STALE_MS = 5 * 60 * 1000

/** The tool whose call means the model is waiting on the user, not working. */
const USER_QUESTION_TOOL = 'ask_user_question'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

// ---------------------------------------------------------------------------
// Chat routes.
// ---------------------------------------------------------------------------

/**
 * Thinking is OFF for every chat request, by measurement rather than taste.
 *
 * `deepseek-flash` defaults to `high` effort, and the same one-line greeting
 * cost 131 tokens with it against 46 without. Worse, at `maxTokens: 96` the
 * reasoning pass consumed the entire budget and not one `text-delta` arrived,
 * so the bubble rendered empty and only the `finish` reason said why. A pet
 * reply is one or two sentences; there is nothing for a reasoning pass to buy.
 */
const CHAT_REASONING_EFFORT = 'off'

/** Output cap; generously above a three-sentence reply and still bounded. */
const CHAT_MAX_TOKENS = 512

/** Turns of history the page may send; older turns are dropped silently. */
const CHAT_HISTORY_LIMIT = 12

/** Largest request body accepted, in bytes. */
const CHAT_BODY_LIMIT = 64 * 1024

/**
 * Persona file lookup, install tree before package, exactly like the artwork.
 *
 * The packaged copy is the default; the profile-level copy lets the wording be
 * re-tuned without editing an installed package, which a reinstall would
 * overwrite.
 */
const PERSONA_CANDIDATES = [
  path.join(process.env.DSH_PROFILE_DIR ?? PLUGIN_DIR, 'asahi-chat.md'),
  path.join(PLUGIN_DIR, 'persona', 'asahi-chat.md'),
]

/**
 * SSE headers.
 *
 * No `Access-Control-Allow-Origin`: this route spends the user's credit, so it
 * is same-origin only. The web server's gzip middleware skips
 * `text/event-stream` by itself, so compression needs no opt-out here.
 */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
}

/** JSON headers for the chat routes: same-origin only, unlike the read-only status route. */
const CHAT_JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const PET_JS = `(function () {
if (window.__dshLunaPet) return
window.__dshLunaPet = true

var SCRIPT_URL = '/dsh-luna-pet/pet.js'
var IMAGE_URL = '/dsh-luna-pet/pet-image.png'
var STATE_URL = '/dsh-luna-pet/state.json'
var CHAT_URL = '/dsh-luna-pet/chat'
var CHAT_MODELS_URL = '/dsh-luna-pet/chat-models.json'
// Kept in step with the floating input's own width so the edge nudge is right on
// the first frame, before the element has been laid out once.
var CHAT_WIDTH = 232
var CHAT_PAD = 8
// A reply is held open for as long as it takes to read rather than for the
// status bubble's fixed blip: the same 3.2 s that suits "办好了" leaves a
// two-sentence answer unread.
var CHAT_REPLY_MIN_MS = 5200
var CHAT_REPLY_MS_PER_CHAR = 95
var CHAT_REPLY_MAX_MS = 18000
var STORE_KEY = 'dsh-luna-pet'
var POLL_MS = 1500
var FETCH_TIMEOUT_MS = 8000

var DEFAULT_HEIGHT = 168
var MIN_SCALE = 0.55
var MAX_SCALE = 1.7
var STEP = 0.1
var BAND_PAD = 6
var ROAM_MIN_MS = 3600
var ROAM_MAX_MS = 11000
var NEIGHBOUR_CACHE_MS = 250
var WALK_SPEED = 34
// The trip home crosses the whole band rather than one roaming leg, so the pet
// walks it at three times the roaming pace. The step cadence rises with the
// pace: at the roaming cadence the character would glide instead of walk.
var HOME_SPEED = 102
var WALK_STEP_RATE = 7.4
var WALK_MIN_PX = 70
var WALK_MAX_PX = 240
var TURN_PAUSE_MS = 260
var DRAG_THRESHOLD = 6
var GRAVITY = 1400
var RESTITUTION = 0.78
var GROUND_FRICTION = 2.5
var DEAD_ZONE_SPEED = 500
var MAX_THROW_SPEED = 3600
// Doze off once neither the Host has run a task nor the user has stirred for
// this long. The old 90 s clock watched user input alone, so a session that
// ended while the pet was already asleep left it dozing through the next task
// and hopping to report the result.
var SLEEP_IDLE_MS = 180000
var BUBBLE_MS = 3200
var NEIGHBOUR_DIST = 92
var NEIGHBOUR_COOLDOWN_MS = 45000
var WATCHDOG_MS = 4000
// Poses the Host half serves. The page script names them again because it is
// served as a plain script rather than imported; verify.mjs compares the two
// lists so a pose added on one side alone fails the gate.
var ART_IDS = [
  'idle',
  'walk-a',
  'sleep',
  'drag',
  'thinking',
  'working',
  'waiting',
  'happy',
  'sad',
  'wave',
  'surprise'
]
var IDLE_ART = 'idle'
// Display height per pose, as a fraction of the box. The airborne pose is the
// one the delivered set draws small: its straightened hair occupies a third of
// the canvas, so at a shared height its body measures 0.76 of every other pose.
// Scaling it here keeps the character the same size while it is in the air, and
// the hair simply rises past the top of the box, which never clips it.
var ART_HEIGHT = { drag: 1.32 }
// How long a direct answer to the user (a poke, a greeting, waking up) holds
// its pose before the mood takes over again.
var POKE_POSE_MS = 1100
var WAVE_POSE_MS = 1500

// Asahi's lines, in the voice the game's own Simplified Chinese localisation
// gives her: service-register politeness (您 / 请 / 遵命 / 在下), an apology for
// every miss, and a stammer or an ellipsis when she is caught off guard. Each
// phrase is taken from the 5445 lines the scripts tag 【小倉朝日】.
var STATE_TEXTS = {
  thinking: ['容我想一想', '请稍等片刻', '嗯……我想想'],
  working: ['是，这就去办', '正在处理中', '请稍候片刻'],
  result: ['是，收到了', '已经记下了'],
  waiting: ['在等您的吩咐', '请您点一下', '需要您确认'],
  success: ['办好了', '是，完成了', '这就办好了'],
  error: ['非常抱歉……', '是……失败了', '唔……实在抱歉']
}
var IDLE_TEXTS = ['今天也请多指教', '有什么吩咐吗', '在的，请问怎么了']
var SLEEP_TEXTS = ['失礼了……小憩片刻', '稍微……打个盹']
var POKE_TEXTS = ['咦！？', '呀……请别戳', '请问……怎么了', '唔……失礼了']
var BUSY_POKE_TEXTS = ['现在正在办事', '请稍等片刻', '那个……请稍等']
var NEIGHBOUR_TEXTS = ['露娜大人也在呢', '露娜大人，您好', '是露娜大人']
var WAKE_TEXTS = ['唔……我睡着了吗', '啊……失礼了']

var css = [
  // The root box is wider than the character so the sway has room; it must not
  // swallow clicks, so pointer events are opted back in on the artwork and the
  // menu only. Everything between them stays click-through.
  '.dshlp-root{position:fixed;z-index:9998;--dshlp-scale:1;height:calc(var(--dshlp-h) * var(--dshlp-scale));width:calc(var(--dshlp-h) * var(--dshlp-scale) * 1.34);transform-origin:50% 100%;touch-action:none;user-select:none;-webkit-user-select:none;font-family:inherit;will-change:left,top;pointer-events:none}',
  '.dshlp-flip{position:absolute;inset:0;transition:transform .18s ease;pointer-events:none}',
  '.dshlp-wob{position:absolute;inset:0;transform-origin:50% 100%;pointer-events:none}',
  '.dshlp-img{position:absolute;bottom:0;left:50%;height:100%;width:auto;transform:translateX(-50%);pointer-events:auto;cursor:grab;touch-action:none;-webkit-user-drag:none;user-select:none;filter:drop-shadow(0 3px 5px rgba(40,32,64,.22))}',
  '.dshlp-root.dshlp-dragging .dshlp-img{cursor:grabbing}',
  '.dshlp-root.dshlp-sleeping .dshlp-img{cursor:default}',
  // The bubble and the menu wear the theme's SECOND control tier rather than a
  // palette of their own: the denser plate that tier's own pop-up panels use,
  // with the running scheme's edge and type (white, pale sakura and violet on
  // light; violet glass, antique gold and gold on dark). The denser plate is
  // the one to take here because the pet floats on the wallpaper rather than
  // inside a panel, and the translucent plaque the one-line controls wear would
  // leave gold type on a washed-out violet over this light artwork. The theme
  // declares the tokens on body and this root is a child of it, so both schemes
  // follow with no dark-mode branch here.
  '.dshlp-bubble{position:absolute;left:50%;bottom:calc(100% - 6px);transform:translate(calc(-50% + var(--dshlp-shift,0px)),4px) scale(.86);transform-origin:50% 100%;background:var(--luna-sub-plate-strong);color:var(--luna-sub-ink);border:1.5px solid var(--luna-sub-edge);border-radius:12px;padding:5px 10px;font-size:12px;line-height:1.35;white-space:nowrap;box-shadow:0 4px 14px rgba(40,32,64,.18);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s cubic-bezier(.34,1.56,.64,1)}',
  '.dshlp-bubble.dshlp-on{opacity:1;transform:translate(calc(-50% + var(--dshlp-shift,0px)),0) scale(1)}',
  '.dshlp-bubble.dshlp-alert{border-color:var(--luna-sakura);font-weight:600}',
  // A chat reply is a sentence or three, so it wraps where a status bubble never
  // has to. The explicit max-content width is load-bearing rather than
  // decorative: an absolutely positioned box shrink-to-fits against what is left
  // of its containing block, and the pet box is only ~225px wide with the bubble
  // centred, so the measure came out near six characters. An explicit width
  // steps around that, and the cap then is the measure asked for: 144px of
  // content is twelve full-width characters at 12px, since box-sizing is
  // content-box here.
  '.dshlp-bubble.dshlp-wide{white-space:normal;text-align:left;width:max-content;max-width:144px;line-height:1.5}',
  '.dshlp-menu{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);background:var(--luna-sub-plate-strong);border:1.5px solid var(--luna-sub-edge);border-radius:10px;padding:4px;box-shadow:0 8px 22px rgba(40,32,64,.22);display:none;flex-direction:column;gap:2px;z-index:2;pointer-events:auto}',
  '.dshlp-menu.dshlp-on{display:flex}',
  '.dshlp-menu button{border:none;background:transparent;color:var(--luna-sub-ink);font:inherit;font-size:12px;text-align:left;padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}',
  '.dshlp-menu button:hover{background:var(--luna-sub-plate-hover)}',
  '.dshlp-zzz{position:absolute;left:60%;bottom:78%;color:#8d829f;font-size:13px;font-weight:700;opacity:0;pointer-events:none}',
  '.dshlp-zzz.dshlp-on{animation:dshlp-zzz 2.6s ease-in-out infinite}',
  '@keyframes dshlp-zzz{0%{opacity:0;transform:translate(0,0) scale(.8)}30%{opacity:.9}100%{opacity:0;transform:translate(9px,-22px) scale(1.15)}}',
  // The floating chat box sits over the character's hands rather than in a panel
  // of its own: the conversation belongs to the pet, not to a window beside it.
  // It wears the translucent tier and a backdrop blur, because the whole point
  // of floating it there is that the artwork stays visible through it — the blur
  // is what keeps the type legible over a busy background.
  //
  // The bottom anchor is measured, not guessed: in idle.webp the clasped hands
  // sit at image y 570 of 720, and the box maps the artwork to its full height,
  // so the hands are 20.8% up from the box's bottom edge. The input is about 18%
  // of the box height at scale 1, so anchoring its bottom edge at 12% centres it
  // on the hands and keeps them covered at every pet scale.
  //
  // The second background declaration is the progressive enhancement: the pet
  // stands straight on the wallpaper, where the theme's own contrast model
  // (panels under panels) does not describe it, and the plaque tier alone
  // measures about 4.25:1 there — marginally under AA. Mixing the denser plate
  // down to 78% stays visibly translucent while moving the composite back
  // towards the plate colour. A browser without color-mix drops the line and
  // keeps the token.
  '.dshlp-say{position:absolute;left:50%;bottom:12%;transform:translateX(calc(-50% + var(--dshlp-shift,0px)));width:232px;max-width:calc(100vw - 16px);box-sizing:border-box;display:none;font:inherit;font-size:12px;line-height:1.4;color:var(--luna-sub-ink);background:var(--luna-sub-plate);background:color-mix(in srgb, var(--luna-sub-plate-strong) 78%, transparent);border:1.5px solid var(--luna-sub-edge);border-radius:11px;padding:7px 11px;outline:none;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);box-shadow:0 6px 18px rgba(40,32,64,.24);z-index:4;pointer-events:auto}',
  '.dshlp-say.dshlp-on{display:block}',
  '.dshlp-say:focus{border-color:var(--luna-sakura)}',
  '.dshlp-say::placeholder{color:var(--luna-sub-ink);opacity:.55}',
  '.dshlp-say.dshlp-busy{opacity:.6}',
  // The model list pulls out sideways from its menu row. It is a sibling of the
  // rows rather than a child of one: a button cannot contain buttons.
  '.dshlp-sub{position:absolute;left:calc(100% + 4px);display:none;flex-direction:column;gap:2px;min-width:104px;max-height:210px;overflow-y:auto;background:var(--luna-sub-plate-strong);border:1.5px solid var(--luna-sub-edge);border-radius:10px;padding:4px;box-shadow:0 8px 22px rgba(40,32,64,.22);z-index:3;pointer-events:auto}',
  '.dshlp-sub.dshlp-on{display:flex}',
  // Flipped when the pet stands near the right edge and the pullout would leave
  // the viewport.
  '.dshlp-sub.dshlp-flip{left:auto;right:calc(100% + 4px)}',
  '.dshlp-sub button{border:none;background:transparent;color:var(--luna-sub-ink);font:inherit;font-size:12px;text-align:left;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}',
  '.dshlp-sub button:hover{background:var(--luna-sub-plate-hover)}',
  '.dshlp-sub button.dshlp-picked{font-weight:600}',
  '.dshlp-sub button.dshlp-picked::before{content:"· ";opacity:.7}'
].join('\\n')

var styleEl = document.createElement('style')
// Declare ownership before inserting. The client module system assigns every
// untagged <style> to whichever bundle materialises next (claimStyles in
// packages/client/modules), and that package's later replacement deletes it via
// removeOwnedStyles. Untagged, this sheet is collateral damage whenever a
// plugin materialising after this script reloads.
styleEl.dataset.plugin = 'luna-pet'
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshlp-root'
root.style.setProperty('--dshlp-h', DEFAULT_HEIGHT + 'px')

var flip = document.createElement('div')
flip.className = 'dshlp-flip'
var wob = document.createElement('div')
wob.className = 'dshlp-wob'
var img = document.createElement('img')
img.className = 'dshlp-img'
img.alt = '小仓朝日'
img.draggable = false
wob.appendChild(img)
flip.appendChild(wob)
root.appendChild(flip)

var bubble = document.createElement('div')
bubble.className = 'dshlp-bubble'
root.appendChild(bubble)

var zzz = document.createElement('div')
zzz.className = 'dshlp-zzz'
zzz.textContent = 'z'
root.appendChild(zzz)

var menu = document.createElement('div')
menu.className = 'dshlp-menu'
root.appendChild(menu)

var sayInput = document.createElement('input')
sayInput.className = 'dshlp-say'
sayInput.type = 'text'
sayInput.maxLength = 500
sayInput.placeholder = '说点什么…'
root.appendChild(sayInput)

// Built here, appended by buildMenu() so it sits beside the row that opens it.
var modelMenu = document.createElement('div')
modelMenu.className = 'dshlp-sub'

document.body.appendChild(root)

var state = {
  scale: 1,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  facing: 1,
  mode: 'idle',
  targetX: null,
  nextRoamAt: 0,
  pokeAt: 0,
  sleeping: false,
  dragging: false,
  // "Stay put": the user asked the pet to start no walks of its own. Dragging
  // and the trip home still work — only planWalk() is gated on this.
  anchored: false,
  // True while the walk in progress is the trip home, which runs at HOME_SPEED.
  rushing: false,
  working: null,
  // The last status value acted on. The Host keeps naming the last state until
  // the next event, so this is what separates news from a repeat.
  statusShown: null,
  // Last time the Host ran a task. Together with lastInput this is the clock
  // checkSleep() reads.
  lastTaskAt: Date.now(),
  // A pose that briefly outranks the mood: the answer to a poke, or the wave
  // the pet gives when it wakes up. Held as { id, until }.
  pose: null,
  lastInput: Date.now(),
  neighCool: 0,
  hidden: false
}
var drag = null
var raf = null
var lastFrame = 0
var bubbleTimer = null
var menuOpen = false
var anchorButton = null
var pingMiss = 0
var lastScale = -1
var t = 0

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function rand(lo, hi) { return lo + Math.random() * (hi - lo) }
function pick(list) { return list[Math.floor(Math.random() * list.length)] }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function boxW() { return root.offsetWidth || 0 }
function boxH() { return root.offsetHeight || 0 }
function groundTop() { return Math.max(0, viewport().h - boxH() - BAND_PAD) }
function minX() { return BAND_PAD }
function maxX() { return Math.max(BAND_PAD, viewport().w - boxW() - BAND_PAD) }

function load() {
  try {
    var raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return null
    var parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (err) { return null }
}
function save() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      scale: state.scale,
      fx: viewport().w ? state.x / viewport().w : null,
      edge: state.x < viewport().w / 2 ? 'left' : 'right',
      sleeping: state.sleeping,
      anchored: state.anchored,
      chatModel: chatModelKey
    }))
  } catch (err) {}
}

function say(text, alert, ms) {
  if (!text) return
  bubble.textContent = text
  bubble.classList.toggle('dshlp-alert', !!alert)
  bubble.classList.add('dshlp-on')
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(function () {
    bubbleTimer = null
    bubble.classList.remove('dshlp-on')
    bubble.classList.remove('dshlp-wide')
  }, ms || BUBBLE_MS)
}

// ---------------------------------------------------------------------------
// Neighbour awareness: the Luna balance widget is read only through its
// bounding rect. Nothing about it is written, and a missing or renamed node
// silently degrades to "no neighbour".
// ---------------------------------------------------------------------------
var NEIGHBOUR_SELECTOR = '.dshwv-root'
var nbCache = { at: 0, el: null, rect: null }
function neighbourRect() {
  var now = performance.now()
  if (now - nbCache.at < NEIGHBOUR_CACHE_MS) return nbCache.rect
  nbCache.at = now
  var el = document.querySelector(NEIGHBOUR_SELECTOR)
  // Re-resolving the node on every miss costs a query, so a remembered node
  // that is still connected is reused; a widget mounted later is picked up by
  // the next miss.
  if (!el && nbCache.el && nbCache.el.isConnected) el = nbCache.el
  nbCache.el = el
  if (!el) { nbCache.rect = null; return null }
  var r = el.getBoundingClientRect()
  nbCache.rect = (!r || r.width < 4 || r.height < 4) ? null : r
  return nbCache.rect
}

// ---------------------------------------------------------------------------
// Roaming along the bottom band.
// ---------------------------------------------------------------------------
function planWalk() {
  // The input and the reply bubble hang off the pet, so walking would drag them
  // around the screen. Standing still for the length of a conversation is also
  // what the character would do.
  if (sayOpen || chatBusy) return
  var lo = minX()
  var hi = maxX()
  state.mode = 'idle'
  state.targetX = null
  state.rushing = false
  if (hi - lo < 24) return
  var away = Math.random() < 0.5 ? -1 : 1
  var dist = rand(WALK_MIN_PX, WALK_MAX_PX)
  var target = clamp(state.x + away * dist, lo, hi)
  if (Math.abs(target - state.x) < 24) target = clamp(state.x - away * dist, lo, hi)
  if (Math.abs(target - state.x) < 24) return
  var nb = neighbourRect()
  if (nb) {
    // Do not plan a walk that ends on top of the balance widget: retarget to
    // the near side of it instead of through it.
    var stopLeft = nb.left - boxW() - 6
    var stopRight = nb.right + 6
    if (target > stopLeft && target < stopRight) {
      target = state.x + boxW() < nb.left
        ? clamp(stopLeft, lo, hi)
        : clamp(stopRight, lo, hi)
      if (Math.abs(target - state.x) < 24) return
    }
  }
  state.targetX = target
  state.mode = 'walk'
  state.facing = target >= state.x ? 1 : -1
}

/** The pet stands still while DSH is working, waiting, or asking. */
function isBusy() {
  return state.working === 'thinking' || state.working === 'working' || state.working === 'waiting'
}

/** End a walk: return to idle and schedule the next one. */
function endWalk() {
  state.targetX = null
  state.mode = 'idle'
  state.rushing = false
  state.nextRoamAt = performance.now() + rand(ROAM_MIN_MS, ROAM_MAX_MS)
}

function stepWalk(dt) {
  if (state.targetX === null) { endWalk(); return }
  var dx = state.targetX - state.x
  if (Math.abs(dx) < 1.2) { endWalk(); return }
  var dir = dx > 0 ? 1 : -1
  state.facing = dir
  var nx = state.x + (state.rushing ? HOME_SPEED : WALK_SPEED) * dt * dir
  var nb = state.rushing ? null : neighbourRect()
  if (nb) {
    // The widget is an obstacle, not a wall: stop short of it and re-plan. Only
    // a roaming leg reads it — the trip home is a path the user asked for, and
    // stopping at the widget's near edge would strand the pet halfway there.
    var stopLeft = nb.left - boxW() - 6
    var stopRight = nb.right + 6
    if (dir > 0 && state.x <= stopLeft && nx > stopLeft) { state.x = stopLeft; endWalk(); return }
    if (dir < 0 && state.x + boxW() >= stopRight && nx + boxW() < stopRight) { state.x = stopRight - boxW(); endWalk(); return }
  }
  state.x = clamp(nx, minX(), maxX())
  if (state.x <= minX() || state.x >= maxX()) endWalk()
}

function stepPhysics(dt) {
  state.vy += GRAVITY * dt
  state.x += state.vx * dt
  state.y += state.vy * dt
  var lo = minX()
  var hi = maxX()
  if (state.x < lo) { state.x = lo; state.vx = -state.vx * RESTITUTION }
  else if (state.x > hi) { state.x = hi; state.vx = -state.vx * RESTITUTION }
  var g = groundTop()
  if (state.y >= g) {
    state.y = g
    if (Math.abs(state.vy) < 90) state.vy = 0
    else state.vy = -state.vy * RESTITUTION
    state.vx *= Math.max(0, 1 - GROUND_FRICTION * dt)
    if (Math.abs(state.vx) < 12) {
      state.vx = 0
      if (state.vy === 0) { state.mode = 'idle'; state.nextRoamAt = 0; save() }
    }
  }
  if (state.y < 0) { state.y = 0; state.vy = -state.vy * RESTITUTION }
}

// ---------------------------------------------------------------------------
// Frame loop.
// ---------------------------------------------------------------------------
function frame(now) {
  raf = requestAnimationFrame(frame)
  if (state.hidden) return
  var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0
  lastFrame = now
  if (dt <= 0) return
  t += dt

  if (state.dragging) {
    // position is driven by the pointer handler
  } else if (state.mode === 'throw') {
    stepPhysics(dt)
  } else if (state.mode === 'walk') {
    stepWalk(dt)
  } else {
    var wantY = groundTop()
    if (Math.abs(state.y - wantY) > 0.5) state.y += (wantY - state.y) * Math.min(1, dt * 6)
    else state.y = wantY
    state.x = clamp(state.x, minX(), maxX())
    // Roaming is suspended while DSH is busy, while the pet is asleep, and
    // while the user has asked it to stay put: it stands and watches instead of
    // wandering off mid-task or against that instruction.
    if (!state.sleeping && !state.anchored && !isBusy() && now >= state.nextRoamAt) {
      planWalk()
      state.nextRoamAt = now + rand(ROAM_MIN_MS, ROAM_MAX_MS)
    }
  }

  applyNeighbourMood(now)
  render(now)
}

function render(now) {
  root.style.left = Math.round(state.x) + 'px'
  root.style.top = Math.round(state.y) + 'px'
  // The input and the bubble hang off the pet, so they are re-placed wherever
  // the pet moves — a drag, a walk home, or a window resize all land here.
  if (sayOpen || bubbleTimer) placeFloaters()
  // A custom property write forces a style recalculation, so it is only
  // touched when the scale actually changes (menu, or a restored preference).
  if (state.scale !== lastScale) {
    lastScale = state.scale
    root.style.setProperty('--dshlp-scale', String(state.scale))
  }
  flip.style.transform = state.facing < 0 ? 'scaleX(-1)' : 'scaleX(1)'

  var breath = Math.sin(t * (state.sleeping ? 1.1 : 2.1)) * (state.sleeping ? 1.1 : 0.7)
  var lean = 0
  var hop = 0
  if (state.mode === 'walk') {
    var stepRate = WALK_STEP_RATE * (state.rushing ? HOME_SPEED / WALK_SPEED : 1)
    hop = Math.abs(Math.sin(t * stepRate)) * -2.6
    lean = Math.sin(t * stepRate) * 1.6 * state.facing
  } else if (state.mode === 'throw') {
    lean = state.vx * 0.006
  } else if (state.sleeping) {
    // Dozing. Every flourish below is keyed on the status alone, so without
    // this branch a pet that fell asleep would hop in its sleep to announce a
    // turn that had just finished.
  } else if (state.working === 'waiting') {
    lean = Math.sin(t * 12) * 2.2
    hop = -1.4
  } else if (state.working === 'thinking') {
    lean = Math.sin(t * 3.2) * 1.1
  } else if (state.working === 'success') {
    hop = -Math.abs(Math.sin(t * 5.6)) * 5
  } else if (state.working === 'error') {
    lean = 3.4
  } else if (state.dragging) {
    lean = Math.sin(t * 9) * 6
  }
  // A poke wins over every other pose: it is the direct answer to the user.
  var sincePoke = now - state.pokeAt
  if (sincePoke < 180) hop = -7 * (1 - sincePoke / 180)
  wob.style.transform =
    'translateY(' + (hop + breath).toFixed(2) + 'px) ' +
    'rotate(' + lean.toFixed(2) + 'deg) ' +
    'scaleY(' + (1 + breath * 0.006).toFixed(4) + ')'
  applyArt()
}

// ---------------------------------------------------------------------------
// Artwork: one pose per mood, swapped only once its file is decoded so a
// missing or slow pose never blanks the character.
// ---------------------------------------------------------------------------
var shownArt = null
var artReady = {}
var artLoading = {}
var artFailed = {}

function artSrc(id) { return IMAGE_URL + '?id=' + encodeURIComponent(id) }

/** The pose the current mood asks for, before any missing-file fallback. */
function moodArt() {
  if (state.dragging) return 'drag'
  if (state.pose && performance.now() < state.pose.until) return state.pose.id
  // Waiting on the model is the pet's own thinking, and it outranks the Host's
  // state: the character asked the question here, not in the conversation.
  if (chatBusy) return 'thinking'
  if (state.sleeping) return 'sleep'
  if (state.mode === 'walk') return 'walk-a'
  if (state.working === 'thinking') return 'thinking'
  if (state.working === 'waiting') return 'waiting'
  if (state.working === 'success') return 'happy'
  if (state.working === 'error') return 'sad'
  // The result state is a tool result landing on its way back to the model:
  // the pet is still on the job, and there is no pose of its own for it.
  if (state.working === 'working' || state.working === 'result') return 'working'
  return IDLE_ART
}

/** Answer the user directly for a moment, then fall back to the mood. */
function holdPose(id, ms) {
  state.pose = { id: id, until: performance.now() + ms }
}

function preloadArt(id) {
  // The list is also the guard against a typo in a pose name: an id the Host
  // half does not serve would be answered with the default pose, which reads as
  // a silently broken mood rather than a missing picture.
  if (ART_IDS.indexOf(id) < 0) return
  if (artReady[id] || artLoading[id] || artFailed[id]) return
  artLoading[id] = true
  var probe = new Image()
  probe.onload = function () {
    artLoading[id] = false
    artReady[id] = true
    applyArt()
  }
  probe.onerror = function () {
    artLoading[id] = false
    artFailed[id] = true
    applyArt()
  }
  probe.src = artSrc(id)
}

function applyArt() {
  var want = moodArt()
  // A pose this install does not carry falls back to the default one, and a
  // missing default means there is no artwork at all: the pet then leaves the
  // shell untouched rather than parking a broken image over the UI.
  if (artFailed[want]) want = IDLE_ART
  if (artFailed[want]) { root.style.display = 'none'; return }
  if (want === shownArt) return
  if (!artReady[want]) { preloadArt(want); return }
  shownArt = want
  img.style.height = Math.round((ART_HEIGHT[want] || 1) * 100) + '%'
  img.src = artSrc(want)
}

img.addEventListener('error', function () {
  if (shownArt) { artFailed[shownArt] = true; artReady[shownArt] = false }
  shownArt = null
  applyArt()
})

// ---------------------------------------------------------------------------
// Pointers: drag, throw, poke, menu.
// ---------------------------------------------------------------------------
function onDown(e) {
  if (e.button !== 0) return
  // Clicks inside the menu belong to the menu; the capture-phase document
  // listener has already closed it when the click landed outside.
  if (menu.contains(e.target)) return
  try { root.setPointerCapture(e.pointerId) } catch (err) {}
  drag = {
    id: e.pointerId,
    sx: e.clientX,
    sy: e.clientY,
    ox: state.x,
    oy: state.y,
    moved: false,
    at: performance.now(),
    trail: [{ t: performance.now(), x: e.clientX, y: e.clientY }]
  }
  state.dragging = false
  root.classList.add('dshlp-dragging')
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return
  var dx = e.clientX - drag.sx
  var dy = e.clientY - drag.sy
  if (!drag.moved && dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
    drag.moved = true
    state.dragging = true
    state.sleeping = false
    // Picking the pet up is a wake-up of its own: without clearing the marker
    // the 'z' keeps drifting over a character that is being held in the air.
    zzz.classList.remove('dshlp-on')
    state.mode = 'drag'
    state.targetX = null
    state.rushing = false
  }
  if (!drag.moved) return
  var now = performance.now()
  drag.trail.push({ t: now, x: e.clientX, y: e.clientY })
  if (drag.trail.length > 12) drag.trail.shift()
  state.x = clamp(drag.ox + dx, -boxW() * 0.3, viewport().w - boxW() * 0.7)
  state.y = clamp(drag.oy + dy, -boxH() * 0.2, viewport().h - boxH() * 0.4)
  if (dx !== 0) state.facing = dx > 0 ? 1 : -1
}
function releaseVelocity() {
  var tr = drag.trail
  var now = performance.now()
  var pts = tr.filter(function (p) { return now - p.t <= 200 })
  if (pts.length < 2) return { vx: 0, vy: 0 }
  var a = pts[0]
  var b = pts[pts.length - 1]
  var span = (b.t - a.t) / 1000
  if (span < 0.02) return { vx: 0, vy: 0 }
  var vx = (b.x - a.x) / span
  var vy = (b.y - a.y) / span
  var speed = Math.sqrt(vx * vx + vy * vy)
  if (speed < DEAD_ZONE_SPEED) return { vx: 0, vy: 0 }
  if (speed > MAX_THROW_SPEED) {
    var k = MAX_THROW_SPEED / speed
    vx *= k
    vy *= k
  }
  return { vx: vx, vy: vy }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return
  var wasMoved = drag.moved
  try { if (root.hasPointerCapture && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId) } catch (err) {}
  root.classList.remove('dshlp-dragging')
  var v = wasMoved ? releaseVelocity() : { vx: 0, vy: 0 }
  drag = null
  state.dragging = false
  if (!wasMoved) {
    state.lastInput = Date.now()
    if (state.sleeping) { wake(); return }
    poke()
    return
  }
  state.vx = v.vx
  state.vy = v.vy
  state.mode = (v.vx === 0 && v.vy === 0) ? 'idle' : 'throw'
  if (state.mode === 'idle') state.y = groundTop()
  state.nextRoamAt = 0
  state.lastInput = Date.now()
  save()
}
function poke() {
  say(pick(isBusy() ? BUSY_POKE_TEXTS : POKE_TEXTS))
  state.pokeAt = performance.now()
  holdPose('surprise', POKE_POSE_MS)
  state.lastInput = Date.now()
}
function wake(silent) {
  state.sleeping = false
  zzz.classList.remove('dshlp-on')
  state.lastInput = Date.now()
  // A silent wake is the Host starting work: that state says its own line right
  // after, so a greeting here would be overwritten and its wave pose would sit
  // over the work pose for a second and a half.
  if (!silent) {
    say(pick(WAKE_TEXTS))
    holdPose('wave', WAVE_POSE_MS)
  }
  save()
}

// ---------------------------------------------------------------------------
// Work-status mirror.
// ---------------------------------------------------------------------------
/**
 * Mirror one work-status snapshot.
 *
 * The Host keeps naming the last state until the next event, so every poll
 * repeats it. Only a change is news: without that guard a finished turn is
 * announced again each time the pet's own decay timer expires, which reads as a
 * pet celebrating a task that ended minutes ago, indefinitely.
 * @param next - the state, or null for idle.
 */
function applyStatus(next) {
  if (next === state.statusShown) return
  state.statusShown = next
  state.working = next
  // A state the Host is running is activity. The null that follows is not
  // stamped: it also arrives once when a snapshot goes stale, long after the
  // turn it describes, and stamping that would delay the next doze by a full
  // window. A user who interrupted a turn has just touched the page anyway, so
  // lastInput already covers that end.
  if (next !== null) state.lastTaskAt = Date.now()
  if (next === null) return
  if (state.sleeping) wake(true)
  var texts = STATE_TEXTS[next]
  if (!texts) return
  say(pick(texts), next === 'waiting')
  if (next === 'success' || next === 'error') {
    setTimeout(function () {
      if (state.working === next) state.working = null
    }, next === 'success' ? 4000 : 6000)
  }
}
var pollTimer = null
function poll() {
  var ctrl = null
  var timer = null
  try {
    ctrl = new AbortController()
    timer = setTimeout(function () { try { ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch(STATE_URL, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (data) {
      pingMiss = 0
      if (!data || !data.ok) { return }
      var fresh = Date.now() - Number(data.ts || 0) < 5 * 60 * 1000
      applyStatus(fresh && data.state ? String(data.state) : null)
    })
    .catch(function () {
      // The row may legitimately be absent (pet host disabled): back off to a
      // slow retry instead of hammering a dead route, but keep trying so the
      // pet still appears if the row is enabled later.
      pingMiss += 1
      if (pingMiss === 5 && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = setInterval(poll, 15000)
      } else if (pingMiss > 40 && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    })
    .finally(function () { if (timer) clearTimeout(timer) })
}

// ---------------------------------------------------------------------------
// Idle mood: doze off when nothing has happened for a while, greet the
// neighbour when the pet walks up to it.
// ---------------------------------------------------------------------------
function applyNeighbourMood(now) {
  if (state.working || state.dragging || state.mode === 'throw') return
  var nb = neighbourRect()
  if (!nb) return
  var cx = state.x + boxW() / 2
  var ny = nb.top + nb.height / 2
  var ownY = state.y + boxH() / 2
  var dx = Math.abs(cx - (nb.left + nb.width / 2))
  var dy = Math.abs(ownY - ny)
  if (dx < NEIGHBOUR_DIST + nb.width / 2 && dy < 140 && now > state.neighCool) {
    state.neighCool = now + NEIGHBOUR_COOLDOWN_MS
    state.facing = nb.left + nb.width / 2 >= cx ? 1 : -1
    say(pick(NEIGHBOUR_TEXTS))
    holdPose('wave', WAVE_POSE_MS)
  }
}
/**
 * Doze off where it stands.
 * @param greet - true for the menu action, which always says so; the automatic
 *   doze speaks only half the time.
 */
function sleep(greet) {
  state.sleeping = true
  // A walk ends here: a sleeping pet would otherwise drift along the band
  // wearing the sleeping pose.
  if (state.mode === 'walk') {
    state.targetX = null
    state.mode = 'idle'
    state.rushing = false
  }
  zzz.classList.add('dshlp-on')
  if (greet || Math.random() < 0.5) say(pick(SLEEP_TEXTS))
  save()
}

/**
 * Doze off once neither the Host nor the user has done anything for a while.
 *
 * The clock is the later of the two, so a running task keeps the pet awake by
 * itself and a user touch keeps it awake on its own. That is what stopped the
 * dozing pet from being caught mid-turn: any new state wakes it, and a turn can
 * no longer finish and be reported by a pet that is still asleep.
 */
function checkSleep() {
  if (state.sleeping || state.dragging || state.working) return
  if (state.mode === 'walk' || state.mode === 'throw') return
  if (Date.now() - Math.max(state.lastInput, state.lastTaskAt) < SLEEP_IDLE_MS) return
  sleep(false)
}
function onActivity() {
  state.lastInput = Date.now()
  if (state.sleeping) wake()
}

// ---------------------------------------------------------------------------
// Menu.
// ---------------------------------------------------------------------------
function buildMenu() {
  function item(label, fn, keepOpen) {
    var b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.addEventListener('click', function (e) {
      e.stopPropagation()
      fn(b)
      if (!keepOpen) closeMenu()
    })
    return b
  }
  menu.appendChild(item('对话', toggleSay))
  // The model row keeps the menu open: its whole purpose is to unfold the list
  // beside itself, and closing first would take the list with it.
  menu.appendChild(item('切换模型', function (row) { toggleModels(row) }, true))
  menu.appendChild(item('清空上下文', clearChat))
  menu.appendChild(item('大一点', function () { setScale(state.scale + STEP) }))
  menu.appendChild(item('小一点', function () { setScale(state.scale - STEP) }))
  menu.appendChild(item('回到角落', goHome))
  anchorButton = item(anchorLabel(), function () { setAnchored(!state.anchored) })
  menu.appendChild(anchorButton)
  menu.appendChild(item('睡一会儿', function () { sleep(true) }))
  menu.appendChild(modelMenu)
}

/** The one menu row that names the state it would switch to. */
function anchorLabel() { return state.anchored ? '自主移动' : '原地不动' }

/**
 * Turn the pet's own walking on or off.
 * @param v - true to stay put, false to roam again.
 */
function setAnchored(v) {
  state.anchored = !!v
  if (state.anchored) {
    // Only the pet's own legs are cancelled: a trip home the user asked for
    // keeps walking, and a drag in progress is untouched.
    if (state.mode === 'walk' && !state.rushing) endWalk()
  } else {
    // Roaming resumes shortly rather than after a full interval.
    state.nextRoamAt = performance.now() + rand(1200, 3000)
  }
  if (anchorButton) anchorButton.textContent = anchorLabel()
  save()
}

/**
 * Walk home to the near corner rather than appearing there.
 *
 * The trip is a walk like any other, so it keeps the obstacle handling and ends
 * at the band's own margin; only the pace differs, because it covers the whole
 * width instead of one roaming leg.
 */
function goHome() {
  if (state.dragging) return
  if (state.sleeping) wake(true)
  state.vx = 0
  state.vy = 0
  state.rushing = false
  state.y = groundTop()
  var home = minX()
  if (state.x - home < 2) {
    state.targetX = null
    state.mode = 'idle'
    save()
    return
  }
  state.targetX = home
  state.mode = 'walk'
  state.rushing = true
  state.facing = -1
  save()
}
function setScale(v) {
  state.scale = Math.round(clamp(v, MIN_SCALE, MAX_SCALE) * 100) / 100
  state.x = clamp(state.x, minX(), maxX())
  state.y = groundTop()
  save()
}
function openMenu() { menuOpen = true; menu.classList.add('dshlp-on') }
function closeMenu() { menuOpen = false; menu.classList.remove('dshlp-on') }

// ---------------------------------------------------------------------------
// Chat.
//
// Two pieces of furniture, both anchored over the pet: a translucent input that
// floats at the character's upper body, and the menu's sideways model pullout.
// The reply itself uses the pet's ordinary speech bubble, so a conversation and
// a status report look the same.
//
// It talks to the host half only: the renderer cannot reach the model service,
// and the two routes it calls are behind the shell's own request fence.
// ---------------------------------------------------------------------------
var sayOpen = false
var chatBusy = false
var chatAbort = null
var chatModels = []
var chatModelKey = ''
var chatTurns = []

/**
 * Nudge the floating input and the bubble back inside the viewport.
 *
 * Both are centred on the pet and the pet walks the whole band, so either can
 * hang off an edge when the character stands at one. Measured per frame rather
 * than on open alone, because a drag or a walk moves the anchor underneath it.
 */
function placeFloaters() {
  var vw = viewport().w
  var center = state.x + boxW() / 2
  function shiftFor(width) {
    var half = (width || 0) / 2
    if (center - half < CHAT_PAD) return CHAT_PAD - (center - half)
    if (center + half > vw - CHAT_PAD) return (vw - CHAT_PAD) - (center + half)
    return 0
  }
  if (sayOpen) {
    sayInput.style.setProperty('--dshlp-shift', Math.round(shiftFor(sayInput.offsetWidth || CHAT_WIDTH)) + 'px')
  }
  if (bubbleTimer) {
    bubble.style.setProperty('--dshlp-shift', Math.round(shiftFor(bubble.offsetWidth)) + 'px')
  }
}

/**
 * Parse one batch of complete SSE blocks.
 * @param text - whole event/data blocks, terminated by a blank line.
 * @param onEvent - called with the event name and its parsed payload.
 */
function chatParse(text, onEvent) {
  var blocks = text.split('\\n\\n')
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split('\\n')
    var name = ''
    var data = ''
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j]
      if (!line || line.charAt(0) === ':') continue
      if (line.indexOf('event:') === 0) name = line.slice(6).trim()
      else if (line.indexOf('data:') === 0) data += line.slice(5).trim()
    }
    if (!name || !data) continue
    try { onEvent(name, JSON.parse(data)) } catch (err) {}
  }
}

/** Rebuild the model pullout from the host, keeping the remembered choice when it still exists. */
function chatLoadModels() {
  return fetch(CHAT_MODELS_URL, { credentials: 'same-origin' }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }).then(function (data) {
    var offered = (data && data.models) || []
    chatModels = offered
    modelMenu.textContent = ''
    var keep = false
    for (var i = 0; i < offered.length; i++) {
      var item = offered[i]
      var key = item.provider + '|' + item.id
      if (key === chatModelKey) keep = true
      modelMenu.appendChild(modelButton(item, key))
    }
    if (!offered.length) {
      var empty = document.createElement('button')
      empty.type = 'button'
      empty.disabled = true
      empty.textContent = '没有可用模型'
      modelMenu.appendChild(empty)
      return 0
    }
    // A remembered model this deployment no longer offers falls back to the
    // first one rather than leaving the pullout on a dead value.
    chatModelKey = (keep && chatModelKey) || (offered[0].provider + '|' + offered[0].id)
    markPicked()
    return offered.length
  }).catch(function (err) {
    modelMenu.textContent = ''
    var failed = document.createElement('button')
    failed.type = 'button'
    failed.disabled = true
    failed.textContent = '拿不到模型'
    modelMenu.appendChild(failed)
    say('拿不到模型列表……非常抱歉', true)
    return 0
  })
}

/** One row of the model pullout. */
function modelButton(item, key) {
  var button = document.createElement('button')
  button.type = 'button'
  button.dataset.model = key
  button.textContent = item.name || item.id
  button.addEventListener('click', function (e) {
    e.stopPropagation()
    chatModelKey = key
    markPicked()
    save()
    closeMenu()
    say('好的，换成' + (item.name || item.id), false, 2200)
  })
  return button
}

/** Mark the row the next request will use. */
function markPicked() {
  var rows = modelMenu.children
  for (var i = 0; i < rows.length; i++) {
    var picked = rows[i].dataset && rows[i].dataset.model === chatModelKey
    if (picked) rows[i].classList.add('dshlp-picked')
    else rows[i].classList.remove('dshlp-picked')
  }
}

function chatTarget() {
  var parts = String(chatModelKey || '').split('|')
  return { provider: parts[0] || '', model: parts[1] || '' }
}

/** Drop the conversation. Nothing about it is durable, so this is the whole of it. */
function clearChat() {
  chatTurns = []
  if (chatAbort) {
    try { chatAbort.abort() } catch (err) {}
    chatAbort = null
  }
  say('好的，我这就忘掉', false, 2600)
}

function sendChat() {
  if (chatBusy) return
  var text = sayInput.value.trim()
  if (!text) return
  var target = chatTarget()
  if (!target.provider || !target.model) {
    say('还没有可用的模型', true)
    return
  }
  sayInput.value = ''
  chatTurns.push({ role: 'user', text: text })
  // The host trims this to its own history limit, so the page sends everything
  // it has and lets the one place that owns the bound enforce it.
  var payload = []
  for (var i = 0; i < chatTurns.length; i++) payload.push(chatTurns[i])

  chatBusy = true
  sayInput.classList.add('dshlp-busy')
  // The reply lands in the ordinary bubble, held open long enough to read: a
  // fixed 3.2 s is a status blip, not a sentence someone has to take in.
  say('……', false, CHAT_REPLY_MAX_MS)
  bubble.classList.add('dshlp-wide')

  var answer = ''
  var failed = false

  function onEvent(name, data) {
    if (name === 'delta' && data && typeof data.text === 'string') {
      answer += data.text
      say(answer, false, CHAT_REPLY_MAX_MS)
      return
    }
    if (name === 'failed') {
      failed = true
      say(String((data && data.message) || '模型调用失败'), true, CHAT_REPLY_MAX_MS)
    }
  }

  function settle() {
    chatBusy = false
    chatAbort = null
    sayInput.classList.remove('dshlp-busy')
    if (answer) {
      chatTurns.push({ role: 'assistant', text: answer })
      holdReply(answer)
    } else if (!failed) {
      bubble.classList.remove('dshlp-on')
    }
  }

  chatAbort = ('AbortController' in window) ? new AbortController() : null
  fetch(CHAT_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: target.provider, model: target.model, messages: payload }),
    signal: chatAbort ? chatAbort.signal : undefined
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (body) { throw new Error(body || ('HTTP ' + res.status)) })
    }
    // A browser without a streaming reader still gets a usable answer: the
    // whole body is buffered and parsed in one go.
    if (!res.body || !res.body.getReader) {
      return res.text().then(function (body) { chatParse(body, onEvent) })
    }
    var reader = res.body.getReader()
    var decoder = new TextDecoder()
    var buffer = ''
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          if (buffer) chatParse(buffer, onEvent)
          return
        }
        buffer += decoder.decode(result.value, { stream: true })
        // Only whole blocks are parsed, so a token split across two reads is
        // never mistaken for malformed JSON.
        var cut = buffer.lastIndexOf('\\n\\n')
        if (cut >= 0) {
          chatParse(buffer.slice(0, cut + 2), onEvent)
          buffer = buffer.slice(cut + 2)
        }
        return pump()
      })
    }
    return pump()
  }).catch(function (err) {
    if (err && err.name === 'AbortError') return
    failed = true
    say('出了点问题：' + String((err && err.message) || err), true, CHAT_REPLY_MAX_MS)
  }).then(settle)
}

/** Hold a finished reply for a length that follows how much there is to read. */
function holdReply(answer) {
  var ms = clamp(CHAT_REPLY_MIN_MS + answer.length * CHAT_REPLY_MS_PER_CHAR, CHAT_REPLY_MIN_MS, CHAT_REPLY_MAX_MS)
  // Re-stated from the accumulated answer rather than read back off the bubble:
  // a work-status blip can land between the last token and this call.
  say(answer, false, ms)
}

function openSay() {
  if (sayOpen) {
    try { sayInput.focus() } catch (err) {}
    return
  }
  sayOpen = true
  sayInput.classList.add('dshlp-on')
  // Typing to someone who is asleep reads as talking to furniture.
  if (state.sleeping) wake(true)
  placeFloaters()
  try { sayInput.focus() } catch (err) {}
  if (!chatModels.length) chatLoadModels()
}

function closeSay() {
  if (!sayOpen) return
  sayOpen = false
  sayInput.classList.remove('dshlp-on')
  sayInput.blur()
}

function toggleSay() { if (sayOpen) closeSay(); else openSay() }

/** Pull the model list out sideways, flipping it when the pet is near the edge. */
function toggleModels(row) {
  if (modelMenu.classList.contains('dshlp-on')) {
    modelMenu.classList.remove('dshlp-on')
    return
  }
  if (!chatModels.length) chatLoadModels()
  modelMenu.style.top = (row.offsetTop || 0) + 'px'
  modelMenu.classList.add('dshlp-on')
  // Measured after showing: a hidden element reports no width.
  modelMenu.classList.toggle('dshlp-flip', menu.getBoundingClientRect().right + modelMenu.offsetWidth + 6 > viewport().w)
}

sayInput.addEventListener('keydown', function (e) {
  e.stopPropagation()
  if (e.key === 'Enter') {
    e.preventDefault()
    sendChat()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeSay()
  }
})
// The pet's own drag and menu handlers listen on the root, so interaction with
// the input must not reach them.
sayInput.addEventListener('pointerdown', function (e) { e.stopPropagation() })
sayInput.addEventListener('contextmenu', function (e) {
  e.preventDefault()
  e.stopPropagation()
})
// A click anywhere else puts the input away, so it never has to be dismissed
// twice. Two places are exempt: the input itself, and the menu — the menu owns
// the row that toggles it, and closing here would make that row reopen the
// input on the same gesture instead of closing it.
document.addEventListener('pointerdown', function (e) {
  if (!sayOpen) return
  if (menu.contains(e.target) || sayInput.contains(e.target)) return
  closeSay()
}, true)


root.addEventListener('pointerdown', onDown)
root.addEventListener('pointermove', onMove)
root.addEventListener('pointerup', onUp)
root.addEventListener('pointercancel', onUp)
root.addEventListener('contextmenu', function (e) {
  e.preventDefault()
  e.stopPropagation()
  if (menuOpen) closeMenu(); else openMenu()
})
document.addEventListener('pointerdown', function (e) {
  if (menuOpen && !root.contains(e.target)) closeMenu()
}, true)
document.addEventListener('visibilitychange', function () {
  state.hidden = !!document.hidden
  if (!state.hidden) lastFrame = 0
})
window.addEventListener('resize', function () {
  state.x = clamp(state.x, minX(), maxX())
  state.y = groundTop()
})
window.addEventListener('pointerdown', onActivity, true)
window.addEventListener('keydown', onActivity, true)

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
buildMenu()
var stored = load()
if (stored) {
  if (typeof stored.scale === 'number') state.scale = clamp(stored.scale, MIN_SCALE, MAX_SCALE)
  if (typeof stored.fx === 'number' && isFinite(stored.fx)) state.x = clamp(stored.fx * viewport().w, 0, 1e6)
  else if (stored.edge === 'right') state.x = 1e6
  state.sleeping = stored.sleeping === true
  // "Stay put" outlives a reload like the doze state does, so the menu row has
  // to be re-labelled for the state it was restored into.
  state.anchored = stored.anchored === true
  // The chosen model outlives a reload: switching is a preference, not a
  // per-conversation choice.
  if (typeof stored.chatModel === 'string') chatModelKey = stored.chatModel
}
if (anchorButton) anchorButton.textContent = anchorLabel()
state.y = groundTop()
state.x = clamp(state.x, minX(), maxX())
state.nextRoamAt = performance.now() + rand(2400, 6000)
if (state.sleeping) zzz.classList.add('dshlp-on')
// The default pose is requested up front so the character is there on the first
// frame; every other pose is fetched the first time its mood comes up, and the
// swap waits for the file instead of blanking the character.
shownArt = IDLE_ART
artReady[IDLE_ART] = true
img.src = artSrc(IDLE_ART)
render(performance.now())
raf = requestAnimationFrame(frame)
poll()
pollTimer = setInterval(poll, POLL_MS)
setInterval(checkSleep, 5000)

window.addEventListener('beforeunload', function () {
  // The conversation is page state and is never written anywhere, so closing the
  // window already ends it. Dropping it here says so out loud rather than
  // leaving the answer to be inferred from the absence of any persistence.
  chatTurns = []
  if (raf) cancelAnimationFrame(raf)
  if (pollTimer) clearInterval(pollTimer)
})
})()`

/**
 * The current work-status snapshot the page polls.
 *
 * `ts` is the wall-clock time of the last transition, so the page can drop a
 * snapshot whose turn died without an end event.
 */
let snapshot = { state: null, task: null, ts: Date.now(), seq: 0 }

/**
 * Map a turn end reason to the state it leaves behind.
 * @param kind - `TurnEndReason['kind']`.
 * @returns the state, or null when the turn simply ended.
 */
function turnEndState(kind) {
  if (kind === 'completed') return 'success'
  if (kind === 'error' || kind === 'max-tokens') return 'error'
  if (kind === 'blocked') return 'waiting'
  // aborted / interrupted / forked: the turn is over, so the pet must not stay
  // pinned in a busy state — this is the state a killed turn used to leave
  // behind forever.
  return null
}

/**
 * Record one transition.
 * @param next - the new state, or null for idle.
 * @param task - the tool name the state belongs to, when it has one.
 */
function commit(next, task) {
  snapshot = { state: next, task: task ?? null, ts: Date.now(), seq: snapshot.seq + 1 }
}

/**
 * Reduce one session event to a work status.
 * @param event - the appended session event.
 */
function observe(event) {
  const data = event.data ?? {}
  switch (event.type) {
    case 'turn/start':
      commit('thinking', null)
      return
    case 'tool/call': {
      const name = typeof data.name === 'string' ? data.name : null
      commit(name === USER_QUESTION_TOOL ? 'waiting' : 'working', name)
      return
    }
    case 'tool/result':
      commit('result', null)
      return
    case 'approval/asked':
      commit('waiting', typeof data.toolName === 'string' ? data.toolName : null)
      return
    case 'turn/end':
      commit(turnEndState(data.reason?.kind), null)
      return
    default:
      return
  }
}

/**
 * Register the pet's routes and its status feed.
 * @param ctx - the plugin fiber's Host context.
 */
export default {
  name: 'luna-pet',
  inject: ['webServer'],
  apply(ctx) {
    const art = new Map()

    /** Read one artwork file, or null when it is not there. */
    function readArt(file) {
      try {
        const bytes = fs.readFileSync(file)
        return bytes && bytes.length > 0 ? bytes : null
      } catch (err) {
        // A missing candidate is the expected path: the per-pose set is local
        // and the published package carries none of it.
        return null
      }
    }

    /** The bytes of one pose, cached; the single sheet answers for every pose. */
    function loadArt(id) {
      const cached = art.get(id)
      if (cached) return cached
      let loaded = null
      for (const dir of ART_DIRS) {
        for (const ext of ART_EXTS) {
          const bytes = readArt(path.join(dir, id + ext))
          if (bytes) {
            loaded = { bytes, type: MIME_BY_EXT[ext] || 'application/octet-stream' }
            break
          }
        }
        if (loaded) break
      }
      if (!loaded) {
        for (const file of SINGLE_IMAGE_CANDIDATES) {
          const bytes = readArt(file)
          if (bytes) {
            loaded = { bytes, type: MIME_BY_EXT[path.extname(file).toLowerCase()] || 'application/octet-stream' }
            break
          }
        }
      }
      if (!loaded) throw new Error('pet artwork not found')
      art.set(id, loaded)
      return loaded
    }

    const disposers = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/pet.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(PET_JS)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/pet-image.png',
      handler: (req, res) => {
        try {
          const loaded = loadArt(requestedArt(req.url))
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
          res.end('pet artwork unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/state.json',
      handler: (req, res) => {
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify({
          ok: true,
          state: snapshot.state,
          task: snapshot.task,
          ts: snapshot.ts,
          seq: snapshot.seq,
          known: WORK_STATES,
          staleMs: STALE_MS,
        }))
      },
    }))

    // -----------------------------------------------------------------------
    // Chat.
    //
    // The page runs in the renderer and cannot reach `ctx.llm`; the model list
    // and the reply stream are therefore two more host routes rather than page
    // work. Both go through `admitted()` because a route on the web server is
    // outside the fence the shell puts around `/` and `/api`.
    // -----------------------------------------------------------------------

    /** Answer one rejected request with a short plain-text reason. */
    function refuse(res, status, reason) {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end('chat unavailable: ' + reason)
    }

    /**
     * Read the chat persona.
     *
     * Re-read per request rather than cached at load: it is a few kilobytes, and
     * reading it fresh lets the wording be tuned between two messages, which is
     * the whole point of iterating on a voice.
     * @returns the persona text, or an empty string when neither candidate exists.
     */
    function readPersona() {
      for (const file of PERSONA_CANDIDATES) {
        try {
          const text = fs.readFileSync(file, 'utf8').trim()
          if (text) return text
        } catch (err) {
          // A missing candidate is the expected path: the profile copy and the
          // packaged copy are alternatives, never both required.
        }
      }
      return ''
    }

    /**
     * Apply the shell's own request fence to one chat request.
     *
     * The connection service owns both the Host/Origin fence and the browser
     * credential, and it is what makes `/` answer 401 to an unauthenticated
     * caller. When it is absent this route refuses to serve rather than
     * spending the user's credit for anyone who can reach the loopback port.
     * @param req - the request to judge.
     * @param res - the response to reject on.
     * @returns true when the caller may proceed.
     */
    function admitted(req, res) {
      const connection = ctx.get('connection')
      if (connection === undefined) {
        refuse(res, 503, 'the connection service is not loaded, so callers cannot be authenticated')
        return false
      }
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined) {
        refuse(res, rejection, rejection === 401 ? 'authentication required' : 'untrusted request origin')
        return false
      }
      return true
    }

    /**
     * Read and parse one JSON request body.
     * @param req - the request to drain.
     * @returns the parsed value, or null when the body is absent, oversized, or not JSON.
     */
    function readJson(req) {
      return new Promise(resolve => {
        const parts = []
        let size = 0
        let settled = false
        const finish = value => {
          if (settled) return
          settled = true
          resolve(value)
        }
        req.on('data', part => {
          if (settled) return
          size += part.length
          if (size > CHAT_BODY_LIMIT) {
            finish(null)
            return
          }
          parts.push(part)
        })
        req.on('error', () => finish(null))
        req.on('end', () => {
          try {
            finish(JSON.parse(Buffer.concat(parts).toString('utf8')))
          } catch (err) {
            // A body that is not JSON is a caller error, not a server fault.
            finish(null)
          }
        })
      })
    }

    /**
     * Convert the page's conversation into request messages.
     *
     * The two roles take different types: a user turn is a one-shot input and
     * carries no identity, while an assistant turn is a durable message and
     * must name both its id and the route that produced it.
     * @param raw - the `messages` field sent by the page.
     * @param provider - provider route answering this request.
     * @param model - model answering this request.
     * @returns the request messages, oldest first.
     */
    function toMessages(raw, provider, model) {
      const out = []
      for (const turn of raw.slice(-CHAT_HISTORY_LIMIT)) {
        if (turn === null || typeof turn !== 'object') continue
        const text = typeof turn.text === 'string' ? turn.text.trim() : ''
        if (!text) continue
        if (turn.role === 'assistant') {
          out.push({
            role: 'assistant',
            id: `luna-pet-${out.length}-${Date.now().toString(36)}`,
            content: [{ type: 'text', text }],
            source: { kind: 'model', provider, model },
          })
        } else {
          out.push({ role: 'user', content: [{ type: 'text', text }] })
        }
      }
      return out
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/chat-models.json',
      handler: async (req, res) => {
        if (!admitted(req, res)) return
        const llm = ctx.get('llm')
        if (llm === undefined) {
          refuse(res, 503, 'the llm service is not loaded')
          return
        }
        try {
          const models = []
          for (const provider of llm.listProviders()) {
            for (const model of await llm.listModels(provider.id)) {
              models.push({ provider: model.provider, id: model.id, name: model.name })
            }
          }
          res.writeHead(200, CHAT_JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, models }))
        } catch (err) {
          res.writeHead(500, CHAT_JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/chat',
      handler: async (req, res) => {
        if (!admitted(req, res)) return
        if (req.method !== 'POST') {
          res.writeHead(405, { ...CHAT_JSON_HEADERS, Allow: 'POST' })
          res.end(JSON.stringify({ ok: false, error: 'use POST' }))
          return
        }
        const llm = ctx.get('llm')
        if (llm === undefined) {
          refuse(res, 503, 'the llm service is not loaded')
          return
        }
        const persona = readPersona()
        if (!persona) {
          refuse(res, 503, `no persona file; expected one of ${PERSONA_CANDIDATES.join(' , ')}`)
          return
        }

        const body = await readJson(req)
        if (body === null || typeof body !== 'object') {
          res.writeHead(400, CHAT_JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: 'body must be a JSON object' }))
          return
        }
        const provider = typeof body.provider === 'string' ? body.provider : ''
        const model = typeof body.model === 'string' ? body.model : ''
        const messages = toMessages(Array.isArray(body.messages) ? body.messages : [], provider, model)
        if (!provider || !model || messages.length === 0) {
          res.writeHead(400, CHAT_JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: 'provider, model and at least one non-empty message are required' }))
          return
        }

        // Closing the window must stop the spend, so a dropped request aborts
        // the model call instead of merely going unread.
        const controller = new AbortController()
        req.on('close', () => controller.abort())

        res.writeHead(200, SSE_HEADERS)
        // An opening comment flushes the head so the page's reader starts now
        // rather than when the first token lands.
        res.write(': open\n\n')
        const emit = (event, data) => {
          if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }

        try {
          let chars = 0
          let finish = null
          for await (const chunk of llm.stream({
            provider,
            model,
            system: persona,
            messages,
            // Never the adapter default: see CHAT_REASONING_EFFORT.
            reasoningEffort: CHAT_REASONING_EFFORT,
            maxTokens: CHAT_MAX_TOKENS,
            signal: controller.signal,
          })) {
            if (chunk.type === 'text-delta') {
              chars += chunk.text.length
              emit('delta', { text: chunk.text })
            } else if (chunk.type === 'finish') {
              const reason = chunk.reason
              finish = reason && reason.kind ? reason.kind : null
              // An adapter failure arrives as a finish reason, not a throw.
              if (finish === 'error') {
                const failure = reason.failure
                emit('failed', { message: (failure && failure.message) || 'the model call failed' })
              }
            }
          }
          emit('done', { finish, chars })
        } catch (err) {
          emit('failed', { message: String((err && err.message) || err) })
        } finally {
          if (!res.writableEnded) res.end()
        }
      },
    }))

    // The feed is post-commit and fire-and-forget: an observer failure is
    // contained by the emitter, but a throw here would still be noise on every
    // append, so the reduction stays total over the event tags it knows.
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        observe(event)
      } catch (err) {
        console.error('[luna-pet] status reduction failed', err)
      }
    }), 'luna-pet: work-status feed')

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
  },
}
