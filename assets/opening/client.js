/** Load and dispose the theme's opening using the same runtime as its preview. */
(function () {
  'use strict'
  window.__dshLunaOpeningDispose?.()
  var base = new URL('.', document.currentScript.src).href
  var tags = []
  var disposed = false
  var started = false
  var ready = false
  var stop = function () {}

  function append(tag) {
    tag.setAttribute('data-luna-opening-asset', '')
    tags.push(tag)
    document.head.appendChild(tag)
    return tag
  }
  function start() {
    if (disposed || started || !ready || style.sheet === null) return
    started = true
    stop = window.__LUNA_SPLASH__.mount(document.body, { assetBase: base })
  }
  for (var file of ['asahi-idle.webp', 'asahi-happy.webp']) {
    var image = document.createElement('link')
    image.rel = 'preload'
    image.as = 'image'
    image.href = new URL(file, base).href
    append(image)
  }
  for (var file of ['boot-skin.css', 'splash.css']) {
    var link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(file, base).href
    append(link)
    if (file === 'splash.css') var style = link
  }
  style.addEventListener('load', start)
  var script = document.createElement('script')
  script.src = new URL('splash.js', base).href
  script.onload = function () { ready = true; start() }
  append(script)

  function dispose() {
    if (disposed) return
    disposed = true
    script.onload = null
    style.removeEventListener('load', start)
    stop()
    tags.forEach(function (tag) { tag.remove() })
    if (window.__dshLunaOpeningDispose === dispose) delete window.__dshLunaOpeningDispose
  }
  window.__dshLunaOpeningDispose = dispose
})()
