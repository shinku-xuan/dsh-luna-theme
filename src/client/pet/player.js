/**
 * Keep caller cancellation and pet teardown attached through response-body streaming.
 * @param owner - signal aborted when the pet is disposed.
 * @returns fetch with caller and owner cancellation composed by the platform.
 */
export function createPetFetch(owner) {
  return function petFetch(url, options) {
    const signals = options?.signal ? [owner, options.signal] : [owner]
    return fetch(url, { ...options, signal: AbortSignal.any(signals) })
  }
}

/**
 * Play approved Cubism renders from small atlas pages. The current and next
 * pages are decoded on demand; at most three decoded pages stay resident.
 * Page failures retry after 0.5 and 1 second, then every 30 seconds while needed.
 * Missing pages pause timed playback; three failures permit artwork fallback.
 * Prefetch failures never disable a page that is already available.
 * No Cubism SDK or model ticker runs in the pet's client.
 * @param options - canvas, same-origin resource URLs, optional fallback artwork targets and readiness callback.
 * @returns a renderer and an idempotent disposer that aborts loading and closes bitmaps.
 */
export function createPetAnimationPlayer({ canvas, manifestUrl, imageUrl, onReady = () => {}, outlineTargets = [canvas] }) {
  const context = canvas.getContext('2d')
  const releaseOutline = installOutline()
  const resident = new Map()
  const pending = new Map()
  const failures = new Map()
  const warned = new Set()
  const controller = new AbortController()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let manifest = null
  let disposed = false
  let desired = new Set()
  let activeKey = null
  let activeTrigger = null
  let started = 0
  let stalledAt = null
  let lastPaint = null
  let hiddenAt = document.hidden ? performance.now() : null

  /** Normalize an existing pale outer rim and apply one white contour before the shadow. */
  function installOutline() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const id = 'luna-pet-outline-' + crypto.randomUUID()
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.dataset.lunaPetOutline = ''
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    svg.innerHTML = `<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius="1.92" result="interior" data-rim-strip=""/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  12 12 12 0 -31" result="palePixels"/>
      <feComposite in="palePixels" in2="interior" operator="out" result="oldRim"/>
      <feComposite in="SourceGraphic" in2="oldRim" operator="out" result="art"/>
      <feMorphology in="art" operator="dilate" radius="1.2" result="expanded" data-white-stroke=""/>
      <feFlood flood-color="#ffffff" result="white"/>
      <feComposite in="white" in2="expanded" operator="in" result="outline"/>
      <feMerge><feMergeNode in="outline"/><feMergeNode in="art"/></feMerge>
    </filter></defs>`
    document.body.append(svg)
    const originals = outlineTargets.map(target => [target, target.style.filter])
    for (const target of outlineTargets) target.style.filter = 'url(#' + id + ') drop-shadow(0 3px 5px rgba(40,32,64,.22))'
    const reference = canvas.parentElement
    const observer = new ResizeObserver(entries => {
      const height = entries[0].contentRect.height
      if (height <= 0) return
      const scale = height / 350
      svg.querySelector('[data-rim-strip]').setAttribute('radius', String(4 * scale))
      svg.querySelector('[data-white-stroke]').setAttribute('radius', String(2.5 * scale))
    })
    observer.observe(reference)
    return () => {
      observer.disconnect()
      for (const [target, filter] of originals) target.style.filter = filter
      svg.remove()
    }
  }

  function report(key, error, message = 'Live2D animation unavailable; retaining artwork') {
    if (warned.has(key)) return
    warned.add(key)
    console.warn('[luna-pet] ' + message, key, error)
  }

  const manifestTimer = setTimeout(() => controller.abort(), 8000)
  const ready = (async () => {
    if (!context || typeof createImageBitmap !== 'function') throw new Error('Canvas bitmap decoding unavailable')
    const response = await fetch(manifestUrl, { signal: controller.signal })
    if (!response.ok) throw new Error('Animation manifest HTTP ' + response.status)
    const data = await response.json()
    if (data.version !== 1 || data.cellWidth !== 400 || data.cellHeight !== 520 || data.columns !== 4 ||
      data.framesPerPage !== 12 || data.bodyHeight !== 350 || data.baseline !== 500 || data.fps !== 30 ||
      !data.actions || typeof data.actions !== 'object' || Array.isArray(data.actions)) throw new Error('Invalid animation manifest')
    for (const [id, action] of Object.entries(data.actions)) {
      if (!/^[a-z]+(?:-[a-z]+)*$/.test(id) || !Number.isInteger(action.frames) || action.frames < 1 ||
        action.frames > 360 || !Array.isArray(action.pages) || action.pages.length !== Math.ceil(action.frames / 12) ||
        action.pages.some(page => !/^[a-z0-9-]+$/.test(page.id))) throw new Error('Invalid animation ' + id)
      if (action.distance && (!Number.isFinite(action.stride) || action.stride <= 0 || !Array.isArray(action.distanceSamples) ||
        action.distanceSamples.length !== action.frames || action.distanceSamples.some((value, index) => !Number.isFinite(value) ||
          value < 0 || value >= 1 || index > 0 && value < action.distanceSamples[index - 1]))) throw new Error('Invalid walking distance samples')
    }
    if (disposed) return
    manifest = data
    canvas.width = data.cellWidth
    canvas.height = data.cellHeight
    canvas.style.height = data.cellHeight / data.bodyHeight * 100 + '%'
    canvas.style.width = 'calc(var(--dshlp-h) * var(--dshlp-scale) * ' + data.cellWidth / data.bodyHeight + ')'
    canvas.style.bottom = 'calc(var(--dshlp-h) * var(--dshlp-scale) * ' + -(data.cellHeight - data.baseline) / data.bodyHeight + ')'
    onReady()
  })().catch(error => { if (!disposed) report('manifest', error) }).finally(() => clearTimeout(manifestTimer))

  function trim() {
    while (resident.size > 3) {
      const id = resident.keys().next().value
      resident.get(id).close()
      resident.delete(id)
    }
  }

  function loadPage(id, key) {
    if (resident.has(id) || pending.has(id) || disposed) return
    const failure = failures.get(id)
    if (failure && performance.now() < failure.retryAt) return
    const abort = new AbortController()
    const item = { abort }
    const timer = setTimeout(() => abort.abort(), 8000)
    pending.set(id, item)
    ;(async () => {
      const url = new URL(imageUrl, document.baseURI)
      url.searchParams.set('id', id)
      const response = await fetch(url, { signal: abort.signal })
      if (!response.ok) throw new Error('Animation page HTTP ' + response.status)
      const bitmap = await createImageBitmap(await response.blob())
      if (disposed || abort.signal.aborted || !desired.has(id)) { bitmap.close(); return }
      if (bitmap.width !== 1600 || bitmap.height !== 1560) { bitmap.close(); throw new Error('Invalid animation page dimensions') }
      resident.set(id, bitmap)
      if (failures.delete(id)) {
        warned.delete('page:' + id)
        warned.delete('cooldown:' + id)
        console.info('[luna-pet] Live2D animation page recovered', id)
      }
      trim()
    })().catch(error => {
      if (disposed || item.cancelled || !desired.has(id)) return
      const attempts = Math.min(3, (failures.get(id)?.attempts ?? 0) + 1)
      const delay = attempts === 1 ? 500 : attempts === 2 ? 1000 : 30000
      failures.set(id, { key, attempts, retryAt: performance.now() + delay })
      report('page:' + id, error, 'Live2D animation page unavailable; retrying')
      if (attempts === 3) report('cooldown:' + id, error, 'Live2D animation page unavailable; retrying every 30 seconds while needed')
    }).finally(() => {
      clearTimeout(timer)
      if (pending.get(id) === item) pending.delete(id)
    })
  }

  /** Draw one authored pose; retain the last picture until the next page is ready. */
  function render({ pose, now, walkPhase = 0, facing = 1, trigger = null }) {
    if (disposed || !manifest) return false
    const key = pose === 'walk-a' ? 'walk-a-' + (facing < 0 ? 'left' : 'right') : pose
    const action = manifest.actions[key]
    if (!action) { canvas.style.display = 'none'; return false }
    if (activeKey !== key || activeTrigger !== trigger) {
      activeKey = key
      activeTrigger = trigger
      started = trigger === null ? now : trigger
      stalledAt = null
    }
    const elapsed = Math.max(0, (stalledAt ?? now) - started)
    let distanceFrame = 0
    if (action.distance) {
      while (distanceFrame + 1 < action.frames && action.distanceSamples[distanceFrame + 1] <= walkPhase) distanceFrame++
    }
    const frame = reduced.matches ? 0 : action.distance ? distanceFrame
      : action.once ? Math.min(action.frames - 1, Math.floor(elapsed * manifest.fps / 1000))
        : Math.floor(elapsed * manifest.fps / 1000) % action.frames
    const index = Math.floor(frame / manifest.framesPerPage)
    const page = action.pages[index]
    const next = action.pages[(index + 1) % action.pages.length]
    desired = new Set(reduced.matches ? [page.id] : [page.id, next.id])
    for (const [id, item] of pending) if (!desired.has(id)) { item.cancelled = true; item.abort.abort() }
    if (!document.hidden) {
      loadPage(page.id, key)
      if (!reduced.matches) loadPage(next.id, key)
    }
    const bitmap = resident.get(page.id)
    if (!bitmap) {
      if (stalledAt === null) stalledAt = now
      if ((failures.get(page.id)?.attempts ?? 0) >= 3) { canvas.style.display = 'none'; return false }
      if (lastPaint) canvas.style.display = 'block'
      return lastPaint !== null
    }
    if (stalledAt !== null) { started += now - stalledAt; stalledAt = null }
    resident.delete(page.id)
    resident.set(page.id, bitmap)
    if (lastPaint !== key + ':' + frame) {
      const slot = frame % manifest.framesPerPage
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, slot % manifest.columns * manifest.cellWidth, Math.floor(slot / manifest.columns) * manifest.cellHeight,
        manifest.cellWidth, manifest.cellHeight, 0, 0, canvas.width, canvas.height)
      lastPaint = key + ':' + frame
      canvas.dataset.pose = key
      canvas.dataset.frame = String(frame)
    }
    canvas.style.display = 'block'
    return true
  }

  function visibility() {
    const now = performance.now()
    if (document.hidden) {
      hiddenAt = now
      for (const item of pending.values()) { item.cancelled = true; item.abort.abort() }
    } else if (hiddenAt !== null) {
      const duration = now - hiddenAt
      started += duration
      if (stalledAt !== null) stalledAt += duration
      hiddenAt = null
    }
  }
  document.addEventListener('visibilitychange', visibility)

  return {
    ready,
    render,
    hasPose(pose) { return !!manifest && !!manifest.actions[pose === 'walk-a' ? 'walk-a-right' : pose] },
    strideFor(height) { return manifest ? manifest.actions['walk-a-right']?.stride * height / manifest.bodyHeight : null },
    getStats() {
      return { residentPages: resident.size, pendingPages: pending.size, displayed: lastPaint,
        failed: [...new Set([...failures.values()].filter(failure => failure.attempts >= 3).map(failure => failure.key))],
        retryPages: failures.size }
    },
    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      clearTimeout(manifestTimer)
      for (const item of pending.values()) item.abort.abort()
      pending.clear()
      failures.clear()
      for (const bitmap of resident.values()) bitmap.close()
      resident.clear()
      document.removeEventListener('visibilitychange', visibility)
      releaseOutline()
      canvas.style.display = 'none'
      context?.clearRect(0, 0, canvas.width, canvas.height)
    },
  }
}
