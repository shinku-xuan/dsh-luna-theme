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
import { PET_JS } from '../client/pet/script.js'
import { loadPetAnimationAssets, findPetArtOverrides } from './pet-animation-assets.js'

/** Package root containing the artwork and persona files. */
const PLUGIN_DIR = fileURLToPath(new URL('../../', import.meta.url))

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
  'walk-cycle',
  'sleep',
  'drag',
  'thinking',
  'working',
  'waiting',
  'happy',
  'sad',
  'wave',
  'surprise',
  'idle-cycle',
  'sleep-cycle',
  'drag-cycle',
  'thinking-cycle',
  'working-cycle',
  'waiting-cycle',
  'happy-cycle',
  'sad-cycle',
  'wave-cycle',
  'surprise-cycle',
  'fall',
  'fall-cycle',
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
    let animation = null
    try {
      animation = loadPetAnimationAssets(path.join(PLUGIN_DIR, 'assets', 'pet-live2d'))
    } catch (error) {
      console.warn('[luna-pet] Live2D frames unavailable; using existing artwork', error)
    }
    const overridden = findPetArtOverrides(ART_IDS.filter(id => !id.endsWith('-cycle')), ART_DIRS.slice(0, -1),
      path.join(PLUGIN_DIR, 'assets', 'pet-art'), ART_EXTS)

    /** Read one artwork file, or null when it is not there. */
    function readArt(file) {
      try {
        const bytes = fs.readFileSync(file)
        return bytes && bytes.length > 0 ? bytes : null
      } catch (err) {
        // A profile may supply only some poses; absent overrides use packaged art.
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
      // A motion sheet cannot use a single-pose fallback: eight cells would crop
      // that pose into fragments. The page retains the matching static pose.
      if (!loaded && !id.endsWith('-cycle')) {
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
      path: '/dsh-luna-pet/live2d.json',
      handler: (req, res) => {
        res.writeHead(animation ? 200 : 404, JSON_HEADERS)
        res.end(JSON.stringify(animation ? animation.manifestFor(overridden) : { ok: false, reason: 'animation-unavailable' }))
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-luna-pet/live2d-image.webp',
      handler: (req, res) => {
        try {
          const id = new URL(req.url || '/', 'http://localhost').searchParams.get('id')
          const bytes = animation && id ? animation.readPage(id) : null
          if (!bytes) { res.writeHead(404); res.end(); return }
          res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length), 'Cache-Control': 'public, max-age=31536000, immutable' })
          res.end(bytes)
        } catch (error) {
          console.warn('[luna-pet] Live2D page unavailable; retaining artwork', error)
          res.writeHead(404)
          res.end()
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
