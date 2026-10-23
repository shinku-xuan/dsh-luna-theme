/**
 * Luna restyle for the DSH client: a palette-and-material layer borrowed from
 * Luna-Chat's front end.
 *
 * Its token layer follows the active light/dark preference. The owned
 * stylesheet and background layer add color transitions, a slowly moving
 * wallpaper and sparse petals behind the application. Effects retract their
 * DOM, listeners and timers when the plugin is disabled. The optional balance
 * widget, desktop pet and opening load through their own Host rows.
 */
window.__ModuleLoader__.load({
  id: 'dsh-luna-theme',
  factory(require) {
    /** React runtime, borrowed from the browser module table. */
    let React = null
    try {
      React = require('react')
    } catch { /* module registry may not expose React in this shell */ }

    /** Layer identity, and the `data-plugin` stamp that claims the style tag. */
    const PACKAGE_ID = 'dsh-luna-theme'

    /** How many times to re-read the theme service before giving up on the token layer. */
    const THEME_BIND_ATTEMPTS = 40

    /** Delay between theme-service reads, in milliseconds. */
    const THEME_BIND_INTERVAL_MS = 100

    /** Diagnostic beacon the Host half records, so a silent failure is not silent. */
    const PING_ROUTE = '/dsh-luna/ping'

    /**
     * Page script served by this bundle's widget row.
     *
     * The desktop shell serves its own static index and never applies the Host's
     * `tapIndex` transforms, so the tag has to come from a client bundle for both
     * shells to run it. It is added unconditionally: with the widget row disabled
     * the route 404s and the tag loads nothing.
     */
    const WIDGET_SCRIPT_URL = 'dsh-whale/widget.js'

    /**
     * Page script served by this bundle's pet row (`luna-pet`).
     *
     * The same constraint as the widget script above: the desktop shell serves
     * its own static index and never applies the Host's `tapIndex`, so the tag
     * has to come from a client bundle for both shells to run it. It is added
     * unconditionally, and with the pet row disabled the route 404s and the tag
     * loads nothing.
     */
    const PET_SCRIPT_URL = '/dsh-luna-pet/pet.js'

    /** Opening loader served only while the optional luna-opening row is active. */
    const OPENING_SCRIPT_URL = '/dsh-luna-opening/client.js'

    /**
     * Route serving the cheap system-memory reading the badge polls.
     *
     * The badge is injected rather than registered into a slot, so it also has
     * to tolerate a Host half that does not serve the route yet (an install
     * whose `index.js` predates it): the first non-OK response hides it for
     * good instead of leaving a dead pill on the composer row.
     */
    const MEMORY_ROUTE = '/dsh-luna/memory.json'

    /** Route serving the system reading plus the DSH process group. */
    const MEMORY_DETAIL_ROUTE = '/dsh-luna/memory-detail.json'

    /** System memory moves slowly; five seconds keeps the poll cheap and current. */
    const MEMORY_POLL_MS = 5000

    /** Refresh interval while the detail panel is open. */
    const MEMORY_DETAIL_POLL_MS = 3000

    /** Tag this bundle puts on a control that carries an icon and no text. */
    const ICON_ONLY_ATTRIBUTE = 'data-luna-icon-only'

    /** Attribute naming the memory badge, and the panel it opens. */
    const MEMORY_ATTRIBUTE = 'data-luna-memory'
    const MEMORY_PANEL_ATTRIBUTE = 'data-luna-memory-panel'

    // Undo this bundle's own style sweep before doing anything else.
    //
    // The module system runs `claimStyles(id)` as each bundle materialises, and
    // that sweep stamps EVERY untagged <style> in the document with the
    // materialising package's id — not just the sheets that package created.
    // Any style tagged with our id is therefore foreign at this point (our own
    // sheet is created later, in apply), and leaving the tag on would let a
    // later replacement of this package delete another plugin's stylesheet
    // through `removeOwnedStyles`. Restoring the attribute puts the document
    // back the way this bundle found it. Owners should tag their own sheets;
    // see the README for why that matters.
    for (const el of document.querySelectorAll(`style[data-plugin="${PACKAGE_ID}"]`)) {
      el.removeAttribute('data-plugin')
    }

    /**
     * Luna-Chat's token values mapped onto the DSH alias layer.
     *
     * Dark is the faithful palette: Luna's `#1a1a2e` base, `#0f0f23` sidebar,
     * `rgba(41, 32, 78, .72)` violet glass, sakura `#ffb7c5`, and the gold
     * `#c8a96a` / `#ffd700` call-to-action family. Light is derived from the
     * same hues with every text role darkened until it clears WCAG AA on its
     * own surface, because Luna ships no light theme to copy.
     *
     * Every entry carries both modes: `ctx.theme.overrideTokens` rejects a bare
     * string, and a single value would go illegible when the user flips scheme.
     */
    const LUNA_TOKENS = {
      /* --- Surfaces ------------------------------------------------------
       * The viewport-filling surfaces carry alpha so the wallpaper layer below
       * them reads through. These two tokens are painted by MORE THAN ONE
       * stacked element — the frame and the conversation root both use the base
       * fill — so the opacity the eye sees is `1-(1-a)^2`, not `a`. That
       * squaring is why an `a` that looks reasonable in isolation (0.78) leaves
       * the wallpaper at 5% and effectively invisible; the values below target
       * roughly 0.64 effective. Raised layers stay opaque, because cards,
       * dialogs and nested panels are where dense text lives. */
      '--dsw-alias-bg-base': { light: 'rgba(247, 245, 252, 0.16)', dark: 'rgba(26, 26, 46, 0.23)' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#16213e' },
      '--dsw-alias-bg-layer-2': { light: '#f6f3fd', dark: '#1e1e3a' },
      '--dsw-alias-bg-layer-3': { light: '#efeaf9', dark: '#262648' },
      '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#241f3f' },
      '--dsw-alias-bg-module-platform': { light: '#f3effb', dark: '#1e1e3a' },
      '--dsw-alias-bg-multi-select': { light: '#f3effb', dark: '#1e1e3a' },
      '--dsw-alias-bg-document-preview': { light: '#f1ecfa', dark: '#0f0f23' },
      '--dsw-alias-bg-skeleton': {
        light: 'rgba(74, 58, 122, 0.07)',
        dark: 'rgba(155, 127, 212, 0.10)',
      },
      '--dsw-specific-sidebar-fill': {
        light: 'rgba(242, 190, 210, 0.18)',
        dark: 'rgba(15, 15, 35, 0.25)',
      },
      '--dsw-specific-selector': { light: '#f0ebfa', dark: '#262648' },
      '--dsw-specific-input-major': {
        light: 'rgba(74, 58, 122, 0.06)',
        dark: 'rgba(41, 32, 78, 0.72)',
      },
      '--dsw-specific-login-input': { light: '#ffffff', dark: '#16213e' },
      '--dsw-specific-tip': { light: '#f0ebfa', dark: '#262648' },
      '--dsw-specific-bubble': { light: '#efeaf9', dark: '#2a2a4a' },
      '--dsw-specific-bubble-highlight': { light: '#e4dcf6', dark: '#34345c' },
      '--dsw-specific-sidebar-nav-item-hover': { light: '#e7e0f7', dark: '#1e1e3a' },
      '--dsw-specific-sidebar-nav-item-active': {
        light: 'rgba(155, 127, 212, 0.22)',
        dark: 'rgba(155, 127, 212, 0.18)',
      },
      /* This token is a *surface*, not an accent swatch: the only consumer in
       * the shipped client is the option "recommended" badge in
       * QuestionComposer.module.css, which paints it as the badge background
       * and puts --dsw-alias-button-info-fill on top as the text colour. Both
       * shipped schemes therefore use a tint that the mid-tone text reads
       * against — a pale blue in light, a near-black in dark. Mapping it to the
       * same violet as the text (0.2.8 and earlier) made the badge 1.00:1, i.e.
       * invisible. Keep it far from the text colour; verify.mjs checks the pair. */
      '--dsw-specific-sidebar-nav-item-active-accent': { light: '#f0ebfc', dark: '#201835' },

      /* --- Glass material ------------------------------------------------
       * The shipped menu material is a light grey blur; Luna's is a violet
       * panel at a much tighter blur radius. Both are theme-owned tokens, so
       * the restyle stays inside the documented menu contract. */
      '--dsw-menu-surface-fill': {
        light: 'rgba(255, 255, 255, 0.80)',
        dark: 'rgba(41, 32, 78, 0.78)',
      },
      '--dsw-menu-backdrop-filter': {
        light: 'blur(14px) saturate(130%)',
        dark: 'blur(14px) saturate(130%)',
      },

      /* --- Borders ------------------------------------------------------- */
      '--dsw-alias-border-l1': {
        light: 'rgba(74, 58, 122, 0.10)',
        dark: 'rgba(155, 127, 212, 0.14)',
      },
      '--dsw-alias-border-l2': {
        light: 'rgba(74, 58, 122, 0.16)',
        dark: 'rgba(155, 127, 212, 0.22)',
      },
      '--dsw-alias-border-l2-darkmode-thin': {
        light: 'rgba(74, 58, 122, 0.16)',
        dark: 'rgba(155, 127, 212, 0.22)',
      },
      '--dsw-alias-border-l3': {
        light: 'rgba(74, 58, 122, 0.22)',
        dark: 'rgba(155, 127, 212, 0.30)',
      },
      '--dsw-alias-border-l4': {
        light: 'rgba(74, 58, 122, 0.30)',
        dark: 'rgba(155, 127, 212, 0.42)',
      },
      '--dsw-alias-border-inverted': {
        light: 'rgba(255, 255, 255, 0.60)',
        dark: 'rgba(26, 26, 46, 0.12)',
      },
      '--dsw-alias-border-inverted2': {
        light: 'rgba(255, 255, 255, 0.40)',
        dark: 'rgba(26, 26, 46, 0.08)',
      },

      /* --- Text ---------------------------------------------------------- */
      '--dsw-alias-label-primary': { light: '#221c36', dark: '#e8e8ed' },
      '--dsw-alias-label-primary-bluish': { light: '#221c36', dark: '#e8e8ed' },
      '--dsw-alias-label-primary-dimmed': { light: '#3a3155', dark: '#cfcfe0' },
      '--dsw-alias-label-primary-inverted': { light: '#ffffff', dark: '#1a1a2e' },
      '--dsw-alias-label-secondary': { light: '#332d47', dark: '#dbdbe9' },
      '--dsw-alias-label-tertiary': { light: '#544c6e', dark: '#cfcfdd' },
      '--dsw-alias-label-caption': { light: '#544c6e', dark: '#d0d0de' },
      '--dsw-alias-label-dimmed': { light: '#b3aac9', dark: '#55556b' },
      '--dsw-alias-label-document-preview': { light: '#564d70', dark: '#a0a0b8' },
      '--dsw-alias-menu-icon': { light: '#3a3155', dark: '#cfcfe0' },
      '--dsw-alias-switch-thumb': { light: '#ffffff', dark: '#f7f5fc' },

      /* --- Brand and buttons ---------------------------------------------
       * Dark keeps Luna's gold CTA with the dark-violet ink stroke colour
       * `#3b2440` standing in for the fill.
       *
       * Light switched from that family's violet plaque to a sakura one with
       * white type (2026-10-01, user request), then softened on the user's next
       * pass: `#c0396a` read as too red, so the fill moved onto sakura's own
       * hue and dropped saturation (`#c05167` is H348 S0.58 against `#c0396a`'s
       * H338 S0.70). It is the palest point that still clears WCAG AA against
       * white type — Luna's own `#ffb7c5` is 1.64:1 there, so a literal sakura
       * and white type cannot coexist; going further toward sakura needs the
       * label to darken.
       * `--dsw-alias-brand-primary` stays violet: its consumers are the switch
       * track, checkbox accent and file-card plate, none of them the CTA. */
      '--dsw-alias-brand-primary': { light: '#4a3a7a', dark: '#c8a96a' },
      '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#4a3a7a', dark: '#c8a96a' },
      '--dsw-alias-brand-primary-invert': { light: '#ffd700', dark: '#3b2440' },
      '--dsw-alias-brand-text': { light: '#ffd700', dark: '#3b2440' },
      '--dsw-alias-label-primary-foreground': { light: '#ffffff', dark: '#3b2440' },
      '--dsw-alias-button-primary-fill': { light: '#c05167', dark: '#c8a96a' },
      '--dsw-alias-button-primary-hover': {
        light: '#b64c62',
        dark: 'color-mix(in srgb, #c8a96a 82%, #f2f0ea)',
      },
      '--dsw-alias-button-primary-dimmed': {
        light: 'rgba(192, 81, 103, 0.30)',
        dark: 'rgba(200, 169, 106, 0.35)',
      },
      '--dsw-alias-button-info-fill': { light: '#6f4fb8', dark: '#9b7fd4' },
      '--dsw-alias-button-info-hover': { light: '#5b3fa0', dark: '#b098e8' },
      '--dsw-alias-button-elevated-fill': { light: '#ffffff', dark: '#262648' },
      '--dsw-alias-button-floating-fill': { light: '#ffffff', dark: '#241f3f' },
      '--dsw-alias-button-floating-hover': { light: '#f3effb', dark: '#2e2a52' },
      '--dsw-alias-button-contrast-fill': { light: '#221c36', dark: '#e8e8ed' },
      '--dsw-alias-button-ghost-active-fill': {
        light: 'rgba(155, 127, 212, 0.18)',
        dark: 'rgba(155, 127, 212, 0.22)',
      },
      '--dsw-alias-button-ghost-active-hover': {
        light: 'rgba(155, 127, 212, 0.26)',
        dark: 'rgba(155, 127, 212, 0.30)',
      },
      '--dsw-alias-button-ghost-active-border': { light: '#7a5cc4', dark: '#9b7fd4' },
      '--dsw-alias-button-tool-bar-fill': {
        light: 'rgba(74, 58, 122, 0.10)',
        dark: 'rgba(155, 127, 212, 0.22)',
      },
      '--dsw-alias-button-tool-bar-hover': {
        light: 'rgba(74, 58, 122, 0.16)',
        dark: 'rgba(155, 127, 212, 0.32)',
      },
      '--dsw-alias-button-tool-bar-fill-invisible': {
        light: 'rgba(255, 255, 255, 0.50)',
        dark: 'rgba(15, 15, 35, 0.45)',
      },

      /* --- Interaction --------------------------------------------------- */
      '--dsw-alias-interactive-bg-hover': {
        light: 'rgba(74, 58, 122, 0.06)',
        dark: 'rgba(155, 127, 212, 0.12)',
      },
      '--dsw-alias-interactive-bg-active': {
        light: 'rgba(74, 58, 122, 0.12)',
        dark: 'rgba(155, 127, 212, 0.20)',
      },
      '--dsw-alias-interactive-bg-hover-solid': { light: '#f0ebfa', dark: '#262648' },
      '--dsw-alias-interactive-bg-hover-accent': {
        light: 'rgba(74, 58, 122, 0.16)',
        dark: 'rgba(155, 127, 212, 0.30)',
      },
      '--dsw-alias-interactive-bg-hover-danger': {
        light: 'rgba(200, 40, 40, 0.08)',
        dark: 'rgba(242, 90, 90, 0.15)',
      },

      /* --- Links and markdown --------------------------------------------
       * Sakura links are Luna's second voice. `#ffb7c5` only reaches ~1.5:1 on
       * a light surface, so light swaps in the family's deep rose. */
      '--dsw-alias-link': { light: '#7d0a36', dark: '#ffced8' },
      /* Code keeps a near-opaque plate. `--dsw-alias-bg-base` is translucent
       * now, and the banner is the sticky strip that overlaps scrolling code,
       * so both carry their own backing instead of inheriting the glass. */
      '--dsw-alias-markdown-code-block': {
        light: 'rgba(244, 241, 251, 0.94)',
        dark: 'rgba(16, 14, 34, 0.94)',
      },
      '--dsw-alias-markdown-code-block-banner': {
        light: 'rgba(233, 227, 247, 0.96)',
        dark: 'rgba(12, 10, 26, 0.96)',
      },
      '--dsw-alias-markdown-inline-code': {
        light: 'rgba(74, 58, 122, 0.09)',
        dark: 'rgba(15, 15, 35, 0.72)',
      },
      '--dsw-alias-markdown-code-segment-selected': {
        light: 'rgba(74, 58, 122, 0.10)',
        dark: 'rgba(15, 15, 35, 0.88)',
      },
      '--dsw-alias-markdown-code-segment-unselected': {
        light: 'rgba(74, 58, 122, 0.04)',
        dark: 'rgba(15, 15, 35, 0.45)',
      },
      '--dsw-alias-markdown-placeholder': { light: '#f0ebfa', dark: '#262648' },
      '--dsw-alias-markdown-tag': { light: '#f0ebfa', dark: '#262648' },
      '--dsw-alias-markdown-citation': { light: '#f0ebfa', dark: '#262648' },

      /* --- Scrollbars ----------------------------------------------------
       * Luna's resting thumb is a quiet violet; hover is the sakura tell. */
      '--dsw-alias-scrollbar-bg-l1': {
        light: 'rgba(74, 58, 122, 0.20)',
        dark: 'rgba(155, 127, 212, 0.28)',
      },
      '--dsw-alias-scrollbar-bg-l2': {
        light: 'rgba(74, 58, 122, 0.26)',
        dark: 'rgba(155, 127, 212, 0.34)',
      },
      '--dsw-alias-scrollbar-hover-l1': {
        light: 'rgba(191, 19, 84, 0.50)',
        dark: 'rgba(255, 183, 197, 0.55)',
      },
      '--dsw-alias-scrollbar-hover-l2': {
        light: 'rgba(191, 19, 84, 0.60)',
        dark: 'rgba(255, 183, 197, 0.65)',
      },

      /* --- Overlays ------------------------------------------------------
       * Tooltips and toasts stay dark in both modes (Luna's plates), so their
       * label keeps a light value even in the light palette. */
      '--dsw-alias-tooltip-bg': { light: '#2b2544', dark: '#241f3f' },
      '--dsw-alias-toast-bg': { light: '#2b2544', dark: '#241f3f' },
      '--dsw-alias-toast-label': { light: '#f7f5fc', dark: '#e8e8ed' },
      '--dsw-alias-bg-mask-1': {
        light: 'rgba(34, 28, 54, 0.32)',
        dark: 'rgba(8, 8, 20, 0.60)',
      },
      '--dsw-alias-bg-mask-2': {
        light: 'rgba(34, 28, 54, 0.16)',
        dark: 'rgba(8, 8, 20, 0.35)',
      },
      '--dsw-alias-bg-mask-3': {
        light: 'rgba(34, 28, 54, 0.32)',
        dark: 'rgba(8, 8, 20, 0.60)',
      },

      /* --- Shape ---------------------------------------------------------
       * DSH rounds corners along a superellipse; Luna uses plain circular
       * arcs, and its largest radius is 24px. */
      '--dsw-corner-shape': { light: 'round', dark: 'round' },
      '--dsw-radius-xl': { light: '24px', dark: '24px' },
      '--dsw-radius-panel': { light: '24px', dark: '24px' },
      '--dsw-elevation-stroke-color': {
        light: 'rgba(74, 58, 122, 0.16)',
        dark: 'rgba(155, 127, 212, 0.30)',
      },
    }

    /** Inherited color properties interpolate without replacing component transitions. */
    const THEME_COLOR_PROPERTIES = [
      ...Object.entries(LUNA_TOKENS)
        .filter(([, modes]) => /^(#|rgba?\(|color-mix\()/.test(modes.light))
        .map(([name]) => name),
      '--luna-scrim', '--luna-sakura', '--luna-sakura-soft', '--luna-sakura-plate',
      '--luna-selection', '--luna-sub-plate', '--luna-sub-plate-hover',
      '--luna-sub-plate-strong', '--luna-sub-edge', '--luna-sub-edge-hover',
      '--luna-sub-ink', '--luna-sub-ink-hover',
    ]
    const THEME_COLOR_CSS = THEME_COLOR_PROPERTIES.map(name =>
      '@property ' + name + ' { syntax: "<color>"; inherits: true; initial-value: transparent; }',
    ).join('\n')

    /** Electron samples these colors once per palette mutation, before CSS transitions finish. */
    const THEME_FADE_PROPERTIES = THEME_COLOR_PROPERTIES.filter(name =>
      name !== '--dsw-specific-sidebar-fill' && name !== '--dsw-alias-label-primary',
    )

    /* shiki.css declares these two as `var(--dsw-alias-*)` on `:root`, but the
     * palette they alias is written on `body` — and every colour token this
     * sheet overrides is registered with `@property … initial-value:
     * transparent` so the palette can interpolate. A custom property's `var()`
     * is substituted where it is declared, so at the root the alias resolves
     * against that registered initial value and then inherits downward as
     * `transparent`. shiki's `pre` carries the alias as its `color`, so every
     * run shiki paints with the default foreground — brackets, braces,
     * parentheses, `$variables`, JSON punctuation — landed invisible on the
     * code plate. Restating both here puts them on the same body layer as the
     * tokens they alias.
     *
     * They stay out of LUNA_TOKENS on purpose: that map is the platform's
     * `--dsw-*` palette (`verify.mjs` refuses other namespaces there), and
     * these two are the only shiki aliases the platform resolves at the root.
     * Restating them also keeps code text out of the palette transition, which
     * matches `--dsw-alias-label-primary`, already excluded above. */
    const SHIKI_ALIAS_CSS = `
html body {
  --shiki-foreground: ${LUNA_TOKENS['--dsw-alias-label-primary'].light};
  --shiki-background: ${LUNA_TOKENS['--dsw-alias-markdown-code-block'].light};
}
html body[data-ds-dark-theme] {
  --shiki-foreground: ${LUNA_TOKENS['--dsw-alias-label-primary'].dark};
  --shiki-background: ${LUNA_TOKENS['--dsw-alias-markdown-code-block'].dark};
}
`

    /**
     * The settings panel's background, inlined as a data URI.
     *
     * Inlining is what makes the layer dependable: a remote URL here has to
     * survive origin resolution, the shell's protocol handler, and the
     * authentication cookie, and a failure in any of them is silent — the
     * declaration simply computes to `none` and the artwork never appears.
     * Generated from `assets/luna-settings.webp` by `tools/embed-artwork.mjs`,
     * which also bakes the display blur into the pixels so the stylesheet needs
     * no CSS filter.
     */
    const SETTINGS_DATA_URI = "data:image/webp;base64,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"

    /**
     * The wallpaper, inlined as a data URI. Generated from
     * `assets/wallpaper.webp` by `tools/embed-artwork.mjs`, which bakes the
     * blur into the pixels so the stylesheet needs no CSS filter.
     *
     * Inlining is what makes the layer dependable: a remote URL here has to
     * survive origin resolution, the shell's protocol handler, and the
     * authentication cookie, and a failure in any of them is silent — the
     * declaration simply computes to `none` and the artwork never appears.
     */
    const WALLPAPER_DATA_URI = "data:image/webp;base64,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"

    /**
     * Effects no token can carry. Scoped to the renderer's documented
     * `[data-slot="<key>"]` anchors, which are the stable seam dynamic styles
     * target — CSS-module class names are content-hashed per file and are not
     * a contract.
     */
    const LUNA_CSS = `
${THEME_COLOR_CSS}
${SHIKI_ALIAS_CSS}
/* The body's static wallpaper also backs the interval before the ambient
   layer mounts. Both use the same inline image and readability scrim. */
html body {
  --luna-wallpaper-image: url('${WALLPAPER_DATA_URI}');
  --luna-settings-image: url('${SETTINGS_DATA_URI}');
  --luna-scrim: rgba(250, 248, 255, 0.56);
  background-color: #f7f5fc;
  background-image: linear-gradient(var(--luna-scrim), var(--luna-scrim)),
    var(--luna-wallpaper-image);
  background-size: cover, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}
html body[data-ds-dark-theme] {
  --luna-scrim: rgba(15, 12, 32, 0.51);
  background-color: #1a1a2e;
}

body[data-luna-motion-ready] {
  transition-property: ${THEME_FADE_PROPERTIES.join(', ')}, background-color;
  transition-duration: var(--luna-theme-fade-duration, 450ms);
  transition-timing-function: ease-in-out;
}

/* This layer is below the application and its text, with no input hit area.
   Transforms stay on the artwork rather than a fixed-overlay ancestor. */
[data-luna-ambient] {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
body:has(> [data-luna-ambient]) > #root {
  position: relative;
  z-index: 1;
}
[data-luna-wallpaper] {
  position: absolute;
  inset: -3%;
  background-image: linear-gradient(var(--luna-scrim), var(--luna-scrim)), var(--luna-wallpaper-image);
  background-size: cover;
  background-position: center;
  animation: luna-wallpaper-drift var(--luna-wallpaper-duration, 48s) ease-in-out infinite alternate;
}
@keyframes luna-wallpaper-drift {
  from { transform: translate3d(-.7%, -.4%, 0) scale(1); }
  to { transform: translate3d(.7%, .4%, 0) scale(1.025); }
}
[data-luna-petal] {
  position: absolute;
  top: -12vh;
  left: var(--luna-petal-left);
  width: var(--luna-petal-size);
  height: calc(var(--luna-petal-size) * 1.4);
  border-radius: 75% 20% 70% 35%;
  corner-shape: round;
  background: var(--luna-sakura);
  opacity: var(--luna-petal-opacity, .45);
  animation: luna-petal-fall var(--luna-petal-duration) linear var(--luna-petal-delay) infinite;
}
body[data-ds-dark-theme] [data-luna-petal] {
  --luna-petal-opacity: .32;
}
@keyframes luna-petal-fall {
  0% { transform: translate3d(0, 0, 0) rotate(20deg); }
  35% { transform: translate3d(calc(var(--luna-petal-drift) * .4), 42vh, 0) rotate(110deg); }
  70% { transform: translate3d(calc(var(--luna-petal-drift) * .7), 84vh, 0) rotate(225deg); }
  100% { transform: translate3d(var(--luna-petal-drift), 124vh, 0) rotate(320deg); }
}
[data-luna-ambient][data-paused] :is([data-luna-petal], [data-luna-wallpaper]) {
  animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
  body[data-luna-motion-ready] { transition: none; }
  [data-luna-wallpaper] { animation: none; transform: none; }
  [data-luna-petal] { display: none; animation: none; }
}

/* Decoration palette, resolved per scheme. These are plugin-local names; the
   presenter's inline --dsw-* tokens are untouched by them.

   '--luna-sub-*' is the second control tier: the plaque, edge and type worn by
   ordinary buttons, dropdown triggers, the composer readings and the memory
   badge. Dark copies Luna's own second tier (violet glass, antique-gold edge,
   solid gold type). Light was re-specified by the user on 2026-10-01 as a white
   plaque with violet type and a pale sakura edge, so its edge is the palest
   sakura that still separates from white rather than a WCAG 3:1 stroke —
   verify.mjs holds the two schemes to different edge floors for that reason.
   '--luna-sub-plate-strong' backs the panels those controls open, where rows of
   text need a denser plate than a one-line pill. */
body {
  --luna-sakura: #bf1354;
  --luna-sakura-soft: rgba(191, 19, 84, 0.62);
  --luna-sakura-plate: rgba(191, 19, 84, 0.07);
  --luna-selection: rgba(191, 19, 84, 0.24);
  --luna-sub-plate: #ffffff;
  --luna-sub-plate-hover: #fff2f6;
  --luna-sub-plate-strong: rgba(255, 255, 255, 0.94);
  --luna-sub-edge: #ef90ab;
  --luna-sub-edge-hover: #e06e90;
  --luna-sub-ink: #4a3a7a;
  --luna-sub-ink-hover: #3a2c66;
}
body[data-ds-dark-theme] {
  --luna-sakura: #ffb7c5;
  --luna-sakura-soft: rgba(255, 183, 197, 0.55);
  --luna-sakura-plate: rgba(20, 16, 42, 0.55);
  --luna-selection: rgba(255, 183, 197, 0.26);
  --luna-sub-plate: rgba(74, 58, 122, 0.50);
  --luna-sub-plate-hover: rgba(96, 78, 158, 0.60);
  --luna-sub-plate-strong: rgba(41, 32, 78, 0.86);
  --luna-sub-edge: #b69e42;
  --luna-sub-edge-hover: #fff78b;
  --luna-sub-ink: #ffd700;
  --luna-sub-ink-hover: #ffe98b;
}

/* Lunar selection highlight replaces the platform blue. */
body ::selection {
  background: var(--luna-selection);
}

/* Markdown headings: Luna's sakura rule on the two top levels only. */
[data-slot='conversation.session'] :is(h1, h2) {
  padding-left: 10px;
  border-left: 4px solid var(--luna-sakura);
  border-radius: 2px;
}

/* Horizontal rule: a sakura gradient instead of a flat hairline. The shipped
   0.5px line is too thin to carry a gradient, hence the 1px repaint. */
[data-slot='conversation.session'] hr {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--luna-sakura-soft), transparent);
}

/* Blockquote: sakura rule plus Luna's large faded opening quote. */
[data-slot='conversation.session'] blockquote {
  border-left-width: 3px;
  border-left-color: var(--luna-sakura);
  background: var(--luna-sakura-plate);
  padding-right: 14px;
  border-radius: 0 8px 8px 0;
  position: relative;
}
[data-slot='conversation.session'] blockquote::after {
  content: '\\201C';
  position: absolute;
  top: 0;
  right: 10px;
  font-size: 26px;
  line-height: 1.2;
  color: var(--luna-sakura-soft);
  pointer-events: none;
}

/* List markers take the sakura accent. */
[data-slot='conversation.session'] :is(ul, ol) > li::marker {
  color: var(--luna-sakura);
}

/* Turn rail: the conversation quick navigation on the right edge of the chat
   area. Its marks are painted from shared neutral aliases (--dsw-alias-border-l4
   and the label ramp), so the accent is applied here instead of through the
   token layer, which every other surface also reads. The rail declares no
   data-slot; it is anchored by the chat scrollport the shipped sheet itself
   scopes to, plus the nav/tick structure that component always renders — never
   by its content-hashed class names. */
[data-conversation-scroll] nav[aria-label] button[data-index]::before {
  background: var(--luna-sakura-soft);
}

/* Hovered and focused ticks take the full accent — the strength the shipped
   sheet reserves for the previewed mark. */
[data-conversation-scroll] nav[aria-label] button[data-index]:is(:hover, :focus-visible)::before {
  background: var(--luna-sakura);
}

/* The tick for the turn in view. */
[data-conversation-scroll] nav[aria-label] button[data-index][aria-current='true']::before {
  background: var(--luna-sakura);
}

/* Keyboard ring follows the accent instead of the platform brand color. */
[data-conversation-scroll] nav[aria-label] button[data-index]:focus-visible::after {
  outline-color: var(--luna-sakura);
}

/* Hover preview: a sakura hairline over the shipped glass surface. */
[data-conversation-scroll] nav[aria-label] [role='tooltip'] {
  border: 1px solid var(--luna-sakura-soft);
}

/* The settings shell panel carries the uploaded artwork under the same scrim
   the app wallpaper uses, so both layers read at one depth. '--luna-scrim' and
   '--luna-settings-image' are inherited from 'html body' above. The panel's own
   rule paints an opaque surface token, so the selector also carries 'body' to
   sit above it without '!important'. */
body [data-shortcut-modal='settings'] {
  background-color: #f7f5fc;
  background-image: linear-gradient(var(--luna-scrim), var(--luna-scrim)),
    var(--luna-settings-image);
  background-size: cover, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}
body[data-ds-dark-theme] [data-shortcut-modal='settings'] {
  background-color: #1a1a2e;
}

/* Second-tier controls.

   The primary button already wears the scheme's own CTA plate — gold on dark,
   sakura on light. Ordinary buttons take Luna's SECOND tier instead: dark is
   the translucent violet plaque with an antique-gold edge and solid gold type;
   light is a white plaque with a pale sakura edge and violet type.

   'Button.module.css' puts the variant's LOCAL name into the class and only
   the hash around it is content-derived, so these selectors match the
   local-name segment ('_outline_', '_ghost_') and never the hash. The icon-only
   form of the default 'ghost' variant is excluded: this bundle tags it at
   runtime, because a square control holding one glyph has no room for a
   bordered plaque. */
body button[class*='_outline_'],
body button[class*='_ghost_']:not([data-luna-icon-only]) {
  border: 1.5px solid var(--luna-sub-edge);
  background: var(--luna-sub-plate);
  color: var(--luna-sub-ink);
}

body button[class*='_outline_']:hover:not(:disabled),
body button[class*='_ghost_']:not([data-luna-icon-only]):hover:not(:disabled) {
  border-color: var(--luna-sub-edge-hover);
  background: var(--luna-sub-plate-hover);
  color: var(--luna-sub-ink-hover);
}

/* Settings-panel controls.

   The shell's own buttons and dropdown triggers are not the Button primitive,
   so they miss the rules above and stayed plain while the dialog around them
   was themed. Inside the settings dialog they wear the same plaque, and the
   scope keeps that reach off the rest of the app.

   Each class segment below is a LOCAL name seen in the shipped dialog; cards,
   nav rows, appearance swatches and icon-only controls are deliberately absent,
   because a bordered capsule would break what they are. The :not on the
   primary variant matters: every Button carries its base class in the class
   list, including the CTA this rule must not repaint. */
body [data-shortcut-modal='settings'] button:is(
    [class*='_selector'],
    [class*='_secondaryButton'],
    [class*='_addButton'],
    [class*='_button']
  ):not([class*='_primary_']):not([data-luna-icon-only]) {
  border: 1.5px solid var(--luna-sub-edge);
  background: var(--luna-sub-plate);
  color: var(--luna-sub-ink);
}

body [data-shortcut-modal='settings'] button:is(
    [class*='_selector'],
    [class*='_secondaryButton'],
    [class*='_addButton'],
    [class*='_button']
  ):not([class*='_primary_']):not([data-luna-icon-only]):is(:hover, [aria-expanded='true']) {
  border-color: var(--luna-sub-edge-hover);
  background: var(--luna-sub-plate-hover);
  color: var(--luna-sub-ink-hover);
}

/* The readings under the composer — turns/steps, speed, cache hit — plus the
   context ring beside them. They are one row of the same kind of read-only
   diagnostic, so they wear the second-tier plaque too, in capsule form like the
   badge this style comes from. Each reading carries its own 'data-composer-stat'
   id since 0.2.1; before that one shared 'data-composer-stats' row held both, so
   both spellings are styled. The ring declares no stable attribute, so it is
   anchored by the two '<circle>'s only it draws inside a 14×14 '<svg>'. */
[data-composer-stat] [class$='_pill'],
[data-composer-stats] [class$='_pill'],
button:has(> svg[viewBox='0 0 14 14'] > circle) {
  padding: 1px 11px;
  border: 1.5px solid var(--luna-sub-edge);
  border-radius: 999px;
  corner-shape: round;
  background: var(--luna-sub-plate);
  color: var(--luna-sub-ink);
}

[data-composer-stat] [class$='_pill']:hover,
[data-composer-stat] [class$='_pill'][aria-expanded='true'],
[data-composer-stats] [class$='_pill']:hover,
[data-composer-stats] [class$='_pill'][aria-expanded='true'],
button:has(> svg[viewBox='0 0 14 14'] > circle):hover,
button:has(> svg[viewBox='0 0 14 14'] > circle)[aria-expanded='true'] {
  border-color: var(--luna-sub-edge-hover);
  background: var(--luna-sub-plate-hover);
  color: var(--luna-sub-ink-hover);
}

/* The context ring's own progress arc and track follow the same pair. */
button:has(> svg[viewBox='0 0 14 14'] > circle) svg :is(circle:first-of-type) {
  stroke: var(--luna-sub-edge);
}
button:has(> svg[viewBox='0 0 14 14'] > circle) svg :is(circle:last-of-type) {
  stroke: var(--luna-sub-ink);
}

/* The panels those readings open. All four are 'ReactDOM.createPortal' dialogs
   on <body> wearing 'stat-dialog.module.css' (three of them) or the context
   meter's own sheet (one), so each is identified by the stable 'data-*' marker
   its list carries, or by the breakdown bar only the meter draws. */
div[role='dialog'][class$='_panel']:has(> dl[data-session-stats-details]),
div[role='dialog'][class$='_panel']:has(> dl[data-session-stats-usage]),
div[role='dialog'][class$='_panel']:has(> dl[data-turn-usage-details]),
div[role='dialog'][class$='_panel']:has(> [class$='_bar']) {
  border: 1.5px solid var(--luna-sub-edge);
  background: var(--luna-sub-plate-strong);
  --dsw-elevation-stroke-color: var(--luna-sub-edge);
}

div[role='dialog'][class$='_panel']:has(> dl[data-session-stats-details]) [class$='_title'],
div[role='dialog'][class$='_panel']:has(> dl[data-session-stats-usage]) [class$='_title'],
div[role='dialog'][class$='_panel']:has(> dl[data-turn-usage-details]) [class$='_title'],
div[role='dialog'][class$='_panel']:has(> [class$='_bar']) :is([class$='_percent'], [class$='_figures']) {
  color: var(--luna-sub-ink);
}

/* Memory badge: Luna-Chat's '内存占用' pill, injected into the composer's dock
   row. Its detail panel opens on click rather than on hover, matching the
   readings it sits beside. Every selector below is this bundle's own markup. */
[data-luna-memory] {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: 1px 11px;
  border: 1.5px solid var(--luna-sub-edge);
  border-radius: 999px;
  corner-shape: round;
  background: var(--luna-sub-plate);
  color: var(--luna-sub-ink);
  font: inherit;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  font-variant-numeric: tabular-nums;
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap;
  cursor: pointer;
}
/* The hidden attribute needs its own rule: the display above outranks the user
   agent's own hidden rule, so retirement would otherwise leave a dead pill on
   the row. */
[data-luna-memory][hidden] {
  display: none;
}
[data-luna-memory]:hover,
[data-luna-memory][aria-expanded='true'] {
  border-color: var(--luna-sub-edge-hover);
  background: var(--luna-sub-plate-hover);
  color: var(--luna-sub-ink-hover);
}

[data-luna-memory-panel] {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: 268px;
  max-width: calc(100vw - 24px);
  padding: 10px 12px 8px;
  border: 1.5px solid var(--luna-sub-edge);
  border-radius: var(--dsw-radius-lg);
  background: var(--luna-sub-plate-strong);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--luna-sub-edge);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 20px;
  color: var(--luna-sub-ink);
  cursor: default;
}
[data-luna-memory-panel][hidden] {
  display: none;
}

[data-luna-memory-panel] .luna-mem-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-luna-memory-panel] .luna-mem-sep {
  color: var(--luna-sub-edge);
}
[data-luna-memory-panel] .luna-mem-legend {
  margin-top: 2px;
  font-size: 11px;
  color: var(--luna-sub-edge);
  opacity: 0.9;
}
[data-luna-memory-panel] .luna-mem-list {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--luna-sub-edge);
  max-height: 240px;
  overflow-y: auto;
}
[data-luna-memory-panel] .luna-mem-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
}
[data-luna-memory-panel] .luna-mem-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
[data-luna-memory-panel] .luna-mem-value {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--luna-sub-ink);
}
[data-luna-memory-panel] .luna-mem-empty {
  padding: 2px 0;
  color: var(--dsw-alias-label-tertiary);
}

/* Adjustable background blur and opacity overlay (user-tunable). */
[data-luna-blur-overlay] {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  -webkit-backdrop-filter: blur(var(--luna-blur, 0px));
  backdrop-filter: blur(var(--luna-blur, 0px));
  background-color: rgba(247, 245, 252, var(--luna-opacity, 0));
}
body[data-ds-dark-theme] [data-luna-blur-overlay] {
  background-color: rgba(26, 26, 46, var(--luna-opacity, 0));
}
`

    /** Badge caption; the reading follows it after a full-width colon. */
    const MEMORY_LABEL = '内存占用'

    /** Panel legend, in the order the three headline figures are printed. */
    const MEMORY_LEGEND = 'DSH 占用 / 电脑已用 / 电脑总量'

    /**
     * The context meter's trigger, matched exactly as the stylesheet matches it:
     * the only button drawing a pair of `<circle>`s inside a 14×14 `<svg>`.
     * Duplicated from that rule rather than shared, because the stylesheet is
     * parsed as text by `verify.mjs` and cannot carry an interpolation there.
     */
    const CONTEXT_RING_SELECTOR = "button:has(> svg[viewBox='0 0 14 14'] > circle)"

    /**
     * Format a megabyte reading the way Luna-Chat's badge does.
     * @param megabytes - the reading, or a non-number when the Host has none.
     * @returns a `GB` reading from 1024 MB up, `MB` below it, `—` for no value.
     */
    const formatMegabytes = (megabytes) => {
      const value = Number(megabytes)
      if (megabytes === null || megabytes === undefined || Number.isNaN(value)) return '—'
      return value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${Math.round(value)} MB`
    }

    /**
     * Inject the memory badge into the composer's dock row and keep it there.
     *
     * The badge is Luna-Chat's `内存占用` pill with two deliberate differences:
     * its detail panel opens on click rather than on hover, matching the
     * readings it sits beside, and it is injected rather than registered into a
     * slot, because this bundle is a theme and declares none. The dock row is
     * React-owned, so a MutationObserver re-appends the node whenever the row is
     * rebuilt, and the same sweep tags the icon-only form of the default
     * `ghost` button so the stylesheet can leave it alone.
     *
     * @returns the disposer that detaches the badge, the panel and every timer.
     */
    const mountMemoryBadge = () => {
      // Claim the singleton. A replaced bundle is not guaranteed to have had its
      // effects disposed before the new one runs — the module system removes the
      // stylesheet a package owned, but that is its own sweep, not this fiber's
      // disposer. Without this, every hot reload leaves another live badge on the
      // composer row (observed: two readings side by side).
      for (const stale of document.querySelectorAll(`[${MEMORY_ATTRIBUTE}], [${MEMORY_PANEL_ATTRIBUTE}]`)) {
        stale.remove()
      }

      const badge = document.createElement('button')
      badge.type = 'button'
      badge.setAttribute(MEMORY_ATTRIBUTE, 'true')
      badge.setAttribute('aria-haspopup', 'dialog')
      badge.setAttribute('aria-expanded', 'false')

      const panel = document.createElement('div')
      panel.setAttribute(MEMORY_PANEL_ATTRIBUTE, 'true')
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', '内存占用明细')
      panel.hidden = true
      document.body.append(panel)

      let percent = null
      let detail = null
      let misses = 0
      let retired = false
      let pollTimer = null
      let detailTimer = null

      const paintBadge = () => {
        badge.textContent = `${MEMORY_LABEL}：${percent === null ? '—' : `${percent.toFixed(1)}%`}`
      }

      const line = (name, value) => {
        const row = document.createElement('div')
        row.className = 'luna-mem-row'
        const label = document.createElement('span')
        label.className = 'luna-mem-name'
        label.textContent = name
        label.title = name
        const amount = document.createElement('span')
        amount.className = 'luna-mem-value'
        amount.textContent = value
        row.append(label, amount)
        return row
      }

      const paintPanel = () => {
        const system = detail?.system ?? {}
        const dsh = detail?.dsh ?? {}
        const head = document.createElement('div')
        head.className = 'luna-mem-head'
        const figures = [formatMegabytes(dsh.totalMb), formatMegabytes(system.usedMb), formatMegabytes(system.totalMb)]
        figures.forEach((figure, index) => {
          if (index > 0) {
            const separator = document.createElement('span')
            separator.className = 'luna-mem-sep'
            separator.textContent = '/'
            head.append(separator)
          }
          const amount = document.createElement('span')
          amount.textContent = figure
          head.append(amount)
        })
        const legend = document.createElement('div')
        legend.className = 'luna-mem-legend'
        legend.textContent = MEMORY_LEGEND
        const list = document.createElement('div')
        list.className = 'luna-mem-list'
        const rows = Array.isArray(dsh.rows) ? dsh.rows : []
        if (rows.length === 0) {
          const empty = document.createElement('div')
          empty.className = 'luna-mem-empty'
          empty.textContent = '（暂无数据）'
          list.append(empty)
        } else {
          for (const entry of rows) {
            const name = entry?.count > 1 ? `${entry.label} ×${entry.count}` : String(entry?.label ?? '')
            list.append(line(name, formatMegabytes(entry?.mb)))
          }
        }
        panel.replaceChildren(head, legend, list)
      }

      // The panel hangs above the badge and stays inside the viewport; only its
      // width needs measuring, so a content change cannot move it.
      const place = () => {
        const box = badge.getBoundingClientRect()
        const width = panel.offsetWidth
        panel.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`
        panel.style.bottom = `${Math.max(8, window.innerHeight - box.top + 8)}px`
      }

      const loadDetail = async () => {
        try {
          const response = await fetch(MEMORY_DETAIL_ROUTE, { cache: 'no-store' })
          if (!response.ok) return
          const data = await response.json()
          if (data?.ok !== true) return
          detail = data
          paintPanel()
        } catch {
          // A diagnostic panel never bubbles: the previous breakdown stays.
        }
      }

      const close = () => {
        if (panel.hidden) return
        panel.hidden = true
        badge.setAttribute('aria-expanded', 'false')
        if (detailTimer !== null) clearInterval(detailTimer)
        detailTimer = null
      }

      const open = () => {
        if (!panel.hidden) return
        panel.hidden = false
        badge.setAttribute('aria-expanded', 'true')
        place()
        void loadDetail()
        detailTimer = setInterval(() => { void loadDetail() }, MEMORY_DETAIL_POLL_MS)
      }

      // A Host half older than this bundle serves no route; three consecutive
      // misses retire the badge instead of leaving a dead reading on the row.
      const retire = () => {
        retired = true
        badge.hidden = true
        close()
        if (pollTimer !== null) clearInterval(pollTimer)
        pollTimer = null
      }

      const poll = async () => {
        if (retired) return
        try {
          const response = await fetch(MEMORY_ROUTE, { cache: 'no-store' })
          const data = response.ok ? await response.json().catch(() => null) : null
          if (data === null || data.ok !== true || !Number.isFinite(Number(data.percent))) {
            if (++misses >= 3) retire()
            return
          }
          misses = 0
          percent = Number(data.percent)
          paintBadge()
        } catch {
          // A network hiccup keeps the last reading; `retire` is for a route
          // that answers, and answers no.
        }
      }

      const onPointerDown = (event) => {
        if (panel.hidden) return
        if (badge.contains(event.target) || panel.contains(event.target)) return
        close()
      }

      const onKeyDown = (event) => {
        if (event.key === 'Escape') close()
      }

      badge.addEventListener('click', () => { if (panel.hidden) open(); else close() })
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown, true)

      // The dock row is the one holding the composer readings; the context ring
      // is the fallback anchor for a row that renders no readings at all.
      const dock = () => {
        const stats = document.querySelector('[data-composer-stat], [data-composer-stats]')
        if (stats !== null && stats.parentElement !== null) return stats.parentElement
        const ring = document.querySelector(CONTEXT_RING_SELECTOR)
        return ring?.parentElement?.parentElement ?? null
      }

      let scheduled = false
      const sync = () => {
        scheduled = false
        for (const control of document.querySelectorAll(`button[class*='_ghost_']:not([${ICON_ONLY_ATTRIBUTE}])`)) {
          if (control.textContent.trim() === '') control.setAttribute(ICON_ONLY_ATTRIBUTE, '')
        }
        const target = dock()
        if (target !== null && badge.parentElement !== target) target.append(badge)
      }
      const schedule = () => {
        if (scheduled) return
        scheduled = true
        setTimeout(sync, 150)
      }

      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })

      paintBadge()
      sync()
      void poll()
      pollTimer = setInterval(() => { void poll() }, MEMORY_POLL_MS)

      return () => {
        observer.disconnect()
        if (pollTimer !== null) clearInterval(pollTimer)
        if (detailTimer !== null) clearInterval(detailTimer)
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('keydown', onKeyDown, true)
        badge.remove()
        panel.remove()
      }
    }

    /**
     * Mount decoration beneath the application and pause it in background tabs.
     * @returns a disposer for the layer, readiness frame and visibility listener.
     */
    const mountAmbient = () => {
      window.__dshLunaAmbientDispose?.()
      let active = true
      const layer = document.createElement('div')
      layer.setAttribute('data-luna-ambient', '')
      layer.setAttribute('aria-hidden', 'true')
      const wallpaper = document.createElement('div')
      wallpaper.setAttribute('data-luna-wallpaper', '')
      layer.append(wallpaper)
      for (let index = 0; index < 18; index += 1) {
        const petal = document.createElement('span')
        petal.setAttribute('data-luna-petal', '')
        petal.style.setProperty('--luna-petal-left', `${(index * 37 + 9) % 100}%`)
        petal.style.setProperty('--luna-petal-size', `${7 + index % 5}px`)
        petal.style.setProperty('--luna-petal-duration', `${22 + index % 5 * 3}s`)
        petal.style.setProperty('--luna-petal-delay', `${-index * 3.7}s`)
        petal.style.setProperty('--luna-petal-drift', `${index % 2 === 0 ? 7 : -6}vw`)
        layer.append(petal)
      }
      document.body.append(layer)
      const pause = () => layer.toggleAttribute('data-paused', document.hidden)
      document.addEventListener('visibilitychange', pause)
      pause()
      const frame = window.requestAnimationFrame(() => {
        document.body.setAttribute('data-luna-motion-ready', '')
      })
      const dispose = () => {
        if (!active) return
        active = false
        window.cancelAnimationFrame(frame)
        document.removeEventListener('visibilitychange', pause)
        document.body.removeAttribute('data-luna-motion-ready')
        layer.remove()
        if (window.__dshLunaAmbientDispose === dispose) delete window.__dshLunaAmbientDispose
      }
      window.__dshLunaAmbientDispose = dispose
      return dispose
    }

    return {
      /** The plugin-page sliders register through the slots service. */
      inject: ['slots'],

      /**
       * Install the stylesheet immediately, then bind the token layer to the
       * theme service whenever it resolves.
       *
       * The theme service is read with `ctx.get` rather than declared as a hard
       * `inject`: a declared injection that never resolves leaves the fiber
       * PENDING, which would silently skip everything here — including the
       * wallpaper, which does not depend on the theme at all. The stylesheet is
       * therefore installed unconditionally, and only the token layer waits.
       *
       * @param ctx - the plugin fiber's Client context.
       */
      apply(ctx) {
        // Report that the Client half ran at all. The Host records it beside
        // its own state, so "the plugin is active" can be told apart from "the
        // bundle was never activated" without a debugger.
        void fetch(`${PING_ROUTE}?evt=apply`).catch(() => {})

        ctx.effect(() => {
          const tag = document.createElement('style')
          // Claiming the tag with the package id keeps it out of the module
          // system's "unowned style" sweep and inside its unload cleanup.
          tag.dataset.plugin = PACKAGE_ID
          tag.textContent = LUNA_CSS
          document.head.append(tag)
          return () => tag.remove()
        })

        ctx.effect(() => mountAmbient())

        // Wallpaper tuning: one fixed layer between the ambient wallpaper and
        // the application (same z-index 0, appended later, and #root paints at
        // z-index 1), so its backdrop-filter only ever touches the artwork.
        // The two sliders on the plugin page drive it through these variables.
        const TUNING_STORAGE_KEY = 'dsh-luna-theme-wallpaper-tuning'
        const readTuning = () => {
          try {
            const parsed = JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY) || '{}')
            return {
              blur: Number.isFinite(Number(parsed.blur)) ? Math.max(0, Math.min(100, Number(parsed.blur))) : 0,
              opacity: Number.isFinite(Number(parsed.opacity)) ? Math.max(0, Math.min(1, Number(parsed.opacity))) : 0,
            }
          } catch {
            return { blur: 0, opacity: 0 }
          }
        }
        const writeTuning = (tuning) => {
          try { localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning)) } catch { /* storage may be unavailable */ }
        }

        ctx.effect(() => {
          const overlay = document.createElement('div')
          overlay.setAttribute('data-luna-blur-overlay', '')
          const applyTuning = () => {
            const tuning = readTuning()
            overlay.style.setProperty('--luna-blur', `${tuning.blur}px`)
            overlay.style.setProperty('--luna-opacity', String(tuning.opacity))
          }
          applyTuning()
          document.body.append(overlay)
          window.__lunaWallpaperTuningApply = applyTuning
          return () => {
            delete window.__lunaWallpaperTuningApply
            overlay.remove()
          }
        })

        // The sliders live on the bundle's own plugin page, through the
        // platform's `plugins.bundle.config` seat, keyed by package name and
        // rendered between the page's description and its component rows.
        if (React !== null) {
          const h = React.createElement
          const TuningPanel = () => {
            const [tuning, setTuning] = React.useState(readTuning)
            const update = (patch) => {
              const next = { ...tuning, ...patch }
              setTuning(next)
              writeTuning(next)
              window.__lunaWallpaperTuningApply?.()
            }
            const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }
            // Fixed widths on the label and the reading keep both sliders
            // starting and ending at the same x, so the rows align vertically.
            const labelStyle = { ...rowStyle, width: 150, flex: 'none' }
            const valueStyle = { width: 44, flex: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' } },
              h('div', { style: { fontSize: 13, fontWeight: 600 } }, '背景壁纸调整'),
              h('label', { style: labelStyle },
                '模糊度',
                h('input', {
                  type: 'range', min: 0, max: 100, step: 1, value: tuning.blur,
                  onChange: (event) => update({ blur: Number(event.target.value) }),
                  style: { flex: 1, minWidth: 120 },
                }),
                h('span', { style: valueStyle }, `${tuning.blur}px`),
              ),
              h('label', { style: labelStyle },
                '透明度',
                h('input', {
                  type: 'range', min: 0, max: 1, step: 0.01, value: tuning.opacity,
                  onChange: (event) => update({ opacity: Number(event.target.value) }),
                  style: { flex: 1, minWidth: 120 },
                }),
                h('span', { style: valueStyle }, `${Math.round(tuning.opacity * 100)}%`),
              ),
            )
          }
          ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
            name: 'plugins.bundle.config',
            key: 'dsh-luna-theme',
          }, TuningPanel))
        }

        // Load the widget's page script. Idempotent, because the Host's own
        // index hook may have inserted the same tag first in shells that do
        // apply `tapIndex`.
        ctx.effect(() => {
          if (document.querySelector('script[data-dsh-whale-widget]')) return () => {}
          const script = document.createElement('script')
          script.src = WIDGET_SCRIPT_URL
          script.defer = true
          script.dataset.dshWhaleWidget = 'true'
          document.head.append(script)
          return () => {
            window.__dshWhaleWidgetDispose?.()
            script.remove()
          }
        })

        // Load the pet's page script, on the same terms as the widget above:
        // delivered by a client bundle because the desktop shell never applies
        // the Host's index hook, and idempotent so a shell that does apply it
        // cannot double-mount the pet.
        ctx.effect(() => {
          if (document.querySelector('script[data-dsh-luna-pet]')) return () => {}
          const script = document.createElement('script')
          script.src = PET_SCRIPT_URL
          script.defer = true
          script.dataset.dshLunaPet = 'true'
          document.head.append(script)
          return () => {
            window.__dshLunaPetDispose?.()
            script.remove()
          }
        })

        ctx.effect(() => {
          if (document.querySelector('script[data-dsh-luna-opening]')) return () => {}
          const script = document.createElement('script')
          script.src = OPENING_SCRIPT_URL
          script.defer = true
          script.dataset.dshLunaOpening = 'true'
          document.head.append(script)
          return () => {
            window.__dshLunaOpeningDispose?.()
            script.remove()
          }
        })

        // The memory badge lives on the composer's dock row, which React owns
        // and rebuilds. It is mounted from here rather than from a slot because
        // a theme bundle declares none.
        ctx.effect(() => mountMemoryBadge())


        // Bounded wait for the theme service: another client plugin registers
        // it, so it may not exist yet at this fiber's activation. Each attempt
        // re-reads the service; the retry stops as soon as a layer is
        // registered or the budget runs out.
        let disposed = false
        let attempts = 0
        const bind = () => {
          if (disposed) return
          const theme = ctx.get('theme')
          if (theme !== undefined && typeof theme.overrideTokens === 'function') {
            // Returning the service disposer from the effect body retracts the
            // layer when the fiber is disposed, so disabling the plugin
            // restores the previous theme exactly.
            ctx.effect(() => theme.overrideTokens(PACKAGE_ID, LUNA_TOKENS))
            void fetch(`${PING_ROUTE}?evt=theme&bound=1`).catch(() => {})
            return
          }
          if (attempts++ >= THEME_BIND_ATTEMPTS) {
            void fetch(`${PING_ROUTE}?evt=theme&bound=0&attempts=${attempts}`).catch(() => {})
            return
          }
          setTimeout(bind, THEME_BIND_INTERVAL_MS)
        }
        ctx.effect(() => {
          bind()
          return () => { disposed = true }
        })
      },
    }
  },
})
