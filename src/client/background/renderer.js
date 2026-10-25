/** PNG/MP4 background scenes with bounded overlap during crossfades. */
import { createBackgroundRotation, orderedBackgrounds } from './playback.js'

/**
 * Own the background DOM, two media scenes, transition animations and rotation.
 * The outgoing scene remains visible until the incoming image or video is ready.
 * @param catalog Numerically ordered resources and presentation defaults.
 * @param onState Reports media failures and system reduced-motion preference.
 * @returns Mount, accepted-preference application, and retry actions.
 */
export function createBackgroundRenderer(catalog, onState) {
  const entries = orderedBackgrounds(catalog.backgrounds)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const layer = document.createElement('div')
  layer.setAttribute('data-luna-ambient', '')
  layer.setAttribute('data-luna-background', '')
  layer.setAttribute('aria-hidden', 'true')
  const scrim = document.createElement('div')
  scrim.className = 'luna-bg-scrim'
  layer.append(scrim)
  let active = false
  let values = null
  let ready = false
  let current = null
  let incoming = null
  let outgoing = null
  let requestedKey = ''
  const rotation = createBackgroundRotation(entries.map(item => item.id), () => render())
  const state = patch => { if (active) onState(patch) }
  const url = (item, extension) => new URL(`dsh-luna/backgrounds/${item.id}.${extension}?v=${item.revision}`, document.baseURI).href
  const animate = (scene, to, duration, done) => {
    const from = Number(getComputedStyle(scene.node).opacity)
    scene.animation?.cancel()
    scene.node.style.opacity = String(from)
    if (duration === 0) { scene.node.style.opacity = String(to); done?.(); return }
    const animation = scene.node.animate([{ opacity: from }, { opacity: to }], { duration, easing: 'ease-in-out', fill: 'forwards' })
    scene.animation = animation
    animation.onfinish = () => {
      if (!scene.alive || scene.animation !== animation) return
      scene.node.style.opacity = String(to)
      scene.animation = null
      animation.onfinish = null
      animation.cancel()
      done?.()
    }
  }
  const settle = () => {
    outgoing?.dispose(); outgoing = null
    if (current !== null) {
      current.animation?.cancel(); current.animation = null
      current.node.style.opacity = '1'
    }
  }
  const reveal = scene => {
    if (!active || incoming !== scene || !scene.alive) return
    incoming = null
    outgoing = current
    current = scene
    layer.setAttribute('data-current-background', scene.item.id)
    scene.node.setAttribute('data-scene-state', 'current')
    const duration = outgoing === null || motion.matches || document.hidden ? 0 : values.transitionMilliseconds
    if (outgoing !== null) {
      const previous = outgoing
      previous.node.setAttribute('data-scene-state', 'outgoing')
      animate(previous, 0, duration, () => { previous.dispose(); if (outgoing === previous) outgoing = null })
    }
    animate(scene, 1, duration)
  }
  const makeScene = (item, animated, key) => {
    const node = document.createElement('div')
    node.className = 'luna-bg-scene'
    node.setAttribute('data-background-id', item.id)
    node.setAttribute('data-scene-state', 'loading')
    node.style.opacity = '0'
    const fill = document.createElement('div')
    fill.className = 'luna-bg-fill'
    fill.style.backgroundImage = `url("${url(item, 'png')}")`
    const picture = document.createElement('div')
    picture.className = 'luna-bg-picture'
    picture.style.filter = `blur(${values.blur}px)`
    const poster = document.createElement('img')
    poster.alt = ''; poster.draggable = false; poster.className = 'luna-bg-media'
    picture.append(poster); node.append(fill, picture); layer.insertBefore(node, scrim)
    const removers = []
    const listen = (target, event, listener) => { target.addEventListener(event, listener); removers.push(() => target.removeEventListener(event, listener)) }
    let attempt = 0
    let played = false
    let posterReady = false
    let posterFailed = false
    let videoFailed = false
    let video = null
    const scene = {
      node, picture, item, animation: null, alive: true,
      play() {
        if (!scene.alive || video === null || document.hidden || played) return
        const currentVideo = video
        const ticket = ++attempt
        played = true
        void currentVideo.play().catch(error => {
          if (!scene.alive || video !== currentVideo || ticket !== attempt) return
          videoFailed = true; played = false; currentVideo.style.opacity = '0'
          report({ mediaError: 'videoError' })
          if (posterReady) reveal(scene)
        })
      },
      pause() { ++attempt; played = false; video?.pause() },
      removeVideo() {
        ++attempt; played = false
        if (video !== null) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); video = null }
      },
      dispose() {
        if (!scene.alive) return
        scene.alive = false
        scene.animation?.cancel(); scene.animation = null
        for (const remove of removers) remove()
        scene.removeVideo(); poster.removeAttribute('src'); node.remove()
      },
    }
    const report = patch => {
      if (incoming === scene || (current === scene && incoming === null && requestedKey === key)) state(patch)
    }
    listen(poster, 'load', () => { posterReady = true; reveal(scene) })
    listen(poster, 'error', () => {
      posterFailed = true; report({ mediaError: 'posterError' })
      if (!animated || videoFailed) { if (incoming === scene) incoming = null; scene.dispose() }
    })
    if (animated) {
      video = document.createElement('video')
      video.className = 'luna-bg-media'; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'
      video.style.opacity = '0'
      const currentVideo = video
      listen(currentVideo, 'playing', () => {
        if (!scene.alive || document.hidden || video !== currentVideo) return
        currentVideo.style.opacity = '1'
        report({ mediaError: posterFailed ? 'posterError' : null })
        reveal(scene)
      })
      listen(currentVideo, 'error', () => {
        if (!scene.alive || video !== currentVideo) return
        videoFailed = true; played = false; currentVideo.style.opacity = '0'
        report({ mediaError: 'videoError' })
        if (posterReady) reveal(scene)
        else if (posterFailed) { if (incoming === scene) incoming = null; scene.dispose() }
      })
      currentVideo.src = url(item, 'mp4'); picture.append(currentVideo)
    }
    poster.src = url(item, 'png')
    return scene
  }
  const render = () => {
    if (!active || values === null) return
    const id = rotation.update({ mode: values.backgroundMode, seconds: values.rotationSeconds, fixedId: values.backgroundId,
      paused: !ready || document.hidden || values.transparency >= 100 })
    const item = entries.find(item => item.id === id)
    const reduced = motion.matches
    state({ reduced })
    layer.style.opacity = String(1 - values.transparency / 100)
    scrim.style.opacity = String(values.mask / 100)
    for (const scene of [current, incoming, outgoing]) if (scene !== null) scene.picture.style.filter = `blur(${values.blur}px)`
    if (!item || !ready) return
    const animated = Boolean(item.video) && values.animated && !reduced && values.transparency < 100
    if (!animated) for (const scene of [current, incoming, outgoing]) scene?.removeVideo()
    const key = `${id}:${animated}:${item.revision}`
    if (key !== requestedKey) {
      requestedKey = key
      incoming?.dispose(); incoming = null
      settle()
      state({ mediaError: null })
      incoming = makeScene(item, animated, key)
    }
    for (const scene of [current, incoming, outgoing]) if (document.hidden) scene?.pause(); else scene?.play()
  }
  const visibility = () => { if (document.hidden) settle(); render() }
  return {
    /** @param preferences Accepted Host values. @param available Whether the Host namespace is ready. */
    apply(preferences, available) { values = preferences; ready = available; render() },
    /** Retry the selected resource while retaining the current visible scene. */
    retry() { requestedKey = ''; render() },
    /** @returns Cleanup retracting scenes, timers, listeners, animations and DOM. */
    mount() {
      active = true
      document.body.setAttribute('data-luna-background-managed', '')
      document.body.append(layer)
      document.addEventListener('visibilitychange', visibility)
      motion.addEventListener('change', render)
      render()
      return () => {
        active = false; rotation.dispose()
        document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', render)
        for (const scene of [current, incoming, outgoing]) scene?.dispose()
        current = incoming = outgoing = null
        layer.remove(); document.body.removeAttribute('data-luna-background-managed')
      }
    },
  }
}
