/** Preferences stored in the `dsh-luna-theme` DSH settings namespace. */
export interface BackgroundPreferences {
  /** Stable resource id selected from the background catalog. */
  backgroundId: string
  /** Rotate in catalog order or keep the background selected by backgroundId. */
  backgroundMode: 'rotate' | 'fixed'
  /** Time per background in whole seconds, at least 12; independent of the video's loop duration. */
  rotationSeconds: number
  /** Crossfade duration in milliseconds, from 0 to 5000; reduced motion uses 0. */
  transitionMilliseconds: number
  /** Play the selected video unless the system requests reduced motion. */
  animated: boolean
  /** Theme-colored mask strength, from 0 to 100 percent. */
  mask: number
  /** Image blur radius, from 0 to 24 CSS pixels. */
  blur: number
  /** Background transparency, from 0 (visible) to 100 (transparent). */
  transparency: number
}

/** One static image and optional looping video, displayed without cropping. */
export interface BackgroundResource {
  /** Stable id used by persisted preferences and asset route filenames. */
  id: string
  /** Numeric filename order, independent of insertion order in the catalog. */
  order: number
  /** Content version added to asset URLs to invalidate cached replacements. */
  revision: string
  /** Display names keyed by supported locale. */
  name: { zh: string; en: string }
  /** Package-relative PNG fallback path. */
  poster: string
  /** Package-relative MP4 path. */
  video?: string
  /** Loop duration in seconds. */
  duration?: number
}
