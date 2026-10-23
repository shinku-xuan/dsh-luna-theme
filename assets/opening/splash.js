/** Layered title opening shared by the client plugin and its standalone preview. */
(function () {
  'use strict'

  var scriptUrl = document.currentScript && document.currentScript.src
  var assetBase = scriptUrl ? new URL('.', scriptUrl).href : '/dsh-luna-opening/'
  var activeStop = null
  var messages = {
    zh: {
      opening: '开场动画', skipHint: '点击画面或按 Esc 跳过',
      play: '播放语音', retry: '重试', blocked: '点击播放开场语音',
      audioError: '语音未能播放，请重试或跳过', imageError: '开场图片未能加载，请重试或跳过',
    },
    en: {
      opening: 'Opening animation', skipHint: 'Click the screen or press Escape to skip',
      play: 'Play voice', retry: 'Retry', blocked: 'Click to play the opening voice',
      audioError: 'The voice could not play. Retry or skip.', imageError: 'Opening images could not load. Retry or skip.',
    },
  }

  function t(key) {
    return messages[/^zh/i.test(document.documentElement.lang || navigator.language) ? 'zh' : 'en'][key]
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  /**
   * Block the application during the title scene, blackout and voice playback.
   * Images decode before entry starts; voice starts only after opaque black has painted.
   * The body theme at mount selects the day or night background for this playback.
   * Clicking the overlay or pressing Escape skips; prompt actions keep their own clicks.
   * Autoplay rejection waits for a user gesture on black. Media failure offers retry/skip.
   * @param container - Overlay parent, normally document.body.
   * @param options - Optional sceneMs (default 7600, 0 holds the scene), blackoutMs
   *   (default 1400), assetBase URL, onPhase callback and onClose(skipped) callback.
   * @returns Idempotent disposer; cancels media/timers and restores focus without onClose.
   */
  function mount(container, options) {
    if (activeStop !== null) activeStop()
    var opts = options || {}
    var sceneMs = opts.sceneMs === undefined ? 7600 : opts.sceneMs
    var blackoutMs = opts.blackoutMs === undefined ? 1400 : opts.blackoutMs
    var base = opts.assetBase === undefined ? assetBase : opts.assetBase
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    var onClose = opts.onClose || function () {}
    var onPhase = opts.onPhase || function () {}
    var root = el('div', 'luna-splash')
    root.setAttribute('data-luna-splash', '')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', t('opening'))
    root.setAttribute('aria-description', t('skipHint'))
    root.tabIndex = 0
    root.style.setProperty('--luna-blackout-ms', (reduced ? Math.min(blackoutMs, 200) : blackoutMs) + 'ms')
    root.classList.toggle('luna-splash-reduced', reduced)
    var dark = document.body.hasAttribute('data-ds-dark-theme')
    root.setAttribute('data-theme', dark ? 'dark' : 'light')

    var scene = el('div', 'luna-splash-scene')
    scene.setAttribute('aria-hidden', 'true')
    var stage = el('div', 'luna-splash-stage')
    var images = []
    function image(parent, className, file) {
      var img = el('img', className)
      img.alt = ''
      img.draggable = false
      img.src = new URL(file, base).href
      parent.appendChild(img)
      images.push(img)
    }
    function plane(className, file, imageClass) {
      var layer = el('div', 'luna-splash-plane ' + className)
      image(layer, imageClass, file)
      stage.appendChild(layer)
    }
    plane('luna-splash-background-plane', dark ? 'title-background.png' : 'title-background-day.png', 'luna-splash-background')
    // The center figure is behind both side groups; right foreground covers Mizuho.
    plane('luna-splash-ursule', 'title-ursule.png', 'luna-splash-character')
    plane('luna-splash-mizuho', 'title-mizuho.png', 'luna-splash-character')
    plane('luna-splash-hero', 'title-luna-asahi.png', 'luna-splash-character')
    plane('luna-splash-minato', 'title-minato.png', 'luna-splash-character')
    var petals = el('div', 'luna-splash-plane luna-splash-petals')
    var sprites = [[67, 55, 112, 66], [809, 494, 115, 100], [889, 915, 138, 87], [1492, 247, 99, 58], [774, 270, 75, 73], [1750, 1050, 125, 63]]
    var placements = [[3, 61, 2.5], [16, 9, 1.2], [25, 41, 2.4], [39, 39, 6], [49, 78, 5], [59, 55, 3.3], [71, 15, 2.8], [82, 52, 3], [97, 81, 4.2], [57, 4, 1.3], [68, 34, 1.5], [44, 50, 1.8], [77, 89, 1.4], [29, 91, 3]]
    for (var i = 0; i < 30; i++) {
      var sprite = sprites[i % sprites.length]
      var position = i < placements.length ? placements[i] : [43 + (i * 13 % 42), 3 + (i * 7 % 32), 0.3 + (i % 4) * 0.16]
      var petal = el('span', 'luna-splash-petal')
      petal.style.left = position[0] + '%'
      petal.style.top = position[1] + '%'
      petal.style.width = position[2] + '%'
      petal.style.aspectRatio = sprite[2] + ' / ' + sprite[3]
      petal.style.backgroundSize = (2048 / sprite[2] * 100) + '% ' + (1386 / sprite[3] * 100) + '%'
      petal.style.backgroundPosition = (sprite[0] / (2048 - sprite[2]) * 100) + '% ' + (sprite[1] / (1386 - sprite[3]) * 100) + '%'
      petal.style.setProperty('--luna-petal-duration', (14 + i % 7) + 's')
      petal.style.setProperty('--luna-petal-delay', -(i % 5) + 's')
      petals.appendChild(petal)
    }
    stage.appendChild(petals)
    image(stage, 'luna-splash-petal-atlas', 'title-petals.png')
    var logo = el('div', 'luna-splash-logo')
    image(logo, 'luna-splash-logo-bg', 'title-logo-bg.webp')
    image(logo, 'luna-splash-logo-top', 'title-logo-top.webp')
    image(logo, 'luna-splash-logo-bottom', 'title-logo-bottom.webp')
    stage.appendChild(logo)
    stage.appendChild(el('div', 'luna-splash-wash'))
    scene.appendChild(stage)
    root.appendChild(scene)
    var blackout = el('div', 'luna-splash-blackout')
    root.appendChild(blackout)
    var prompt = el('div', 'luna-splash-prompt')
    prompt.hidden = true
    var status = el('div', 'luna-splash-status')
    status.setAttribute('role', 'status')
    var action = el('button', 'luna-splash-action')
    action.type = 'button'
    prompt.append(status, action)
    root.appendChild(prompt)
    var audio = el('audio')
    audio.preload = 'auto'
    audio.src = new URL('lun_sp06.wav', base).href
    root.appendChild(audio)

    var timers = new Set()
    var frames = new Set()
    var disposed = false
    var finishing = false
    var phase = 'loading'
    var loadAttempt = 0
    var playAttempt = 0
    var retry = function () {}
    var previousFocus = document.activeElement
    var inertPeers = new Map()
    function suspendPeer(node) {
      if (node === root || inertPeers.has(node)) return
      var wasInert = node.hasAttribute('inert')
      inertPeers.set(node, wasInert)
      node.setAttribute('inert', '')
    }
    Array.from(container.children).forEach(suspendPeer)
    // Client portals can be appended after the splash mounts.
    var peersObserver = new MutationObserver(function () {
      Array.from(container.children).forEach(suspendPeer)
    })
    peersObserver.observe(container, { childList: true })

    function setPhase(value) {
      phase = value
      root.setAttribute('data-phase', value)
      onPhase(value)
    }
    function later(callback, ms) {
      var id = setTimeout(function () {
        timers.delete(id)
        if (!disposed) callback()
      }, ms)
      timers.add(id)
    }
    function nextFrame(callback) {
      var id = requestAnimationFrame(function () {
        frames.delete(id)
        if (!disposed) callback()
      })
      frames.add(id)
    }
    function cancelScheduled() {
      timers.forEach(clearTimeout)
      frames.forEach(cancelAnimationFrame)
      timers.clear()
      frames.clear()
    }
    function silence() {
      playAttempt++
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    function stop() {
      if (disposed) return
      disposed = true
      peersObserver.disconnect()
      cancelScheduled()
      silence()
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onAudioError)
      blackout.removeEventListener('transitionend', onBlack)
      root.removeEventListener('click', onScreenClick)
      action.removeEventListener('click', onAction)
      root.removeEventListener('keydown', onKey)
      root.remove()
      inertPeers.forEach(function (wasInert, node) {
        if (!wasInert) node.removeAttribute('inert')
      })
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true })
      }
      if (activeStop === stop) activeStop = null
    }
    function finish(skipped) {
      if (disposed || finishing) return
      finishing = true
      cancelScheduled()
      silence()
      prompt.hidden = true
      setPhase('closing')
      later(function () { stop(); onClose(skipped) }, reduced ? 0 : 480)
    }
    function offer(message, button, callback, value) {
      setPhase(value)
      status.textContent = t(message)
      action.textContent = t(button)
      retry = callback
      prompt.hidden = false
      action.disabled = false
      action.focus({ preventScroll: true })
    }
    function playVoice() {
      if (disposed || finishing) return
      prompt.hidden = true
      action.disabled = true
      root.focus({ preventScroll: true })
      setPhase('voice')
      var attempt = ++playAttempt
      var playing
      try {
        // Retry calls play in the user's click handler to retain autoplay permission.
        playing = audio.play()
      } catch (error) {
        rejected(error)
        return
      }
      Promise.resolve(playing).catch(rejected)
      function rejected(error) {
        if (disposed || finishing || attempt !== playAttempt) return
        if (error.name === 'NotAllowedError') {
          offer('blocked', 'play', playVoice, 'awaiting-voice')
        } else {
          offer('audioError', 'retry', retryVoice, 'audio-error')
        }
      }
    }
    function retryVoice() {
      audio.load()
      playVoice()
    }
    function onAudioError() {
      if (disposed || finishing) return
      // Preload errors are reported only after the scene has faded to black.
      if (phase === 'voice' || phase === 'awaiting-voice') {
        playAttempt++
        offer('audioError', 'retry', retryVoice, 'audio-error')
      }
    }
    function onEnded() {
      if (phase === 'voice') finish(false)
    }
    function blackPainted() {
      if (phase !== 'blackout') return
      if (getComputedStyle(blackout).opacity !== '1') {
        nextFrame(blackPainted)
        return
      }
      cancelScheduled()
      setPhase('black')
      // Two animation frames separate the opaque endpoint from voice playback.
      nextFrame(function () { nextFrame(playVoice) })
    }
    function onBlack(event) {
      if (event.target === blackout && event.propertyName === 'opacity') blackPainted()
    }
    function beginBlackout() {
      if (phase !== 'scene') return
      setPhase('blackout')
      later(blackPainted, (reduced ? Math.min(blackoutMs, 200) : blackoutMs) + 80)
    }
    function loadScene() {
      cancelScheduled()
      prompt.hidden = true
      root.focus({ preventScroll: true })
      setPhase('loading')
      var attempt = ++loadAttempt
      var failed = false
      function fail() {
        if (disposed || finishing || failed || attempt !== loadAttempt) return
        failed = true
        cancelScheduled()
        offer('imageError', 'retry', loadScene, 'image-error')
      }
      later(fail, 15000)
      Promise.all(images.map(function (img) {
        if (attempt > 1) img.src = img.src
        return img.decode()
      })).then(function () {
        if (disposed || finishing || failed || attempt !== loadAttempt) return
        cancelScheduled()
        nextFrame(function () {
          root.classList.add('is-playing')
          setPhase('scene')
          root.focus({ preventScroll: true })
          if (sceneMs > 0) later(beginBlackout, reduced ? Math.min(sceneMs, 2200) : sceneMs)
        })
      }, fail)
    }
    function onScreenClick(event) {
      if (action.contains(event.target)) return
      finish(true)
    }
    function onAction() { retry() }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); finish(true) }
      if (event.key === 'Tab') {
        event.preventDefault()
        var target = prompt.hidden || document.activeElement === action ? root : action
        target.focus({ preventScroll: true })
      }
    }
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onAudioError)
    blackout.addEventListener('transitionend', onBlack)
    root.addEventListener('click', onScreenClick)
    action.addEventListener('click', onAction)
    root.addEventListener('keydown', onKey)
    container.appendChild(root)
    activeStop = stop
    root.focus({ preventScroll: true })
    loadScene()
    return stop
  }

  globalThis.__LUNA_SPLASH__ = { mount: mount }
})()
