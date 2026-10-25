/** Public package entrypoints, moved media routes and browser materialization. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import * as theme from 'dsh-luna-theme'
import widget from 'dsh-luna-theme/widget'
import pet from 'dsh-luna-theme/pet'
import * as opening from 'dsh-luna-theme/opening'
import catalog from 'dsh-luna-theme/backgrounds' with { type: 'json' }
import { installBackgroundHost } from '../src/host/background.js'
import { loadPetAnimationAssets } from '../src/host/pet-animation-assets.js'

const root = fileURLToPath(new URL('../', import.meta.url))
function routesFor(install, profileDir = root) {
  const routes = [], disposers = [], injections = []
  install({ profileContext: { dir: profileDir }, effect(fn) { const dispose = fn(); if (dispose) disposers.push(dispose); return dispose }, inject() {},
    on(name, fn) { injections.push({ name, fn }) }, webServer: { tapIndex() { return () => {} }, register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } } })
  return { routes, injections, dispose() { return Promise.all(disposers.reverse().map(dispose => dispose())) } }
}
function request(route, url, method = 'GET', headers = {}) {
  const result = {}
  route.handler({ url, method, headers }, { writeHead(status, headers) { Object.assign(result, { status, headers }) }, end(bytes) { result.bytes = bytes } })
  return result
}

test('public plugin exports keep their names and entry protocols', () => {
  assert.equal(theme.name, 'dsh-luna-theme'); assert.equal(typeof theme.apply, 'function')
  assert.equal(widget.name, 'luna-balance-widget'); assert.equal(typeof widget.apply, 'function')
  assert.equal(pet.name, 'luna-pet'); assert.equal(typeof pet.apply, 'function')
  assert.equal(opening.name, 'luna-opening'); assert.equal(typeof opening.apply, 'function')
  assert.equal(theme.Config({ backgroundId: 'luna-10' }).backgroundId.get(), 'luna-10')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  for (const target of Object.values(pkg.exports)) assert.ok(fs.existsSync(path.join(root, typeof target === 'string' ? target : target.types)))
})

test('all ten background pairs are served from package assets with working byte ranges', () => {
  const fixture = routesFor(installBackgroundHost)
  assert.equal(fixture.routes.length, 20)
  for (const item of catalog.backgrounds) for (const extension of ['png', 'mp4']) {
    const url = `/dsh-luna/backgrounds/${item.id}.${extension}`
    const route = fixture.routes.find(route => route.path === url)
    const expected = fs.readFileSync(path.join(root, 'assets/backgrounds', `${item.id}.${extension}`))
    const response = request(route, url, 'GET', { range: 'bytes=0-31' })
    assert.equal(response.status, 206); assert.deepEqual(response.bytes, expected.subarray(0, 32))
    assert.equal(request(route, url, 'HEAD').bytes, undefined)
  }
  fixture.dispose(); assert.equal(fixture.routes.length, 0)
})

test('opening routes retain URLs while serving scripts, styles, pictures and audio from their new owners', () => {
  const fixture = routesFor(opening.apply), route = fixture.routes[0]
  for (const name of ['client.js', 'splash.js', 'splash.css', 'boot-skin.css', 'title-background.png', 'lun_sp06.wav']) {
    const directory = /\.(css|js)$/.test(name) ? 'src/client/opening' : 'assets/opening'
    const response = request(route, '/dsh-luna-opening/' + name)
    assert.equal(response.status, 200, name)
    assert.deepEqual(response.bytes, fs.readFileSync(path.join(root, directory, name)))
  }
  const injected = []
  fixture.injections[0].fn(injected)
  assert.ok(injected.some(row => row.kind === 'style' && row.text.includes('[data-dsh-boot]')))
  assert.equal(request(route, '/dsh-luna-opening/%2e%2e%2fpackage.json').status, 404)
  assert.equal(request(route, '/dsh-luna-opening/%zz').status, 400)
  fixture.dispose(); assert.equal(fixture.routes.length, 0)
})

test('all packaged pet atlas pages remain readable through their manifest IDs', () => {
  const directory = path.join(root, 'assets/pet-live2d'), assets = loadPetAnimationAssets(directory)
  const manifest = assets.manifestFor(new Set())
  const pages = Object.values(manifest.actions).flatMap(action => action.pages)
  assert.equal(pages.length, 217)
  for (const page of pages) assert.equal(assets.readPage(page.id).length, page.bytes)
  assert.equal(assets.readPage('../package.json'), null)
})

test('browser bundle registers lazily and materializes against the DSH platform module table', () => {
  let registration
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8'), { URL, document: { baseURI: 'https://luna.invalid/', querySelectorAll: () => [] }, window: { __ModuleLoader__: { load(value) { registration = value } } } })
  assert.equal(registration.id, 'dsh-luna-theme')
  const modules = []
  const plugin = registration.factory(id => { modules.push(id); return id === 'react' ? { createElement() {} } : {} })
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual([...new Set(modules)].sort(), ['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', 'react'])
})

test('diagnostics and widget size write only into the profile while legacy size remains readable', async t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-profile-state-'))
  const cleanups = []
  t.after(async () => { await Promise.all(cleanups.map(dispose => dispose())); fs.rmSync(fixtureRoot, { recursive: true, force: true }) })
  const profile = path.join(fixtureRoot, 'profile'), packageRoot = path.join(fixtureRoot, 'package')
  fs.mkdirSync(profile)
  fs.mkdirSync(packageRoot)
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }))
  for (const name of ['src/host/widget.js', 'src/client/widget/script.js']) {
    const destination = path.join(packageRoot, name)
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(root, name), destination)
  }
  const fixtureWidget = (await import(pathToFileURL(path.join(packageRoot, 'src/host/widget.js')).href)).default
  const diagnostic = routesFor(theme.apply, profile)
  cleanups.push(() => diagnostic.dispose())
  const response = request(diagnostic.routes.find(route => route.path === '/dsh-luna/ping'), '/dsh-luna/ping?evt=test')
  assert.equal(response.status, 204)
  assert.match(fs.readFileSync(path.join(profile, 'luna-theme-ping.log'), 'utf8'), /evt=test/)
  const size = routesFor(fixtureWidget.apply, profile)
  cleanups.push(() => size.dispose())
  const route = size.routes.find(route => route.path === '/dsh-whale/size.json')
  fs.writeFileSync(path.join(profile, '.dshw-size.json'), JSON.stringify({ scale: 0.8 }))
  fs.writeFileSync(path.join(packageRoot, '.dshw-size.json'), JSON.stringify({ scale: 0.9 }))
  assert.equal(JSON.parse(request(route, route.path).bytes).scale, 0.9)
  fs.unlinkSync(path.join(packageRoot, '.dshw-size.json'))
  assert.equal(JSON.parse(request(route, route.path).bytes).scale, 0.8)
  const put = async scale => {
    const req = Object.assign(new EventEmitter(), { url: route.path, method: 'POST', headers: {} })
    const result = {}
    const pending = route.handler(req, { writeHead(status) { result.status = status }, end(bytes) { result.bytes = bytes } })
    req.emit('data', Buffer.from(JSON.stringify({ scale }))); req.emit('end'); await pending
    return result
  }
  const result = await put(1.2)
  assert.equal(result.status, 200)
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'luna-widget-size.json'), 'utf8')).scale, 1.2)
  assert.equal(JSON.parse(request(route, route.path).bytes).scale, 1.2)
  const sizeFile = path.join(profile, 'luna-widget-size.json')
  fs.unlinkSync(sizeFile); fs.mkdirSync(sizeFile)
  assert.equal((await put(1.3)).status, 500)
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, '.dshw-size.json'), 'utf8')).scale, 0.8)
  assert.equal(fs.existsSync(path.join(packageRoot, 'luna-theme-ping.log')), false)
  assert.equal(fs.existsSync(path.join(packageRoot, '.dshw-size.json')), false)
})
