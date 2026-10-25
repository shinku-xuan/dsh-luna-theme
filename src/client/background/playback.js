/** Numeric catalog order and a visibility-aware background rotation clock. */

/**
 * Copy catalog entries in numeric filename order.
 * @param entries Resources carrying unique numeric orders.
 * @returns A sorted copy, leaving the catalog unchanged.
 */
export function orderedBackgrounds(entries) {
  return [...entries].sort((left, right) => left.order - right.order)
}

/**
 * Own one rotation timer. Pausing preserves time remaining; changing mode or
 * interval starts a full interval. Fixed selections never schedule a timer.
 * @param ids Nonempty resource ids already sorted in playback order.
 * @param onAdvance Called after a timed selection change.
 * @param clock Monotonic time and timer functions; defaults to the browser clock.
 * @returns Selection update, current-id read, and disposal functions.
 */
export function createBackgroundRotation(ids, onAdvance, clock = {
  now: () => performance.now(), schedule: (fn, ms) => setTimeout(fn, ms), cancel: timer => clearTimeout(timer),
}) {
  if (ids.length === 0) throw new Error('Background rotation needs at least one resource')
  let current = ids[0]
  let spec = null
  let remaining = 0
  let started = 0
  let timer = null
  let disposed = false
  let generation = 0
  const stop = () => {
    ++generation
    if (timer === null) return
    remaining = Math.max(0, remaining - (clock.now() - started))
    clock.cancel(timer)
    timer = null
  }
  const arm = () => {
    if (disposed || spec === null || spec.mode !== 'rotate' || spec.paused || ids.length === 1) return
    started = clock.now()
    const ticket = ++generation
    timer = clock.schedule(() => {
      if (disposed || ticket !== generation) return
      remaining = Math.max(0, remaining - (clock.now() - started))
      timer = null
      if (remaining === 0) {
        current = ids[(ids.indexOf(current) + 1) % ids.length]
        remaining = spec.seconds * 1000
        onAdvance(current)
      }
      // A selection callback may change mode or dispose the clock.
      if (timer === null) arm()
    }, Math.min(remaining, 2_147_483_647))
  }
  return {
    /**
     * @param next Mode, whole-second interval, valid fixedId, and paused visibility state.
     * @returns The selected resource id after applying preferences and visibility.
     */
    update(next) {
      if (disposed) return current
      if (spec !== null && spec.mode === next.mode && spec.seconds === next.seconds && spec.fixedId === next.fixedId && spec.paused === next.paused) return current
      stop()
      const reset = spec === null || spec.mode !== next.mode || spec.seconds !== next.seconds
      spec = { ...next }
      if (next.mode === 'fixed') current = next.fixedId
      if (reset) remaining = next.seconds * 1000
      arm()
      return current
    },
    /** @returns The current resource id without changing the timer. */
    current: () => current,
    /** Retract the timer and fence callbacks already queued by the browser. */
    dispose() { disposed = true; stop() },
  }
}
