/** Background drafts and explicit, atomic ConfigForm saves. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/**
 * Keep editable values separate from accepted Host preferences.
 * @param catalog Background defaults, aliases and interval limits.
 * @param onApplied Receives accepted preferences only, plus Host readiness.
 * @returns Observable editor state, actions, ConfigForm binding and disposal.
 */
export function createBackgroundEditor(catalog, onApplied) {
  const defaults = { backgroundId: catalog.defaultId, ...catalog.defaults }
  let accepted = defaults
  let form = null
  let unsubscribe = null
  let active = true
  let intervalEdited = false
  let intervalText = String(defaults.rotationSeconds)
  const edits = new Map()
  const store = createSnapshotStore({ values: defaults, intervalText, dirty: false, intervalInvalid: false,
    status: 'loading', writable: false, saving: false, saveError: null, reduced: false, mediaError: null })
  const publish = patch => {
    if (!active) return
    const values = { ...accepted, ...Object.fromEntries(edits) }
    store.set({ ...store.getSnapshot(), ...patch, values, intervalText,
      dirty: edits.size > 0 || intervalText !== String(accepted.rotationSeconds) })
  }
  const read = () => {
    if (!active || form === null) return
    const state = form.getSnapshot()
    if (state.value !== undefined) {
      accepted = { ...state.value, backgroundId: catalog.aliases[state.value.backgroundId] ?? state.value.backgroundId }
      for (const [key, value] of edits) if (Object.is(accepted[key], value)) edits.delete(key)
      if (!intervalEdited) intervalText = String(accepted.rotationSeconds)
    }
    publish({ status: state.status, writable: state.writable })
    onApplied(accepted, state.status === 'ready')
  }
  const edit = (field, value) => {
    if (!active || store.getSnapshot().saving) return
    if (Object.is(accepted[field], value)) edits.delete(field)
    else edits.set(field, value)
    publish({ saveError: null })
  }
  const editInterval = text => {
    if (!active || store.getSnapshot().saving) return
    intervalEdited = true
    intervalText = text
    publish({ intervalInvalid: false, saveError: null })
  }
  const discard = () => {
    if (!active || store.getSnapshot().saving) return
    edits.clear()
    intervalEdited = false
    intervalText = String(accepted.rotationSeconds)
    publish({ intervalInvalid: false, saveError: null })
  }
  const restore = () => {
    if (!active || store.getSnapshot().saving) return
    edits.clear()
    for (const [key, value] of Object.entries(defaults)) if (!Object.is(accepted[key], value)) edits.set(key, value)
    intervalEdited = true
    intervalText = String(defaults.rotationSeconds)
    publish({ intervalInvalid: false, saveError: null })
  }
  const save = async () => {
    const state = store.getSnapshot()
    if (!active || state.saving || form === null || state.status !== 'ready' || !state.writable) return false
    const seconds = Number(intervalText)
    if (intervalText.trim() === '' || !Number.isSafeInteger(seconds) || seconds < catalog.rotation.minimumSeconds) {
      publish({ intervalInvalid: true }); return false
    }
    if (seconds !== accepted.rotationSeconds) edits.set('rotationSeconds', seconds)
    else edits.delete('rotationSeconds')
    const ops = [...edits].map(([field, value]) => ({ op: 'set', path: [field], value }))
    if (ops.length === 0) { discard(); return true }
    const target = form
    publish({ saving: true, intervalInvalid: false, saveError: null })
    try {
      const ok = await target.mutate(ops, target.getSnapshot().revision)
      if (!active || form !== target) return false
      if (!ok) { publish({ saveError: 'saveError' }); return false }
      edits.clear()
      intervalEdited = false
      read()
      return true
    } catch (error) {
      console.error('[dsh-luna-theme] Background save outcome could not be confirmed:', error)
      publish({ saveError: 'saveUnconfirmed' })
      return false
    } finally { publish({ saving: false }) }
  }
  return {
    store,
    actions: { edit, editInterval, restore, save, discard },
    /** @param patch Playback availability and reduced-motion facts. */
    mediaState(patch) { publish(patch) },
    /** @param next Shared DSH ConfigForm. @returns Its subscription disposer. */
    bind(next) {
      form = next
      unsubscribe = next.subscribe(read)
      read()
      return () => {
        unsubscribe?.(); unsubscribe = null; form = null
        publish({ status: 'unavailable', writable: false })
        onApplied(accepted, false)
      }
    },
    /** Fence pending saves and release the Host subscription. */
    dispose() { active = false; unsubscribe?.(); unsubscribe = null; form = null },
  }
}
