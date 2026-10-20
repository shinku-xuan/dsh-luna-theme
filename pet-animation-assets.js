/** Read the packaged animation manifest and constrain page lookup to its file IDs. */
import fs from 'node:fs'
import path from 'node:path'

/**
 * Identify artwork that differs from the package, following the image route's lookup order.
 * Identical copies of the bundled artwork retain the new packaged animations.
 * @param poses - static pose IDs.
 * @param directories - override directories, in lookup order.
 * @param packaged - package-owned static artwork directory.
 * @param extensions - file extensions, in lookup order.
 * @returns pose IDs with a custom static image or motion sheet.
 */
export function findPetArtOverrides(poses, directories, packaged, extensions) {
  const result = new Set()
  for (const pose of poses) for (const name of [pose, pose + '-cycle']) {
    let selected = null
    let filename = null
    for (const directory of directories) {
      for (const extension of extensions) {
        const candidate = path.join(directory, name + extension)
        if (fs.existsSync(candidate)) { selected = candidate; filename = name + extension; break }
      }
      if (selected !== null) break
    }
    if (selected === null) continue
    const counterpart = path.join(packaged, filename)
    if (!fs.existsSync(counterpart) || !fs.readFileSync(selected).equals(fs.readFileSync(counterpart))) result.add(pose)
  }
  return result
}

/**
 * Validate the on-disk atlas manifest before any page is served.
 * @param directory - package-owned atlas directory.
 * @returns validated manifest and allowlisted page readers; throws on invalid or absent metadata.
 */
export function loadPetAnimationAssets(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  const actions = new Set(['idle', 'wave', 'thinking', 'happy', 'surprise', 'sleep', 'sad', 'working', 'waiting', 'drag', 'walk-a-right', 'walk-a-left', 'fall'])
  if (manifest.version !== 1 || manifest.cellWidth !== 400 || manifest.cellHeight !== 520 || manifest.columns !== 4 ||
    manifest.framesPerPage !== 12 || manifest.bodyHeight !== 350 || manifest.baseline !== 500 || manifest.fps !== 30 ||
    !manifest.actions || typeof manifest.actions !== 'object' || Array.isArray(manifest.actions)) throw new Error('Invalid pet animation manifest')
  const files = new Map()
  for (const [id, entry] of Object.entries(manifest.actions)) {
    if (!actions.has(id) || !entry || !Number.isInteger(entry.frames) || entry.frames < 1 || entry.frames > 360 ||
      entry.durationMs !== Math.round(entry.frames / 30 * 1000) || !Array.isArray(entry.pages) || entry.pages.length !== Math.ceil(entry.frames / 12)) throw new Error('Invalid pet animation: ' + id)
    if (id.startsWith('walk-a-') && (entry.distance !== true || !Number.isFinite(entry.stride) || entry.stride <= 0 ||
      !Array.isArray(entry.distanceSamples) || entry.distanceSamples.length !== entry.frames || entry.distanceSamples.some((value, index) =>
        !Number.isFinite(value) || value < 0 || value >= 1 || index > 0 && value < entry.distanceSamples[index - 1]))) throw new Error('Invalid walking distance samples')
    for (const [index, page] of entry.pages.entries()) {
      if (!page || typeof page.id !== 'string' || !/^[a-z0-9-]+$/.test(page.id) ||
        typeof page.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(page.sha256) ||
        page.id !== id + '-' + String(index).padStart(3, '0') + '-' + page.sha256.slice(0, 12) ||
        !Number.isInteger(page.bytes) || page.bytes < 1 || files.has(page.id)) throw new Error('Invalid pet animation page: ' + id)
      files.set(page.id, path.join(directory, page.id + '.webp'))
    }
  }
  if (Object.keys(manifest.actions).length !== actions.size) throw new Error('Incomplete pet animation set')
  return {
    /** Preserve profile artwork overrides by omitting their packaged animations. */
    manifestFor(overrides) {
      return { ...manifest, actions: Object.fromEntries(Object.entries(manifest.actions).filter(([id]) => !overrides.has(id.startsWith('walk-a-') ? 'walk-a' : id))) }
    },
    /** Return null for an unknown page ID; filesystem failures retain their cause. */
    readPage(id) {
      const file = files.get(id)
      return file === undefined ? null : fs.readFileSync(file)
    },
  }
}
