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
  factory() {
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
    const WIDGET_SCRIPT_URL = '/dsh-whale/widget.js'

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
    const SETTINGS_DATA_URI = "data:image/webp;base64,UklGRgx6AABXRUJQVlA4IAB6AAAw+ASdASoABAAEPnk4lkgwMjQrqjPqSoAPCWVu26ysu//3wFYQmanykDSej8aFob7//S3j+zubTo7wJ4ZtATTCvCf5z/tr0+fJJ58nXOafodYvv3V11W99TR53Lz0/Pf9HzBerP+CegR/eP2O7OPlhdXfHIr4V+Bf/j0a/Bv+f/8f9vzh/D/6X/9/zf/B6/+6/v/y88wP/75y/gH/5r/4/wzGE4TC/+5eKFGvozOJ0GAm/LotJBFaFh/SdeYwjjPePyGi4Wmsfct1N/2TzoLmZgT/1reOpwUOolPwszFlf193gjitnaSZKgvfrG2U4LJVZhTC4XlHH6wm79LShEUst+1YsnjvxdHTHpXA8hyikbN7s34yxrX6yGUhakIHuqV6N7Ma77l4oUvadom68qjhRltZKeWd12pjlunVNYCmqXYgPKl7rKAMh2yfiW2MQLC9uRUexxNYFVwtkGpPoHqC6nDG86NfvkTMHxEJLgZcuHiLXwb+l4/cJTP2S+sSLqwUDHxPTXq+CIcbKHZoO4UbN+A9Ki8MwJ5U+TzCfmTnuZ7M25BoaIsi5OPpVVYrrDeIOSNIOEq2mAG3wbasYatLDbOMtQFVePSG0TNZ22ySjaGtkyU55knzgs38UAeEHGNeXmwQhccZ8FM3g+imRcoCmWAzdY/ve/cW2KecJWyU6cp/Bi+0NI9hONzb7ZZTbTgTPYVnd5u0bPw+Sa19S3uDmFa1m9K6BKPbi7xJ6TTChuUivHj3ux1vvZ6mwuoZ3ItB2tBvkwLBH8Wmr19T3dBcEwBuLjGyP2LdeDHfR+G62H6yMBoC8gqcmDi0SBs6w/tFcwsOwNJsrYoNT73scCFoP02uIobJ+ilLWbLl54Sh7EGvDA9FkZZUDTESU9Y+O0XhY3shuprjj6PSxx3iHvm1Zyk6vT8rTHvkK81KMvhTb+hu+TIEb/Bvnycero2YXxECAi/mmeDPJryyfywyh0pXWmRnpyXyi83nwvYEuzU++pZDg+5LCgm0A8ziMpfuw7nYLQqhfXDFHmJUQMYhMLJpdF+hf49X28oFbTxD5VsQh3TUcLEKXSJZ4VYaJeG//5Z7sHd0AkuAJeG0gIeFaEZirPgXnRLbg/HiR8H+L9MxpAgXtpY+Mcqp7JcqHgPRLjbGpG95kAVbeH0UiSfTY8pJ/niYOKj2VGdKeXxXpbYpCwI4F8NffryQFYTM/sUoq494r5/auUYbtwAj61MH/p5OztiTQIn8OgLiHl0pLtrfH8YvhRDoWM+65YiHYc1LkhlBHrWFWiqo/pY2xwzHNghAkRoxMSMfGFpucIiIhgpG/VoBfWyDNWncJ6XJRkWJgz0H/xR9/gdmGB88xFNDx5Gzn1pb2iaYikxUTpWG+tWahwpP5S66BirnlC3SMTvpZIvk9kyJB4cLEwRmC1Jtq06O9JGWkf+C9gXXFf9d2Via/5pxwppoFTNKTPdnMkGH4oCM6X1foqUZp7iA0CP43QeblTVJ3sanfNbyShN/wnoxd38Se+KQxMyaUWIW5mnjdpYn//OxADaL/vGeJk5dmg9nGVh/ucT3N+mtoloHHDvzQZtYi/wP43x7zMfmfLsn6EZhz/g4IatJ9Rmx820pDPFtlzxx2jQuZp6W5SlURltgLkwLvKz9+D4B3LETY7knitUWB8x6HjCSincd6R3AFOHrnmwhebACVY4IUtrt3cdMV6ZdsjwuTXhwZ6bu/dIiqYwxFrDy0ugakfD7NkuECbO1s8oLK2ajP6KAlJWwxoLQjc8ce/d9Lu5uTpg4L2ermquNRIEdDbuD+sPbhKvA7Cd/ri9hWWzP6PY9YpYMjOxr7ND/oBF8vDU0hzGVgmVcwo72tmrFWeiYZ1vSrmjuGZM3sqdrM1MX0KFnS484rwYaLxg0SL6nZ9TXM2Jj2WbN80LA85Bjg+EQOQhRksSOAvzDuU2ypoiRSBrVwOhRmGDB5L6u1ShTeQG7E0LONu3thBljU4O1nPz2zEhPfJ1+P9uE4j9zxuZHE3Me8YBI/bXmSFdGIYfOktSw5Mz7PTymMyvTgTLlG6aIClbZI+MZl8A1gnEEz+Rp3f7hsVR3YWNfUtgAUYFM3GDZlJgEIBHvd809bXCDfx7k/JtbEpGTuPbnMg6Y29pmodmOL+OqJi2CVmvM/FccjLlPo5Fmj4EKrepxqe2IJu9NBfFKxQpm/QPZCp/4vfh99fCqQx9iKBBEIbfIpNFGHFtuZu4ghY/Ygc/atPpJgbFUqEqbsXXqyXcgjWpT6SZtE8MMWs7MZraDrqa3V2ayQlTqfJZxhwPhDVOpvJaGOfWbIavqwUY3OLwULajA2FGDYCPhF+GuE59uAK2NuU96DGXwuS3SuKzItgvckUlucs9rSpwVoYqaMVxyxpYEf1snGBOx+PCmYXwZa2Zotu1VPx+vTV+ev6b6QLyBPeikql8NMrXG7UL5WSQ1BWzj+Nq2OHbIL8WFlhsAIpsbncgacodascrEYwG+VMv8ALsgv+PLJ/pbyeGSEikZvdGCp23zLMpWWUO4MTo7m85GIvM5qRsionqbVhBvgGFSQStF3ZLr+5patsSllzdO+tJZVpwj4Ce7AVOYPdBPrYPG/l8q5rxxYCXj3Oe5XP4V80sBIZCeJtKzcliK+hvt6SZziUSaQGUEMmJl5F/8EhteBuXU6PVMtRVZginPwmB7mDPWnwojj3Tx7GRgyTOzwOQhEJLxOBT52+X91WhYQiIHxY5PjWswliv+2U6dt5UMELdN2zxIdD7tojvYw+AhCoL/Ri3p5hSKTAZj8qOgMT5k2DCVKAI7tYFYDNheQcw+M3Dq60SsvF3mtBkE8KbNO9DvzReHpXNyj0nfkJNpool276+ureBZhhl9dRFgyPEpzyN1gAmPu95s2IuaiK2KMyZGCyKHsQ8xkMD1+ddzHFFV7eaUCLHnJpBbBLvMOXJhflYooftcYG8LCwDSqmWX8ALodFDUZ+MMR6bIfMi3s3P9lAEfrsLV4rsDfeWZGSlE8BFRZ7Ca7Gh31U4Wr3L47nA4jeJXQuaZDoDSFrXyY46+c5h0n+tBpDXn8j07cA+9DicVkaPSqJ1wZ79mXoJ+OjHF5WIBol3Uo3MWQ7oheN9d0clXO8AmPNX7zGblTCkdlYGLPdmW3IfZCaIpp8IAeHHmUVQEhf4f8GOUvgF1giUO52lrPGlchJjAsBwZoH0+gxjv3I7GZ7z5mBkn+vNjpYpmS4pG9BHremPZp1HJsy2UxxObSmPgaDdPKfa0ElX/WOftIP8e4NjW9btdw/ay+lj9CpsxFlrb3NY5gLZVptenQfrlzhfPPITaMW3ILHvi0AivCBfxvwjxipR6IZgDvd6Z5iTQDnezbDzJSI7hSvOjFp8W2g55joiUOXP88Y9rsI4sxq5bYDV74kQFMFS7XY0xYa1m5Q2HAUbutSzhIG+ei9rM9yQ4XwcOCmkwvG/ydGzCb6LErblkD/y2Ko9YPntr8ZCkrx4XW6OMM7y5dTYFUAIL1ri7qRUawmRJLoe91qDLXo26bxvR370dSs0AtC6JPQGVFSJLNBxTGV8hXozOEW21xmRu85bKMPGiHp81wqFDyd8jFSEMHAUToncV7Qxlk8cTBzR5dXWpH8gsQup2gk+Tiu7JYbcu8Abrzvq2gRvU0i0an/ewdw+pvxCQsOamAiTsFlh/McU6P9VrxOU/TdwCjNN5mfqUuHtBgFCn0n0iwe4jyRs6nen7qUjZsAimyICiN/XexpzX4XcteDSEwcTtmLWo6HsWQfmpWyB5RhAKIJDmU4Evfx+f1iT3hsiQ/ksYfngJxmzFkYGCkSB1tzd6b4eD4GWFnLrPRAKU+ehlh2jC5Kcq7LqIBKeiPZCxUB/eGfzQFvYFR6hu2tCdB+bbCpe/4NwM1QZsrVbLLWw5fEj01ozSkSoRpUHkqKWCOj8OxlduVsLbKF5lMVwWSmVlj1r+F2VOi4ym69G3x66whnkBiL+C543t3XhZ2qLFvKWlMvEDi84/F9enF3Scby/DfMCClWwwzrQodCxO+Y2Bi3mwzZLh5KdP+xFNp+uH/KpyZhWhBvJzZoBtfN20oULz0VMEGTxhJAdDMCU+87OCkirmvYAe/3CdwhPwvi9qBBHHzx1DZQ1S4GREgATSfWmbNUh+tGmqbXWwJJQygDJKPpbwScQV2z1KbgsnW9fkbOEtgz8/vO0MM3ThOGFcuMJPSxpdTknzhV++a5YEIQRzIkFA8ayxZtFK/ofG3qR8UQs3PNV9hN0a6aIDc9jSSSXaeuLBnpWmI7UZb97ibSSZoiaMF9DDDHP8KihvCkU1V3ePHLpliaTdMylmlJ9T9/8WUEOt8Z7Sta2YUDK60DWmggm3e842TBC2LOIJNgxrodDb1RMf43SIf6jNlrrDHpbFf/pSdq7+M4PCGLBi5Owy+oX2vu/CtBASPH126nJ9zSea/uPiD4iB06aMMBax728V7WpWmtwwGm3jHs8QWfUztiriZ1bQjcBg4GqznSUQHOwphH2bhj4BqP+TgQG1+Vz46TZO/Fmi5z/N0fFm3HWVaWvC4RRZ4P2BmFtkkWzlWPt18fOkibtq1eeUnSUCCRIoA94fLTo0m/adpMQ/mMq1PlYCTLeGUS3YSbp0Wnz7AeCvITzLfn7XFaCvEaq6x2cbUV6PCKaCiYVPMmzd5yWXi9Qj4ANG3kJWUtqFj2t6tzgEKwO7lZqCrN+B0tVF1okCrWI5EewXW0eOSg+jfRfbbwm4c2ilwci5GDbi5eKltjFNtmIn0aZRhIGruXJpMYGcve8yPZed3VL2zAz9TRdQlR0dYCX6Zjb30I9K5PG+8UlcViovxklUtCI9ilDU8kN3Xbq4ulnN3lKBP96HV/jhrGqpE3bkjS3KCHYE2tuzNx3juVOXzpoz3P+3Su+h2L5a5wQfkBUDqYbnwkUoZINmStLfAuGP8N1i29VS7J/Exj86fsl3aypsMWZnmVrvvfPJ8cDHjpBB47XKh7f1ojGqk1DNjz9trtE6TH/ZPb7QTP6buAKmWUsK/fWbVhVd64nzY4i5M905wyeKo+huQ6ZrFN3YaGaCvHFTWyc0esDES+HuvP6dxr0M7APXygcasF2DNWDbTyBvNkQ2fSqT2mSKJxrsUohqcYPD+le91pkxkqe+CP+ULmtzJ3yBuAdBqyL+ckbMzn8TdQffi17KOLqeyMEjYZBUtTFpbhmyvZ09z3RzCH5y/j4JN4v9v8xseOtxSCJoVGta8QIr++XOLVN4k53L6W8net83F0aitYOW57xreg0fMlmfTm22lhJNg1XgVVO/yhNot341QUA4EA3OognMNAOqexPK7vQ5ODoJfrFVMRhbsHhcFkyCa7dTyDW2EIN3x6bFdoBHyTIFrJUmJJFHjFzouDDDY8Z4yxUCin//OyzRO1LeJp1FNh1w+7TG2/rR4HyjwemX9JEK/tKfhvErqKwYYFqV7uwOihhW11mJOO/5dk6f5UTVAOikSVKe+TQYbI3wEeonCTkGvqGLiWQJsC0xeiarXU5G5m7kvfeF1NhrLdjhC8X/xHrkczP3EWjV8aJbbssHxTMR/e8PXOxPBbrnk/6ctwa8LWfAEUlv0lvy7JRy8tXflkFY9Kokef19qSpeXPFdAGN4Eb26KMCTcMvgtH6q+qU6UoKYhw7Mst4LtQnlqTdqYLLmZ0UKLChjJZYrK7mCTuZNvaukmG6C0+tNVSperTDIQzidvyY9bKXatorr3BNSAEHoE81LRCJFlXBYtiowXmykdq0qgdlVbaJg7KaK12mN0VmHgdZzQ3RxZpl00TrGq9bbvPMVVfTKV3UZXsgo3SGQHvdllQPf7M/385ryzrbm2l7g0v1x7s9gf+V8SJjVmIxDDGsJJwteoVc81bMv39iB7twNu+772BmHK2bNX5TIz/+fJ6cJ7JBDdHBA0udZFZvknMKwHF5eVofUd6gQwzOYBipiwBXfBVBg33RjqUdKkPlKVRXPgT2pnGsx2oab9WU9ZHFGmkE2cxTc909guy7VuBYn8Dms2GHCsqGnzhXugv7MH1KzH41rWV4or8umbC7R+ks+znSzftUljueTE/4ZonEyYosyI2VeDLh12zy8uyBH7DqZbm5g1cYgfWV378ZRYgnNaFQ75XkO/FKM4IJTi5ljRyNjpw4OYPjbuL0GuIXWXAL4LChLeNPxvHzFfbfEylvmQ7TexAILvXB/DHlodCIWASxmQrMXBk0DfMPf3JjTnDADyokzV77964px8+nJzkjlGFmrDUXMmwBzeiRCjnLf86tS+8YAUf778G++soxybRkKe+XIT6tAWRimazeKmIIXcQqbxonzb4t1YGXZY1li21R+iOCWqHHFGtXUN+pP5+wuqyopaZGlE3dw1q9FdDNnracK4F+UyTJvyBkJeteqMuVXKB1GJPO4BWoJtj9RFauyIp931Lrl1NQMI6pQ9xco4Xd9zlf+uj9S5bDqedC/stev2BVDjhk6i6cNIwa+4thMsLarLpqwHdr63z3mxCvB3OlPjcArhadcpaj9H3ld3+VdVr7XiGhMzKHf2F5iJm47vk8YvkG6U80pk2Iacze/wQjdngIteNIdf2HGaHQLyxBwkKyuqy49ZDzJ+7F/9Yb10F/VfT5hCJWisMgoJHF4VZLgS9ys/B/gyNOr0VXoKj80fsco+WpL6avLdHwNRTtCNZ0VrvNd1xEBGZnF/646NKvfary9wQB2ClPuZ7tfYhtsh3l5O3u+f4oO8dtliL60ddQSuuaIQqoLOAedHrO6Z4md9Lyism0fYJc4o+r+CYw91VxBnYhwR9+e5Qwzx1FmBc3hWyaMhMs/TWXraPzJY71K+RSvjJamXTI7JFrqevn2zrD6Jagz3ZcEZne1cFZfVPgl5Im+cFh7F2DD6olBBOywjBsPsyTTRvTX3zQlpprqcsosey5P4E51ulb1UJ9dIlyjEZryAwJKBb5RVVIsYzFcHJz6jMJ6n0zx9VA3+ULuL3Fb+7Zwo9LpNhkysK8AkIqiIAiZdt9NUkHjILeyhSwfSlfxbNY0EPrqhbjMhMcWdxKMpKFe8cUoeMKT2EIaJV6/A7snlfz3UOCjSt8pUdwgD3615CIuKqkouaL7pHjqqIVpZsPc7t7vXWTRBVBPVhTg+PGPJxKJF05mHQmyfuDSEnC49UINNHL7mTkqpsCPfU2ZShIji1UqktcLPWcRyi3NsWEx/t7sLUppQtz6dNUT+eY5HK+1OoIdlx4plPUVNoIk58IaFjTRMEM0w31vnU0LvAvkmJRp4XCmgXlrT4HmIb7fF+2RNEEDnqmYeV2xLNDhfE6hiBhmhugVip7iz5fybOvQy1nCCITCPeW2MWdv/h1G+S33Ftg7KD1E6ygyjV9J58nf3bnZcIaZQhu+2Kv1L+1HRwVRQEPjZkW3TfxEATUfVzxDfFnaRfuFFg2JcnIWdoEy4YDWr3gXdptZPA4hLOIMK5EuG7kHAEK8Qeuaae4j4ICAkvsETR5B2XAGbZAUtr/RmDgLBT3DIRtqFPApd7wTDEhyPTA7NFFUiP7StO13Ykvg/8V4ze0cLO2ANH52igmh3ums2ltXx0jZt6dX841BguShjBtLxcKoJTGGOq4+gt3lY9dR6SbicNql/fPY41xBcPMfRD3e6/dN5EBZ030JbnQbbqpmp261rfeFXmD8mbOhayf7cRaNte12MX2OZvHGcdqjCMLxZ9vIqCtufk7l8eK/sG0arUCoUyUwR/d7tczNXiHuqOXqW8ZiZPaxlBLVFNFVddOcSZEDUUm5l4gp/k133ZwD5ohghUgYbvTD5amGyx4pxXk3cfR19ehN4rcefwVtOY8rrLkTbx7N21uZap+sqsDkHvO/rSCWQAdZxyJa0fhytgZ3Fvs0CR92xscTHWs8ZT6s+enNJbLlj7NJlQAp0DSnvFa4B7pnyhNt8qpONPLXQIPtTE1KECGIU4NUeby3H+QQq68NV0lZivPPyogh1annpQ3lYck+P8imGSWrLZdic9v/9m1xawMTQ5r50c3WTQpohQzkexGyyuU6pOX1S0CaTUZPZ/SMeojyOBtQN6bMcvXUXClWV7AS/IvV2QljNzX9F81pcJCx1AAMCRJT6E+j2hiyNNn/RNLGqLikmt7tkBOxGay3cWfiOCWDgbjDqTtcEpqOUy2cRgJR/M1v57CZJHN6Ifnct1CeRxhTvB5R41NfV/R7lpFoLVdRfsTo81OE6FmWqpIYvOnhiLr2ZCoAKwqJp2h/A7nJQEYKxv+Pr6obvVfp1uym+7jXCjg+nLLphrHm422Efz1xjm9c7kgifYyfO0dLb9xMVBYjBNdyQcd2FjXfzhfwaSckamK2I7bhvB8Ij4QhzW/V15+GNeR7vs7Wfi7VaYONRJDx1jLmAPPzDzr3Ld2XBRU2wo44L2hmJN6JplTgonDXJvYGRlYmYopp/zArSsLzI9rW/tY0ip6j3Qnv/vgdzNay9jApgRUL1RXI5Q4vq1sSD60gEFbVHWSElVLzYzarHh/z/6Z/u83IkXTbu9xtut+rzQG3TqKILotFoqKiTU3Oh6ewmNYnYf5pqD1PhJ3W3TMxkO9lIlV0uWeVJ6uT+iup86Iofh3XiQ2hZtsxnIvEoFk/8zJNeZrO/rk1TtVQs9kQD4V1/L0j80voH07X96UwVgBIYA5LPeexfVV4s1DXPN97RkuQEd44+wWxh/mMhp3JwfVgUimc/Sv+UpLHnfLd/3R50bT1BxVU1WGfHMnmqqPxW+jthH+H864t39K+enX2yBdgWFKyJOxzFzdiurijcjfsMEa1Y1PiLx0g2s61I3mCQUd627uJp8RtQRcJsoHwK5hBAzniTyWJhyhzHHNJmu6/Ug6nB1dqMJQ+b353g5WVLXUd3h8UWniIyknqQuqkwkSrh5fk8QS5yRBFsC2vINAgIBzql5B+TTGmLm5hK98avQBxvtJEkWf0gYM1XxgzA2DzRWnf2NexS5tx0oDtt3gOX441EP1QN4GFNUsGdWonCP9bFlSfRsA24yqJFVLE2wy9i5U8T65hGH7O4VC+Bxn+k80HZnPUSkng8E+NBdN1N+XlpxpYaU1ECSD+4vHnwbYzEL8W8w/Ri6pB3w+m+5POiOzzbWJPHSME6MJwkdrtvZK+R/wAe/8lUMzvAVlQQJ+O2mZrj9c3PMSf7VC7HSNPjhO8FGlJ+9VldBdSEK0kdd19WKC8qVmimekzgRRluqw/kMI06A4WQYWyGzcUJ8Dc03R1QxtWF5O+3z0OiiBSe/qeKAhbB4k7rk3F+W78o/mYz4+XtxoFTLGvj1OpTN3j5SkWZjxqTPyqY53790Hx6r93d3cfxKifCt01COAF973HhyynbtRdP23CwWXS7V6f4TUAy4wGcDalNsYRW0R0S5m2HGhH7i1DoHSSMG/AS1QBMrGW4dP6CQdEhbgECwL/xHXVqDTePEewhcGwIN3CX1ZGHfNA52r5POTE7+EZ5Lqj8x4xvIv1vwQL73f2yZN16mFnK3oeFwpi7ta5TBKlWSJAQAp7oQ3lNRlicOVAmviEgXLURNYEwuIcosQTB1kCjblGIXFJXi1k3czmrbImdAmeu/0nzFD3aZhhaHvg2t1N/iB3xEZJTYwN4TlMcVQSVbhTdz8MbzRjUhcKa1Ueg7981KF/YY3ZgRr02Tmh+lg4ATyvmLK+WcK/H0UmFVxjJmHJVDFI2FOmPF1zOV/jlYVeAe+zfed83D05mV7yfUnk5Xbmitj5i9Xj+SugcptXj3xy0Nw4WZHhqj73w0mxXYfGk5ZvAVlATPaJYT0QxuJJNAmO2xR+FgQEH+8yrfnRnH/OjmJEHPga21mV67xORpP8AeqVUEwcInMYa+d5yb5UMFdPCY+MOxZOYxlkpVAvu81LL5Pg5gPMGCyDe+y7x3CtgFJolJF5f6IZM4HdDPsjNlGrutu2h5NNWOSAvF+qXtZD4YsjibNxR9ONyKq0rvh8KiqSR3YI0ULidgVFNPBYvYOpiCcBQE4fRTRveMrlLxHX0NHFRX5YpW0SCrznGo19OszC2zN9s6IUETSh18CrcO4Wh75yKdowVQimXJMWtz0Sn6tjCfkmFv06//0zaVMs4i2UQ1GN91qvv+4WzkHFXRF7x7ozXG0WwSvvIn28Xs8XU9D0NdtrVnLRjMhQ1cD217Z6BRgwS7959sFwnyiIBRdBrL0tCtBRfsz70bbWZ/MrT9uQrXH7csHdszdXa3yYIwZ7se1BvPkIcQV/VaXm+rJf6z7BLrEw9trT3vlhvFRRgJdtDSfRLEigRXWCIuxwE8EtUuoVMJMm6zvmuyZABcyii+Mud5D0Fo28kDbZAqh9EAG1Bv+lExcIO8MGil63oWMmLO/f9mw2/5Z4rGa68qgD90E5O/LYRUDjD4GysJVVTitHjH5AM4rRzTPQ2nKc5QVy6dtLLzwaDyqgYI9ctRq1t6+gpRXn/0qQ+5/WamCX/VgzeFiw/lufMeehM6jMrLiWz4EB1Xb0r47dXs4LjHfECg4aIPIzay0efkm4mQ9N9PGP/8wesxPRuQ4spxjESujI5HvEa0WXsK4aJq8slCl2Ihzqxq3+GcqWih5qeQtFNtJlDwHWH/7H+7hmj0P4gRYvfmyvnt+8AXx8UzR1sLNwUrUELVp6WgbazkRchrebCj//4opLl05nIjwdD3Yymbcw2AmkJs4+oL7iSPNmZvb86j0l1DQtrZxAhDNS2Y8Km5ZBPU5z5YfeRhuRzNxyvUdJgfFKVyQNWwfFLW0jbARSMBPTmtKZN0q5yMLgXRPPKHyfS86q1mh3IYtkVaJqWIEn8J0lwa9F7AzjV7zEmW5OXCnFPmiAMFTschU57C0oXCa3cNtQ6OSqTvc9D5sGFZdmw9DXUUa2+egToBRa7nKLXFDkdp+dyox4NCR9r/xRQ0xfaVcIhWW1+MBjCW+2/Bmpww7P7qxWGvcLjZ0INNvrFa1yoLqhh5WID6ewxZR4Rga307rfzpKSCQf3ZMvfLRYQf9MVy2DRJJTgr0IaPWayoAkYy1H7vqO3nDv3vIpXqklafSUiWdGToDOUz4jiD7OkTq698/IZy7+3RYaXIUgvWbrA3qOPJ1dQpXukGapNu5rJOwHkCc+1yN6az90S5wR2WqappRjq8lblEjESjgxatk6Tdah6dnEr/oloyk8412cbYEoaLax6TcCq1xJmtwElQAmsmQGmb12SGOtigqICQFMMgfPMAD/6Jt4UKbncBQX1vx6Auhb4RaH7TjH1cL2rp/ZGLnX8v8gsQ4tHKo5QvOQ9mFdNTbGILnXquG++bML4ANPRKfJZHDWyy1kDHVTpaob7hKcNXRSpy8glIINKFowOm1/vPRaBQZkPAvteL6ofeDOlhVab98HvsdZ179kI9OoVbc4gQorif7vzJ9g1NRElUsJ4GvTrEXi98lgRDLgkbiWPehJp/4PlAfsO1cFk3R7evlGEAFD7Kb78OXJ30Mi12U3UrAKg9Kk9PEHirOFEHQh2MaPD1+7bjdFbnrDOchw75hY2PZvDSCxvTMvDD2kjne+KXW4FzASD9pulhRWr5sXN4/J3aCiiMIFL7sXizcuWx1YeNJ4wsi9x7LqIsoXyna38N/LfKd95VMLEe3oq4KscOSWb0KqSyo1AAvvT8uz5L9pPRcEXTG050ur0f/Z+JMlMxHHgOCUYzIDeqTB5O0ayYhM3p/zazEoeNj0wStSjn0bSd53omPw2pGFEegryPXtUFkYTss6xhvKn5P/jedWnyQFlapW9R4q333vAhoXu0ihrCGeKoe4e3xH86NVFaIKEISWbsHBjAaq7Jdkbr7Y4YDsj+V87ZvwDGTaKbF6pFOpQPSOorg1bS4rIeL2pcEMYvX+5ADxb59e9yRoHkaj4UwtgD3aE5sSxhGzHWGI995yBU6dzmqnzUp8y5YxIwYMglPxRMBIU8KzUo4d0xfrFEdouswQoYUc1ts7Xl9I3adlODIuY9F+R28jpHyMBksj/XRM7RocSjKRKrBlmesI/02/jfc/e6hpfmrwBg4c9Gyd0wsknIjLv251d2IICV5T7lTxgF7wV7UgDsRZRiXl/YMBjdb24Oq1VZgZvfSw05NUvZGFHRDRCL0A98u4ttFHbSy6OXF8MsMstanLTJaZRnfzaienP+gVtOtSEdQmcNuUHV5l78EPDZiEGMlIwaXk38uKRzTMr+D8Bod0YN5OIrgi4Gv4o9cBDOhkXDIEX/XPNCMNnlPKsF5eaQBZAnyuxIa2UeWNPlB9W0b2erswmjuOEBQwa/9e69+2YHMHtWM294bGV151S2a2RLFReA+WIOJMLnQr0WZ4eX33oD4BEsOBtOhmK3IweAxjeC2AQg0oZPhAz48IqGXYpQYeGn9R2NEfWAY3fTl56EjTwJ2Dh4y4e4mpNJW34iUvYaW0HnTWvvpF5WRC3aDX8ZzEY3/2Zie7fjB2iHxGCNb77ighIgKDs8tEo4fxVd/lzfaj3hVRB7JIVDcEumQ6LnDi/oSHA3nSL68VY19QpPx28cSGxEDGZMpQ5JzstealwdafFuxn89vom6MNraMWOiDT3AareXgHg2lhMN9h8dLIy5hFv9GWM4JyoEWuw+S6e4AbvbmSrWB2abQP1GZ74qhaOgo1qwUXrBA2ohU1G57wCAkP7XCq/bSARnOd24pw2YZeXAY5Wz+ao+h5QIoScnuiRLVoEcQ596V9A1xRaMum9XauLPWvb2dJCWPtiSEeFzFhXvpKjyEWF4Rs1YqkdtnBkmNR6WC+U3eqReWOMy69/+1nQwEkX7jFikl+ji6xxftmqZBtGI9KJfCXBDXCjHsUNSGmKKKUlsC5oWx4W4nhjXo9lMkZT6yUYJo1k6VoEVZfJediGsaSgJiX2Yub1VEerCuQBP1Mn3s31fNqaS5zEEOUOWGCyNadEaOb5s6xKX8pIPzNc6Zjl7UyQxmnpLvHYbInF3uVz2x7inhrbnhtYdKnlltTPQfEkGZUK70mTrHK3OkrcdCXzV5uwVtwLJiXMUuFbvS7U5IFIIUMsNaZXHPsIL2BAjVAiIhNIhXdBJjkBUlDesqCJEybyCtBabtXgD7/QR5zjBDPRzwFsxjtDiVzWByanjXv4fj5x79t8RNyzlcJlaSLZislG68ckIqnLMooerDv3EIu4nZyAxvVDx4DVI3JsbJsCBI6bN5B3ngsn2GHeyWxxSRnbV+Ebyuz7IBinPo7LT5IVWwTAiBwT5/WQxgDMld6UzmRumymqxSX/VP9v90WZpCEUy+lvG2LG6vPdSWHTWyhkMiO6PBS8FBnVFhM5sDWJX1Mq7Xe2r9DdO8ycx4uGfI9xSBIGAmM2UvpoSMX6R5i24SytDHQ+F4//wCGcXwGsD0sB7nOTpmm8lPznyXSqZ/sx/cZ/y6zlO3C3yjWLhhlxil2UZ0Nl/oVrQjWyfKLez3KK4w/cJ6z9P0n2I3GzxT3DtL/4NPnJKBx3wolj3UxsQY4q1hP9Qj/xqwGJvm+NXXlnmjhEDp8JrBj+RFDu/EryjDH0012aK0W9S1Cr+z4MoCI1jHgc0G0t8Rw8zdo5P0w++8PMIuHpr+ziCIMLuZtsuyqhtT340zLSIAP7vOA0FvjUb82ksSOtktxQaeI2vbhjZyuP6ERxsejWxGi9iHhTcdG3vXxYiBeshRPiSfokSl2ZsxLs9IcuT85rX3iN2d7lbD/bRS32P8vo6rLM2XbLU04ffh+Reb1EdSVVTWSxHcyZzvE/8exdTow8flHcDvaIBO0xJp6Byw1SbJtpXyJROM2bLD/9176///MV//k40oMydM1HSE//j83jyvo2M5dvsGA6SRQC//YrcQ3gAAATNOpFIKyvxELOFM0ApAYZ6ZWAtW/F/fzjyCt1vs2OBX4X2SiaDg+g5fTRuoaAZeJbbqkv6uIhnR6QHE4sD5gDcsjqLk2w2Hz9FUHHtLbiXgWeJrejANa+tegfxb/W5BYcDPiaZd5qgKdNdGdwTcmzvb6THZ3wQ3qwFHQ3c+uLOSXO5Kc1+z8q1v2qQWFQu3VXB/MGRbcCio4GkAr/pDe97EjexhW7KKZwFLX5ioaWf1BqTNfb3Ltaf9fo24UHvv3UKPPsSmW9TfuHa49sBH/hphkZfT4oNK1NYlwkQduhZQXFdoKv+86JnV6l50ZAGV+TwSuRMIqfHd53ExqYRXLsAAAAAHwXgPIJWssWVf2LfgMhaFSJkdgZJb56f+uE74yT+beSqqZvKkFPeM+MLBMDy3BL9/bWS3fymp745sPhsJLslQok5A1TU/XyuALsFgwaflhd5RyN0qStFCbCNY0eyDKwUg8vG7zQ10MyP/ulZDRA6OPb6vRxJqjGG4OO1bov9mPOgYQh4n6V3ovqUiqQaGIEnbBpxHay2dzjK4xhIJXa5A6MFkG4y0VOELEXJBT5SF3sfXHwAkrL1PFu7y6VR95he8YqHwCflvGmI1/j40rIXUN6xpdRq28Wxh2Gq+LClFPmSC8nKgzzCtCnbf7w1M4jlYMFBxHYy7pf6W2iWWsjRq0cWnMQupa0S7NhTiAeVp9fXnXF0rPB9yu7V/7TOPgtwc6T7Yiruz8bnYdtREG9vj/+7zYMqlPamX7rrYroY6yGq8Tps/VAEFjVfGES8goYWF8gABBBMQLv7/dhMxytzsBh0l6ImSXYZjKXmnDwTiaDWxX3HSg9gFdSVdR9ExMq2Nmoj5MqUSpXrHNHkX5ryIBXm8JDUsOZ9PGRgQXxkzoHkRcd2ANPhHkL15L7EkgnnZlbut10ynC1NfQ6LgmdjwrXAisYok5rORT1pPVVyJbTex0kNr1w/4MoLsDY3Veq5CbX+o3bwYN2bBBxORPT8krpnrvCCi7qgk9uAcVoPBIpsK4Enxbh1DA2AMDy44Ae9lQQe4my630IXUBGmcefgsuD7m2i6+Wb0PepWPNV+9Cdt8PhSzNtYSFB4qlURKzOYTYEHUOhao1WdiDegjRzl7xJVXnWgdKpQgfIs13/+QYwH9pXvs9VN06AsiwCF8lIIpdNRruj4fBks1e4fljkrdhEyZUtRN42t4iAjqb3Vr9yOcDe95r2VXJOjdBAO9yaiCluHqCt35VC80HzlRij4piShE7Ssp/qJJVG05HACLRAAG2D06AQHJ8/Z4O/bjud4neO984PhM5sCGXeUbUeg5SfCAEIJ0/XbgHnHeCZ6Dcmnxw/zGhqUj9j7Xpv/zRmu7vqpFgLE9pVUvSJR2wng9nqzZN1MjpnzVq1MzhftMrv8dzq9lSLb2GwyWXNRITA5ZBVjEjKPs2VDHvY2qKJHk/aUaj0ZxAx0gPaBh1Xd3fNwt9fnBUwPDJ5JA1YH0OZuNy82cGyWVAIZlYxbmbiSGkOZ9N+Egckc5cuP1xG1BGhZsgqslpIrtkWGpB9cKBs00K1ulHCTYcWPAC0/BymNTovt16SeyUtfxezY92OJMV47lAOTGPKGJ9Ukx9OAH9x9KrGpfkh0mX+wSisyRReQ9N1NZybAxyLtLPDqpWfeMzWOLp2tC0P17R7lh7zR0jjsUpQjOlwrWM3+IFjaeCL+A8+ttPzQYAOcGiHSO3Qa889dnapd6i0fUVDYeBrHkJN8IHr6BMgVWaSnkVsd5a2ToeJwmiq/Shr7mRApAJNypPRtUxburpnMSbGpTEte6EfiYkitI+L9qgA6fMIZTBKVA2p/z9wPAJ5IyRcdUZubsSSfcB0lHmMidLr3BpD0c3VmOnrIjREYl1pic+esOys6z2t7dbqt6v5FJNIGHQQboZcjM07+YlTSCKdJBryJHNZmbpmD2ZFyARtJH0REv5YRNwACPCLMOD6AZ0dUh0/AUmtbyDKWCxCIoUrSD1dNoFTMkmMDYrGlK7JgGBa6lkOkJEpZVYw/KcHH26Y2W6yFw1ph9c385150YxhKL71jP/8g1uNefDRfjAEFeo4LtW0hMfWbO0subXkgWU0bJjEBTLrQHmLxlyvHi+zgJhS/Ibgq3LNAndHstyBVBM/MDcw5XAsoGxRVC1DUZjbl4fjT8C6pPXkrpcZnYWdMwQutXxfxUOPDGUh5U5qYtGfZXJ68RRudrlsU5AB15VRRqB8y/QQti2C1w6k2TmeFH2HBquFnF6uaAzuoBCIzZE2COok0BPRxNZexl7Gh6QaFzzE+PuuuxavKa2zR2G0uLedboqRCQt3X3JlyloWIVURTrA5zz2NHt8RjY1lPO+sZJj0E/icL/4YgrpQb24sCp6zBIJ3aqBDsSVAWDy38hXhxjEKFF8TgR43fnni3FSDza0RjRNRJ9ca0j5bIvi0A+DzYfOGTBzJFnU6/3qVuGVBcjNHOl5o8QCHwLhjduPHWFuEUu5nqzyBjL+wDSp297grW0Cg6GznFi+73DG7C/gGEvrd8R7XdC/wKU2eEWDrAIlffoDspiPGEYkHLALhfP3i+ChMRTspb1dA1ErC5MB5+/WQNREd1NypzcZKAOEaBP5ZTgyJn0lxNy6MllaG3iw8VXeh9AOmn/LviRyqaQ8KBJ3y1PUD1vqvbCeNuZBpihpJGruHC3bYDwokYQLDEppst558GLAvKZFWBwqVMxw8Qrb3O9pcV5JPRCPWJUOVwt8FMwzFa6++IjDG1CEe1wDs5eAqGRnUr4VP/o4+05TF+NShXKVI20DbrYATZKwRI/0SaofhpBdse3jZ0aYm3CmKt1ZFr0Q2Y6z3UKNAJkRbmAkZZw3mZRQVcFDo5sPF141JCFa1GMU3Ew0Ah3iLVYNJsykWFosxHU+zJaPW529h0lqeLuT8lNjakm2N5oElds07N34/N5Gg0zrE1CzJX71Lalo9Xkl63hgh5glihDMK+tRyMXBKLl4tWH8GU8ZTbLiUQHMzYDZO8aY+6FHeCCOSwD3oIlUBEU3pw0qbvqtUACRcrycqRoqvbln7q6k7EP6M5/rrGBIjc+CLzjKLBsvxWj1tglUjh9kZAABNvJ8XDxvx6V4LoO/0LfUaPt9/3VXHOw/I3dIF86x9cNGOPSwtLzUIeZosjSKFYIOMX/bHKg1uraiwa8w8cNWVkK9DL3DSFbnbjmfrfJwm24yflUr1QNy5oHXwNsbVAJvFR/TG1Fhk4A9b6xdOPQ5Znpvt6sIhDWACTasd42wQ5ro/701GQVkJkpCENelElY0RfHMIerEEiWW1gqYwSnQaw08eQ2XWPYP2Wtn9I1SAsRm/wFSdLbkY12kt4K98bS8p/3PXYHOYtt9+FxDZDBy3o1jRx67wrR+Uua2Q4s2u1JuduZ9Sh8tX5XdbPCK3XcFH9SZ5sMNZd2BgSX8Umid7fmdrg2hhhajXxMZEQPQUD//Ti3Ky0Gvz+e2wTfPwhLigUcbwxNmqW089R2U3JL9iadUe2VMLKfkEdgx7TCD3f86F8PTRsKQU+N5V9Gnay/uWCDC+1FAW3xG2Zwuath1kbbWfgOp/jOYFb7jCibnTKtP/mcpi6on4oYuCqbdl14OZlu2MxH51Am3I604XsLLZq1POje/pi75wNxtrkI84tHt4s0igI29j2IRRJwr7SZj3nsm/NAjoeyMg1LORd0T62ryAW3+znxKHHVNpDVxyeles1de0WHNKBHkPTpXLCRskRxvCKWtYFVsgjajfWbln//i3DJLYfe9PmYvUfxMLG3MP5RKyr2L46zxBh+QpKs55ySs4RtH236sd8DQuBbmX9hvFDH0xmgZjK1B5mQ/r7QnaU9cAiNtHIvjiLygr5YsR4EG3Oe3My6ksns9Ox0Dq7Rou1IDMLMkQI1yPJv2QMPNEESyQVyYI2/8JrS2PBUPijQL09aSAmQevvx248cYevJqVM/mpHIb4FKyZFFoElnVVsGhKSReozPlNs6SpFrPdhqTM/HXeBkRYjrOv7VaXUEa3l2P0ww0ADwEm5B6TA/UaUPqRWY6ZbHFo1YfBd/TBnXhmo7cKpP2ofHE723ANuh0+0McFonF1N1+8NNlKFI01i2+s7/X+7Q0zge9WhwNbx+6XRC1Rl5J2X7BayQlZXcnh0VIZWg5s+OoIr9dUppw4rFb1CTbDZjF3brJX0W8enDzMd4XBS822RUQIV7VTtUG75ZzvJ797YiMyRbkbzngU8x4tkpuGQSVPXhEDFLXZTfv1EuPAD6dQel2m3+X9Pr4M/ap3QFCDTbuL1fERAbaTtAJ6WxDGAASod1IgTb15GbwCfwlzvVDH5R9AwQNzuidYfG06Fbke6AlV6GZpEK2eKDb5mGwDB2Dd7qQmDwIfec85otmOWeqctR03scnRoy2lDX2kvk1mCesccIwCnZOANBY00JMUQyvhBdZ6WvPXJlBOrm1XI8CYbOUBUliKdIRJuwIVK/96MeqZEgdQiVR195AY6WYFYJIKS76CFvoUqRBK5TlxPIrXGevFQdETFE7JOiDKrLGTy9OwaMj3B6l1Sa3LUtztgMCojklSo3gALed/GJstz/dowff0R1mIcLJN5Yh7J3Wf2EVwcsEncKMtJQysfLbqUeIJP1unHZL0qWr1h7UAP2+SZgwdl9HWdzmVQSGAcHohq8LTA6NFMzCfFrjQgLHPUccyb3nZLDNK/0kRFCrTusxCRLSHA+aZp/djK/2T5ze7nLLeZ5zrn70TqTrR1HXYUMEAWfIzuB5M1Icc9OmlTxw1Ew3j0M7HI1X1NmvTw/cCHOKQYT3oy6XI1GFS+kwGRaAhKBD7kEDbGYv4Qn+9FhyQPrj5n3cMVaCdI6/fvy9lzY1eRb6GE3K/OBbg5jFL+sB5DYqmVxDFr9ISOOxZvpplaS4Oqrg+sG8tz4cI8k8faKFu5SApYgz3O5GjFTNVKoOaJ85eqrUF0CFSelZDdcKaDrG4rE0WbkeyXLdMtwmR9YxlNzq/nSjcZhI1pLRcUg5ulk2rXsL+ATIkSZWqhA5kSYoNTZllsDAh4AbjB6Eoqa4KRxJoli4o+vZkj2nMTeXcC9NdV+BSn2AaO9vFTDeOZh/Ze+JsceuFVMmocO4SIIHKCpZKBpDbn0FEnUBK7Pw4/Gb+QPbC7WVKr6Aom1zVFOAAEqqXTStLA0hq4Q1PEush6rFkSCfuowXGeNE73vznutFLoAnJpbaJgY4buDHqQ9h4uL5cFCcsm0j7FOzwPxmoVVysXQdSnAi+7YfT5zBHhKAAdkd37iXcIxmhS1lR/r6Wzmrj8YK2qibOayFCkaONocfgils05TRBE+Ju7m+l68yP/B6Y+GeWJDTO9NeH//NIiYQdUDum69jxQ4fRtCbJI4RfbUKQIFbGS0g0mr15Zvito6bVNPxF802Mld6NYv/U2ycnnMhtLs85W4P1CM1okeZcABZFaH0Y4jnOyOAOxAiPPPDqCOro9R9iIsU269d8N11RtMgvUImigAxpYxidIqb+mEzxj3cazBqa1DxrzxbizVkBfdVwTxZC/pcodqkQACRxczm+1I8BOM9nR7OgKsjJZh+qH6sJCvh/rHjTFBohqFRHbh+Iwa5e6UH1HT3QHetvLZHq1SOzZdKUUoexjNYTHfSPHIbVPEfff1WkH7ZPfgkbFbys9BtmASClSepME4oPD3vg7xJWw6UROXiDb7jCDt3iiOiNmJb5lYenH4RmIJSGmjvpahaVSUQyjPap1yFeUipw3+5vMaVrJc++HcDu9/89bU7LIMcAjwZM88lsf4drb8iJ5GBu2qK5LN62mbx0Th3cmBXlMsndTou348icBnP5W1IFfqHny/uP2Hc7dPkY2SO+bOpz0YxnDtGdmrewzxLapIBt32fptnAo1bhfn5kHNQYJz1qQtqeB3CkKhZgZ9NOijgO3Y3Xcrcb9lJi86n9M+LgxGPAQc1fx7RZHgRv3tkbWiXemgVzpnowxjyw6J//LsyIYZkVDKX7sHi45WAuIE3Jkwbk49RILY7MWuLGe3kTOKV7mPr8ydF9gRE3C5mek6T9dqkdLtbbKMnNM7s1PzJ/IjD9/lFWBCJLVrxRCjmQ2OEkxVMV1ETV1z/rB+uTsS0ZGxHw3fjnGV9K8SZS0oNii1JZ14xIn7vGxghDXeCuulYdisdwznZdk4jxPKZfby1r7QorV0+Yfu+uSPNpDV3gTo6RnMFUJcvitJkzQpop3Cr0j2D5cHeBeqFyag9luC6Zr3RVZgkloPANn6kPjmMKB9yTHFzA2woKN14getb5xo5zMZYG74QdTY0aJNIVL+bdvizVWWZJGQsD0Ohkq7tDY6EAEJRPsZx+jSGcJFBHpVWnhBfvP6m3thv3pTllq+xoNa9BCkrUwfzfCr4u+etIH9Mf9dRUh+8i91+3zfLNDv/y3fdWv3uPSJSTYFsgKDHbssu6lcKi0EySZ6DeK3LnqYHf9bCmW5FMb+M3Bit/qwkNMNZy3xXCxiJwkr16z6sIIIYKb9nvZh51bYIyIkrLx22TKRGCsXaSAg5dfev0Jdk9FA1vhboXjFkBnORE6rKfwnqWuHSAPRAx+qVWhmEhBjazbQc60mwztOrJouVDhV1eX/QNg27urwM1ag0fl2sswjqNFPUjXH47rbbK9JO6GytMZLwDnPl29wsY2hbpNJ7yYNwD4v6M5OT0UAvf+/kzJqeJJL7sdQ0G9wuGFEH2EmZrTs1Vmx69mXqhtdbe9qItskhHn9QcZPsUcKXpOC4K+7mOY15A7C+x9DROUeET59KTnKeTvKkiv10sBRn3nO9qyELmrxhxL7rojr+e9+QDNQJqGuwmyqCgh+kXSHD6YjW+0K28QE1kvnamSHTVLpd/IIAFJsUPwN/ZS7rRzH1/oUMKPs9Ce0Kjy3G4opCxNEx0VipflfJh27+KwFaHuaEjCA+wFkkK9L2ojv+caclRQ1JbyfEF+HC0m3vTjTLl7QEel3K5fn7GuJ/jzGJ7TmlG9Hrxuya+iesmnhdHFh22MjvBDW+KYW51fHPpCYWMM/gh8bS4E4bcALoIa5xHRTHtVCJPWWycI0Jj1GlZ6nDW826kNWMDGPlEchH6VtEpM2PnuAMNqVtI+rPbgyZpQ6Y4jdXSSPOM7Pi+m1frccTG+6GGpgyRFHZ04VGaoeQoUpk9X5BL5/bLjYMJeEUfHZ7LKBF5ALsqm8waQGqsux9WrhvuYBLRmCGzTit9eVfpmxXDSJHK09JZvqRSwlOI+FCQCfgGcj1TOTodEa3Ml95NLZ034ogw0sSwskusCagzWHP4yISP1PbV9iog2DBFs0A4ohSr22lNNu1JTuzOMvI+Ga6NYzGFzHEToxoEWg3NCCxXFdTuYr/j8LXiIOKlSF6pae+08Estlr8BmeWnclQqbspmkMGyKKYAyTJwT8khLvra2cqJk8oqmQm2sms/1PftsOswF2Xx1LuTz569cj75IIvqhjCr8n5YVI1wrbc2ll/XbXY/8Jsl+1HnVQeFaeAc98HqItTO+G0XfVJlezV7mIJMQIeIyusczRyDB7/OYfKoE4K1MkKSOQsb9jOkgPxdkiNizI0vx7Ptc22R57DxqwYR/px+NS5uWiY9TxMPg0zyb+sP7jxKSj0qfwKPhuM8SJ+Iv7yajQmJTHcm3Xz7VdrEaMiaX1eUx071GWbgw5DQwr5TBy/prxQbI4RetYb8JqwZ1O+V+cx/8gDe9UeY2B+hqLjqppJMCY73GGlkYPONMN8e/frJ02bBJl2a37dLbKgvxu2fwNJXuG+0a8JN01q6nMErJkoUiTRBqIFTnr4F08F5pn6V/yz+daaXs26Gl6e8bwt6tCnn+Pd7G7VdGdnjIZzSFau6Qf0iVWjkuZi5XQdfbEZX3QEs8+Cte75iGGdaxTO8qwTQISXDiMTDylX7IDE1ySq53oJ2J942Yb7IGJWv+Qp+Qx2KB9wI65ifunrH+NQi08WUvN8XjkswCu+2rmdkMOdzWBdc3/teZKS8XQE6vQI9w87+NJFR/T3yY2rx9TuGib47zBzD6YBc7bcQ1CpSkvgWyKADiDslelYC9nTYgC6uwd9eO4vmpRNRlTDdD+obqbRb0Jg7Nm+Uw/li900w6WhVf6A68ENC4zBjap/3XsTFUQWcKSqUPNAh8pKMyqqWU1BflqWRmk3w+MGIdScnG/iyymvFZdnVLyy9LsV+5flueu6ibjKNl2BQqy3xJG3EpOULzcGw0QhebuVXg7tCNk05H5Zqn7szcC0scPM9MWBD4HX51GhJ5+QbIEeZ/aMueqIspYfVyqDgIRz5DxcRHFF6oDnQJP3ayQm0Pc404WPPFYgNNeTgtUjtLXtJ5H/+Zr1Y+zicJZcNS0GEeSRbbwwD0oFQ3i1ic68NzTXchP46QvK7UJxgPmdo96Req7Y7mkNO57s2KvrN8zmzwh63GshYYY2MJa8BX/zsmJh321X+8dVwxoeThwEgGfJetcvrSP5YRzU4eHdgeOyS6hZ1CNVojvlpZl11LDU+fnslmaD2hCRq7CBZjTnHBZKKwLGgJbzO4yg77Vyet70CkaCULFIeNlTPfNfF+S4R9iLNpz7Q+iQ3+9xK9BMkEwLqJCTSjofQtOhtlCo4cUB9S9MhSCwjTtnTm91gc12LBQLhnE18yGx29KsQocgJqEnDLgqxtAuU9VpIH+PKCac+FYaXRDPE6Jaau9ZJLBYpxFEqe+s6E5yTt9DXx8PKyUx1EPUc6wNRUN836a4nuQ3Lbkz33CxRXVPapP3vOObZfqJhwy/HVG2T5x3GYa3qjwTzeIOQXljmWPiNUtBZT5R4V40iJ5515R/RwvBx9e/HxIkPRDJElotM7F7oIp5Rnn5p+BBnTLSUP9/ozGLiLqEWxZmDKU/axKNztyF4ACEd/nzc5WqkNKjcS1bFwpaI+mcorErh72lJ7K2UGMk/P6FxPLxL56iZm5BCzWlKG1Zeuo6xMUlyX9AD7c/LoXmW83uqX/OOrJRBAB2Ld+r+y28Z+39FJG1IPEwlmuPpFOopyvexkjkN9UCJqZJgW5DtE80rQKKhHZ5nMNGcOT96tOK7j5pa0kGuL5fgqBbXZcax578cLr+uqVjF1ZpKoC52cI1AkqW3dLEq1jJIVe66VBZyk8JwwouULXYegTAA6PqPf9MC5uJcVrac3FWd4ARL5OznVdhwp8UuBTLQoK5ECMSYdEH7GbqVle7trZzYyS7tTZbFS1j0M85mwocxrphULjAsn98PI8dY0CD273yfGXtp11F9d1A/tpix6COTDLdEyL3miomw5mTrYVTBFLO4ssWUJqjoi/Js/JGfrxiO4ZdYQAm3+4rlj6S/xWbWnBxEfkVEe/p7wbPsJwxC/qiXesX/Pk5URdAwVBcPv6n1a6lr6zCl7wSNvK9i8+s5Z1qhMRLrWsI8p3S3s5YaOane5If08/77HR+OmR4TbDSJ8T+G6CETyIKzsYzUot7xc+63y6/nCCKzBF4yy0Hl5+AS5I+hc29QIHouUcWF5u2RcZ2XpMeigyeGYqvgACbPUsCXvV3e+7vzGoWm64AdVNu+XlbHL/1OmesD4ACCbczqtdyD5KKpMpGSWgsWbhDQAMuxaACIH3XyV9UIZs0t6FSCH+Pr/kV92Upwd3rcfUmfVwkX9lt8eyOYVt+WZ/vlYKAINnLdrY9TcdyZrTxEbfQT3VneFB+Pk0ULj8UAsXI5mI+arsp7qfChA70+CkuNVp3eSNudkhtX/qqBqAuu1/0bdA+q5cEFYgbqNnf5U/mmVWPIa/U5PbR1A6FsTWO0ggHiOmp4DLjTqiMw6Gy9UQIIdJWw2ncf+UJ6fNzcHZcTb4Gl97+0rEyps6OpjIx90uHAIwSwEvms72ujswY5LgUI0Cpk58JuyPcMUA7DocpuuADB2nafSjPgHCbSeMBx4wrcXBSkn2o7BbeDWsoHSmPuFxHTnVqv8DbkdNkWvxkxP3keAZHUY0X7tQ6VsE/Ld8h3S87eJhuK8phxzH38vQPctYzHMfGpoZIlVhx0VgLD6Dr42lqwADrixP5usVTsyISbhqgM6KcHdBdHZ0MJ4l7fssxXrZ/x7OTG0KkSC8qshxt3e09zUaiLdARfJPN5FRZ63pKzQvj/4l8aV+aFvvspiy1TfyShucDNZJWAFcFeTnttbzkPQ8sZa5e9yAsRFWEBJWrlwSa50BlWIbTaABcKpNLvlGlj9gp/wEluAFU7pvJV7PCp358RvJFCmL+JJzIrEd4fEK/SSwjaYl04IJWbHL1iihYxnclXaE/no63NAiPsyshF4qazp3is7xVAOaE1wImvIB4RHKsxcGaO1la/30qq1fkQum2Cllk80U6JNzWKzSugwi+N8lOYU9BnruKtyju7dcLC4befylQuTsqpZnL9O4/TpvySlFLe5E3Abt8jiWw5VX59xn9DBg/cNBYn5OJMpAnDUZKRW4rESyX+9Hh2Z2khN8bTTRbRtDSpwGF6lga1pBODXjb2X/vU2LHkhDCv/2VbYd6pbJ+gCH3EHwzQaXzMw3PMguEn7NmZggpdPqsMtpwxQ3vnte4gT92eB/9yaGxCMp9PxWhSbHLJ9ti8i8+yDmgzZbIdfZHjOCnJWMKWQDHi8HLcZVL+bBSwMCBBLXEJDQa7/xuLLBsmpfqlH/FcDCAIk7a6f/PWa+ZlBRIynhaKv1eYWxjgWsujgCrHBfyD8ejJkUBHHkXrjtorsfrsziTYMCtnlfdEg3vcGf2jLM9FcNlsSA1I1BU5e+je/JRAneuBHJEAm971wDYjBoHbDpvVEjBdKm1ilUZyc+nAfWY/AhzS5q4iQMe/qdafFjj14qvCTW5y2cTsnnuc00+1Tq38sU+lGLEbHCje7TdhaZN19otSlkm62EzW6anYmxhkVhrZ7Z1pAt/03QlFAm3DKqTSGC5/cuSDtm5i3SUbxGVWLUpUPIgfRslQLJGwlwm5y9JZWgFQ60KNZV87V1mPL+aPI+E5QhnjZDzS2s+XzaU/jUVezKMjzEEuQ8ebi8wOcAoR+gdccYdZuEMdEDNxoHl8yuiM5gUnj4zVOXHnKaw4uix8KUULabuBw+A3K9y2Wiw6JqN4N8sMD+6c7B8Nj0EX1lATH+OR6r2UHW+Uj0rQS9VaJHVadZfvcdweML8svieK3TFbUn0U+dS+09mvGiLpL/oKWtX4RDaZ7Sbu5zZ9d5gQ1n8OHiqMKgPznaccheP+iLD88hJrI5WQUXSyyUMK9JlEzJbsoCftpwhlCQ7UAT/2l5DZWphJb+xjegxiiyuizTFN/jKwmtuv+APK210EYSAwQYJ+bCQwLUS79KMgNGtSzfmNEf8phis05+laK7BOfT2p1pkgOLFClJSFUR5kKLxydZaTefosxAyZdvzNotZ4bOdXxhaam7YxTpqBAaB5+AWVoVOY3gbbqZ84FfEYkNR6LgUML3KGzhj3Nt07cd215ttOCrl3jZ7iUsS4EVZUNvmSOhFUK50a0DxzcoG4/a2vMLUvzMACMizxnCKPONXWFCKfNtWAOsofeGJjndXeZCwzw4CGMYHlX0B4gC6mA/JoANbM0NnG92Zaj7QTXktTilbHyuqVOAgdBKo584BmI9Xx2CUPMOTd0HibzbPmQTcqL1C0tGkqElVNBoc3HlkFqBqhK36bHrcW05GB5RT7eFE6Qi1DQymUxpu5F4SAMUjY1/29phAUMLKa/4yfSlov3kkn1i7gom2lCT2OdUPnvJALHZHRr8CXbJmRNIdP8wqIp/08a4cZTABjIwSdHGi9w8wjIaLvUjo6eCioKvpGvKOO/d/Qo/5DGwwZQ72bEJ8xF4ankCcD58lL3wD7EuVmWpCn53h6mROkUjFbKsVfDwjnWxLWos1WVjesEIfz/0RQ3MXlKr6Bl+tDblL0AYBttoOhz4fjyn+k+dZHA6Xugsmj6fgex7Jh36aePbtcI+c48s9bDR/cuFuMCJqYhWrXyMPbPgeC1k/cezIGa6uGS9guIW+6CIPiQ1rJD37r3XJhsQfa5tlLwNJtfLNyiN0eZnKL7s9f79JRBIldwzFRj3df4MUUFAfWilXNm/OdLOeMlhlwPDkN7FwJwPi8iSEY2T4VCTY5wAKduW2QZTEsoiBOFOCxtdDfc7PGLbEUBgQYyyPH3M8tjNNv7Xr4cXs0+prM5yEC5HeGD+k3R90hGjFCyNJhalqxZurwZoWPNX+6+ndF5LJvFUMWRHlKHP8syhwwv0hJJEh1q1CLcHrRJkPSpGLPyzV6NJsKpdCmIDz2mwnRkyENTjckr/HMuYzEgTI0/6X95VpqurueR0fH3JbE4o1ss8frNd91CzGt3A7kunyhoofMW0RFtKnaagIDBh0c7y8pYBYtNDrglEG1EMTsVCqB5PioD2ZMVRAw+A/mg8vtnRve7523qzOMC2UzDBbzl8xl19I4wQgNaLSPOcVHnBmZxAeiHaVHILggmq55tkVCRnt2YosCQq5fWYpg+1yKiYmxUviTfXbfJgDZx71I/P1Z6U2GGvs3fh2174hhSBBzk+9ov09uwtN8cjuD/rd2Aaf8I7z4bhhQTjYe36Id73hQ3oTcqIF0/jY34HKJ5p8Ksf5PB1Es8f7cHaU7nY2hLMF54QWaTA8l/eXgYunwZNqJsZEiNplL23uzfiwepyckTRjJZM3QzNzyuyzyHqRa5Ky9Rpuw+A4FVw27YqbnGJFVKe0ekWvJz1ozaksQo9WXmNERYXHxQWLQ3IYB0AvOWnVxmxgEAT4YUSVuLpH1yOqJ+hUXke2YLRKTHYZKVB3xog+s1lVNuSTK6Jp8txBsohzXq+pXS08j3marq+VmJvYaCqrtKU5KWCKA2VT+zrF4LmkIzH3fiu9PaP90ig2mlQWZvf5nGb8E3N+5157H3C7K3uMTfHYz4ZqFzbK3QVGCSAGHb+VPrJeiO7q+Jz9+2NcM3aj09BbLSFeLZmoJFt8QUYapTFR55TlI8dXjSfX3bEQvZepMbJlemRMul71+DS4dE2JOf9LNH7j6mLJ96u9N1U5YZEj3vwhV992aCT2hVMvV+AAzxP3VV6EEIcgi+qT+FH1iPopeHW+6+c+69pm7Te+FoVsFiPanWdDoYCVX0f7II17F3A4ZaJSYBRdTrP+z1m1/LDWoS113ei0WLmfQAJAGoHrIbRIYMeRUTRo1i+XbY7QOOikjKrfnPnsIxiwupE/Ms31u/1mw/hUIEznPwS2/LALG7MfQbI7dhMQ5is3v7n3hHyS/dgZT+77OKJy6qv8uZf/HNSzcLEDP2Cf/8DKrTHr44nwrCy2SqrKf+eO4FoRf4VaDdlY7r/B+BFsIfzao21/4uq4xukISFMWUR2A5PyXiACL19uP85O5pYXvacpN9Vm+e2RbPwsZOsgu0ve5SdgUMQnTr2vSk88IuyjZ+AUOCLkknEjk/diIkD5f0dyc2ZvYMv+JOJqsq/N2uSw1kKGmfRbB41fBFeKyjVOGTefMcXDCN6p9OOWYCXhaeWb+lzI2dN2AdQgcwT4yUYv9AH/7QK5DXU51WcK6FR1KGMj88d551o04NHWdaKT50UU7lomR32ozFqpBSNUGC1LZ1d3pzvmsI7rhyOs6Es1jJdGHuJpkID5M/0rIGx3nPxS/jzBF3nL7hYjPqAX+rCH1q29kk26CU+cHpbcmy7DEkQMmrGb624ivT+CAowANXikuLLm0On6TZRVUK1B3NwioPvk+XlXXGdo601KJoaOiUyyjeEIgp8QIk+5kDXtzBM2t4BBV2Yp8I46IEOASXFkRj+p3hQ8y+F+RZiZVDmdr1gNf5JHigY00oY/Lom8E6pTTULyFkRMBiMaotywWvzJ/WOudy+Px10r2JZrJjnF+OdIFxw+P7CFZUBJq4lM8J1unKAgmjmUN3giA+5DdIUqhzHlH3dd+WXw0nDcQqCrQ096tcm72VAkBUe857R2ukHQ4sN8PoIC2XO+hWxoUTmmU0qStFCqWPtc9oYyw6otGjSwNYcNSUARKx4PGEvN/74t2CvExi9/EDAMoo/zhY0OB70UZmaRDkGXQ3hRIbfy8CXSM+CfJwTN5ptV0GfyLgt3c+hS5P6KGu6ziff304YyzrF0KeUmXoinF0Ro0rXszyVPYB2HCW1tptWJCR6Fpzolk7JKxfz4Tlu0Mm09bUE7a0mXulWAB5FMRAXRcrQVZXvqV4Mp8yPfieg6NNw5YHxqCEsMRxhAfZf3mYVPAkcKz/m2ZU9Yirk+SQ3GKpDq5hrsDZjDY1PHV0nBScK/eq6uMn1cay/MfUG8DvC5NSLzhqjl44cOyqmZ9aq/vYlxU1VHNbS5eD75h33epNHESzKCwE//rbcc7bEKDGj6bpiT7jGU76L8B2v2LgFyJBkkgulzo32eV8bBnJ5rtB1jpW0gZNEZieVDdZVwNGc2EJ0W+hd+LY8gR0p5kLsqLH38djf2zZRSWhvFcQxhOVOA5sBXYcrNCObwvenxQ+Qe5kl9gYkwiXyfJ0INWdslBlHvBsW5xnhyFCwiJkWXEyPF0JM3ee6dyEwiVo+8/eejUjTtcT/FypYda7mFUrgd1r9ss1zjGE4z+AsWYuwA33myR/rBD0QcN9FHNoMvlsdZ/Uzp2K7kbk1apnuBRQHLPt+MnitHoqK34M68TxNTVnv+vUTGyZwR5HGXQ4zV7pmnnmzXKi4jKBq/wDBtVadH2e8m6zG15GPf/qeSbxHQ5rAAT+s3G9Cl2wC6s8occVTUPktIBdYf6wIuogMB+bt194+yBQoxtsqcm5SKMNp5FrZ2BO1dlfyVwN/GCfLbwPUurlSo3umOfx3pngL/AgFNICmv7qW2pY7ZA8g2jKQLN8EwW6Es4djQvuyiB1UyGvDcBf15WTjO5ND4ljKZeTh3GQZgu0cqNWUcEsC7Ib5C7wLxSQSssYq1NHJBxUFJRBoEE5PSzvFY9Qii3xnzYAgwDWtvuXYNxQU1aqY8LHdtgvKS8+CWwM4Jrdzp8FJ/YJ3TszEs1dn1085d3U/v6nudcRsbLfDUoRory+LbewiKav6yjo6/pBVWZiq6xflQ2HAt0hFMMiOLQVuaMPeF3DzOsHedQw+J7oumNYcnkU0Ots5tcohoIDbtzEwcjQTXL403EB8ZyaRtL0bGpHtlb+YlIwYA3c0MiNgCvCzsYwCe3MkkGAHRw6d2VG05OHQl4ZhdOMsYbR/TGQOS4NNv9VyFXJGjiEifdLB4kq18W+BKPnwQp+dYn+n91/bwW9Fg2cO8LeUxKcJ5NzJzbq/ZkoAEJXSkdA7pJRfnccO8TXbfu73bkcOpU69VtUgQzjABLWpToL8pxQnSefUeGh/zSNRHLERCkgN/QMdXqgQJGktgzQ3lCwwJ2OJJJ+I9hINRWbfadahGay+h5nXhdorSzdbuiKzwcj+wVCwPzcyF0g3oMT9wXGVoOEOORsXnoivgjU2UrImNtAF5WqdUxWiPCr/wvh7dhSPIttFRdfnxalaHprsDeFw8Rg9CDp5bkw/59besKarPMCUOoApkF5xKJC3HrHW2BXoe8L3qQIIjwniheq2bFdH2nG58LuERvJ0T2xkfDaeUvnwKVg+rADIt4NF7Jn5JYiDu301kjPMpCnxTyZGgpTuTASq3e5jbj3li3cIGee6luLfNeBPhMRH4kBoNR4EWNa/ePeh/rJ/RQraj2gHWEph7VZFNFGHAEfu/6lD44NjPWDjsNZ77W4FbY6amTtvhDEJ9/ADVsjQmHkWO4DQ0QUcynYf/UMsQO+BrTRT2avNNJenSdLAXIVilMF2gGqYAAidzITxL3y3xHjp7JMC8QkjHVZUSgCzkCHgO1DMpcl6eY0p7sC7nOmq8S9StqIBa4ndG5KiRSqbx3RjWgXAFPJuzp2lRbgfWnV1zw1NIolqsWbAuNdXbWnhmxgMMF0p2zCXL8ob4/FQb70p0jPEmQ8j+EqAFToiBJF5wdTvXKfzQrH+/4fVTY2iGViVHnc0KNbW+R294+TVRM1bAyPGTDyFTTMJTKlAfghw1Z2JNTPKy9NjTFYAO3SBg+k52WOqh0RVtZenPzegmEyGG4Eq42JDX/lA0vaRUORKAgg0Q57OwDzat0OXoUwglQSxcREIz9TLnp/sJ/fWN33jrBbIN4960IO49V3uimcPtKZDq1mzYsgWNzgNkxeXt5LT8FbKecPfK3TPppzIEqAia0e+JYekPJ4dD/1e6qSBA6ssVABJfaQTTn1lBXKwJHU1Udp2G2J4ktt8ZmAD46MunYqn8Z0Dt65wIZQBdZESUqHhPZxVzCklTg1f2olPcd07e2m8nxABOtSrNz+p2I3onWfpeyXoIflYlIo7aOJWd7ulXZQYByQKCjSk6e4Uxa7v1Uh1LyUiRWcPP24+zJzXtkBVdroWoQugiZ2zQIPuYL7QGSsxDssL78bv9RdKdC48rI39zOsZzdbbWS5oK9eJAuB5uJiU86ShwWtYcSAACwWRmMUAZKdW6mIgY+yXG5VICRvFrnMpIdXNlv9Pv5hwkIusJfPfc/hXWdnPSIk9hWf+SLpfeoI4V0hUaxjSfZt6eB4kcvuXlRzhYvUd/8tMhhRtBz5C0oCRKkTpMP5Mq6U6bhgJ6YRcUxnEhQ4Sn8AAdrSQ340Mx9bv9N9WXvy7dxzAxjFYArqWP3SZapMtPBYiqVaUV6fG00/js6X4Z+3PcofjxlQzlQLlcg6x/HMYCLffMj+WSK6wAC/skxLQBTtHUJYdrKzSvCw8cFUbVH8P7KRt7VON3QtSmL20oNNOf0zH4acnEZ9slTjeLO5/vqPEPZo94FXucJdeUVbHIZovYo8nGeNdoZ8Fe7lQcxXjLi8fzRPUvY0+7Olj/ye7d3xMRA5iV8RbTsSwwuyGHrL5gfjPzPzrYRerq9Z4e8m4COxfrTFBXrn6ekLx31Rym9ZS3+lKbIIWammYCUNp9nMjzy8MSdYcJVE1nGbq4ea1KApUKOcLCtVXr5nIiUhv9gb6Q23IdBKc/TAAVnXngjrM2pIYDYIjvMiWm6+NBepAbPjfXW8NjUYRXeWfsVBE+5hwy2JuHhkR/u88CHeX14MRDA81G0zVhAyjy+xxVFu/EUFumw0ii8qDTmFXIh8VqRApspMb6vxZn1sl71pNkSAhh037XhCyaNM1MAtfz/l33Vo1wiz+5Q1DGmjAG0ePaaPzv0OdPj6XfyWSw3zhboI1w8p/moPY3qNQE8GktSoHMJYPskS5rSuv7WAzlHlDRb/UzHr+Mr21ikdaS2nEAcxWpp8d0b7uixEM9kPLXfVJ0S1kVPjTyhhdMQOXmy5iYfHGAt3NWDLP10yE1hOUVEer0YQIZzF6ZhfnxanIUNRAzLrdQh4g3rXe4Y8kQ4CRqmHbKDGATOxAE0F/BCYX9xoodwo7T/0z7RQSaPE2HdRh7pqrQq6oh+skwlIIV0zD8tuquiM3c+BnPx0jskSz9Luw8KG2yhfVlWGDXjffJazJk/obJfwzt09u7ioBG7fwI1u62EAzyEb4sUcfN5Hdl7veiZE5mvmw74HfCsYHRsee3CKJ/ViQFzNYsUPXBrFwRKigWu4p7QkuPL9L8xt2XzNuUwF8ZFSmgxr1v2S1JU9lTHAVvz5JCgPj9YttH+yOQAU7NWsk9TidX5qU03xBZ4pd5uF3Rx0lzLwCPNarKz5HqtF209zYyloIWXGkdJD7X5A4e044GUAre8cI3sbneLO40yiJztQi8ZWQf1Ziv+mAjTCepQ2Nd+VI+741RY/pVVLxYYnsVC5hvW9Ioz/6MySgYqy9Rv9CYJINIzIw0FrTLdzrDq+7IZpBH9Njj4YiX0Iea+zhb3YqIQjZ1v4l4FrjqBdDvDkN3JzCKuS7xRS2M2sL416rbqcSM/WHgUGg1/q6/Grh1lKrMhhQdN4LflALKVK8h7yQSAc0h/khZx0E04mQEsYgMPVbzLFEM1FhrwF4JaqWG1sgnU6xFyqI/lKa/31AJL0RJMmN4csReAF76vD2g1cZP19rcSABkhGmejv2wukKZByLMVgXoKOWlNk76Ee9/BOFLLklQM4LGzvSRenbMGAS6oLtXhPHdGOeEro+/CXH+N2wWzfqwA+Q5FmCvyCoVYiXK2J0PXEFXwSZfo/ggGEOrCB23vW6tFDtYwWi5QWlo/w5Zw/Cf5GLFEBX/woL2UxuyVk/JCLPEnzOwtv+NF4MZ5GzDcTcJB2v6IyQlAy4as5yaIlHwMDv99mAWmAvOwziKH52g6rbD6fbX7YaYPmvsrVFl81VH13pUQB5KPii86YcHJNKxb/eDRUGzlfM6yl37FW084XIXW/1EuMSCRz7KnPyxIlfAiGiHnwxBU/tc4IoW0ItEQxGMkiochFVdghXG6pb1j+00rD1vhkTdscmqg2V/uUQ1CA2DxVvPSmYu+jBBdypRfmK6TgN0n+SbijAKpIBmRFZzkK/zsTRioAuYOq046tYTq0XFaX6hQfwjdan1vyNFpSjDl0qq8K2L2XD1Mfu5laqrU1xcJT+IHDXQN8v514wozS+LQ1HJAsKfVOUxgA0e60YRjNFOOgjBIh69RWCHf0e/gZMnQM+piSh6aE40ynAUxgUT9gTCTVdFOPNl9cyf1c8hoRhIWEXpS+EouUjM6ea+nxMATQZA7L8whZp7WCnnR1GZ1qlv/j1+NBs9uTbqznaLCccfeoZyw+0dkcCW6WfRTEPhSmYiUky3/4tVcB6uF7bQtzUjbPWPpl8evWOSrzrfClX/n77+x9v+KnT1BZ0mx5j3lDrMBnp56S+TS5ZVsIgXkzW0sKuBOnnYzTQmPG+rtbZlOhIiUUIVJPnlMaWg+gsQfcFnC0tPqyJU0cEf004yqB9oNMRalaC6bG3bux1sHAceZhBp3j0dlhZ95M6cxYHf4xxpXlgpfQ3FfQr6ezCTldhtiBnZjrf9QOf/b23qZtrVmClANZsiH/L4ZGItNTHiO7tjMNsaTosHnum3o2TWWHCt3r3UTUr8lRgLuoWH2/nM1D6DyK6LyxOZhVDj88nSvE2Y0RDAOt2+UbNF+ZipMpCF0/X8YsSPjhKAOa8KareNVotxppWXykEaOpGN28rQQC7JKxlpFe49qR1ChockVMIjrmlmUjeOoq4N1VS9v+Ehy5gvBnc702wtyQpqCMIsypET915mnQc1qoAHLZeeRthv3+LTKyF8vNSOqtD/xvm+zihixAudVbg58q01CddZqTjfoi0uCOJT3kDx80hmTMstqCOKoVL9Wl2qpVyWh52LmtuvrF/f843QwlNajv8n9ayv5TNj8X2Cgi+o99mZVGpJNN2PguDOCwWg6G79+Gct5WXozKozIUY/GwEcXgjbDfZrFLI72WE5iuPuWznwvEi38WMZor/pro9LWCu7RF1PeXU5DmpQRTGAgqVhnBXeTJKAOCM+3AmXBMk/h4upYFh9Q35Y5YL3819zG1d4rHHZqrH1An6eE+Ds0udAraIos/8IHqydzuHD9SfcxvkvsferRCdDopMN3ui5z05lMA7+UnqWP6XVODlNYV91ZooaqBYmazcqfzZ0iFK/p9Pt2AKFWklbbEGxnkJfjCHFJMZskyg1nJw+arJqfT0tuJaRKvZEwIsVBEeNLuQw11IOsOrh5U3X6D8n6r9AUN8e5GoS8u3TCk6P9iWrtMPLLeF6SqdPuYuzOx9DVT0srV/eRPJqncvIkCgKQaCRUQJWeQUCXfebILx9stNANehtNLFnQlNbE+4BXAwuqeWUBzciTPeHr0UYePAUOBM7mSpti+wJn06UkdffxnyaoTgsXiQlWT3I8PohZj2J8qugsO4Q9Fspvi2166Uca4W2NsEPwVWf1JGCm5/8W1BO0DwawkeGNvoCf2mbdPl6uf45v/V6535bWbbNfoo2JrArxNpmCrfhwTXCMwuYuzNDSUAitWR/zKHqLBXFwQDSJwdBAHDbfm6JJl7b81JOjNy8pOhf3eeIldOljtxpY8E6WcKIzGwQs2w+AuD4KFI4ce3qz41oBtmBiyOn+ZI9GVNqRZOAOmHvwBMiQq06YXZx8LVJSv+bqsKcJ7oRh0c5Nzg1Gt8oCOyuAYDMK/+sqc1nHGczb5UYcMZ+mCblI7JLW6UrZLNRDHPy7pCTwNuSBxydifLvnsdiRurNso+6D0g6FqgZj/zH97GPJs57MAPcIHRTewyT4u1QliOjbYzZHoGX5WUqqWpKF9XDhnQYQPegrjqqk9YAZA2kKLYYSTm+RxVosiAEp54NpHfnx8uul0f0Rf/0kgRSkL7QvzJ9FS75Ob0m1xtAu7L4N82zKqp+ckUePc9TkpgafXD0BXbmqlpN05YBfeYSlgIvqnap3PJYA7pWg2N41DJ7hdZbg70+Js2C56JRetJfoF7qDcUhj5mkSzOA5IqYEvMMlyRcJ0NIfW0jWoRWh2+BGDXykbzQj0jZidQ/dVtW8IoHQphbSGY90akdqcMqSr31NwHRYCfzxLBc2Ff9CspG8g1nqO+uEjHYkJTIlF/QFbcLL3IXpS7LMgKVzM8WVva+JHRl3gX9l75mu6n4DLkwxcl0pxtTTr4dNHJDgdNhQIfMNubo0I5r3BGO1PBjuBayJ+zf4QEzrUe7n4OdNxOzlC/fbM58AmsiWmZcccCLL4gyDi/yWofC4Q9rMsjcIaV7yRmUABD7CDE5LJQWU28ehaaXhm9rt4NXtnijnUn3AkOP2e9gAy3Ay62VZJaomUB6PmQ6fXTeDSF0NTj2xdZPaqBWgEDnEkHLjDEzjmVhC7e2KH+K4kLdJnpZf6z1OIfWC7YZQcVoMCi+rde5oWD2RJGkeb47Gud2Wme59mtOmB3k1im9O4pZ/hNrL5N6n3FtXmTYUe+YW83HUmSQxFQkQfTOSRWdfYwJl0cuQiDZFPINkasCcT0HayzHpw+LWhkgz/MijhKhWu1c2tM5DBv+eJwmARQft4ZbpDSR3rCCgmcczwJ9tdjh3HTU7Lu5Nnq1pozvj527Cw/fjZeETAkiK27esxFUSsWXiuJaeVa7aJ0RbHeYbVILitoxMk/L24QZaJdWnSEcOQbQdv7ngJFVF3gXsiYdFZYGPCdo1R5u+nApFrQS3gPIkCyEwernoNpIid2HfuVyd8fQgAsxj+PdO1BsSL3mr0WkLR+/d93q2l4QSzCNKACBwwgJSpn0xT+Q+6nIRK3kRkUkYBeBEuPTacIflp5irTKNU9ymS4kLCvLUDosfnfOAEzaEpufQdO9HWl5hyU1j0P58bwkamAgnv3zi6AxbJ8Biima0b73Bbnm9I1481yp762eUfxNAbZ1ycPO8KcHQKb1vCppswioXHuImWWmTjSqj+Q6KhGRhIDEundO+vH6nPfmHgHqA8gtwy2vtBR1WrYHx3lg/nE5LFA9TzilQlBpRkTOJuI6N23DG+aBs2YzpLmYqPxP0wVL041nqcCwhDAuiYMpvZXVoM3RBG/LzCQnqxhJ3bSRrble3IrriJZ8P5wPTCnviCDjQWHW926aSefjKRZQw/eq1HqnjilMPGciWtPxbuUwH80NdqVwXcKYP9fGjc5aLq0AghSjDZBHpG9U4qFiAWDiEFQjLdQSAAGkn8ncLcmMsDgD5Zn/JGgW5bCk2mQHs8FxH0td6b+DPazVRBsnAtxGDixgpS+YMrIRuJPQs5+Meh06kqyX75tFxP4TjKtNZ4t0qHAFP2s159JCY9907J0T/0i4HNKVTiJX35p20OMZhh4XJrDuCrJmoSnHYJIWHmRoFKVBJpmjLiEsDXzYOoZZbG/AXPxaDvVEeQWrF8mSscnFzyuxdq6FPfQE6UVuO4Q7vF+F85zTYcO0/Im1a6ZUUINFhJFx9fZiWRNwwG3lsd3Utb6tIVQ1s3Kd764cqYQcFEdwdCNiLdRCqIxYpah18wq6uslvERnKJl5uu0SXYsNxKAoNpW/+XqnbOVB8q5bQRs1mWdhm40vsOFgsiHj2P8NaB33YCbbI0Kbj4koXjCWFkluWezLfS2O9xbsX0ADIpF9Z5wB8wrVbeoJtvUbDexbrKkJMjClfx9yuDTVvgU9QsAio5AlmEhD2SiNg+SOfQKAQWWzSV6gtGIr306RbpnmQ9tBQSQnQrJxorRJhCHuQy5/RadZQ0qq9Py3CGL6/g2Sz2nTQKU/SnHsWlCpIWlDAmeE1qJMREQXVF1ufTCOTUwYvwhfbr8hg1cOCXCD4UtqkopY1f+jhS1K0O7+N0AqSCkRAZk1oO56XGYTQjRu2RwaNzlassRVUE80Ry2iUABmTrQ1ezUNk5ELNgHRoL2pvnt8h6wdFfGoQUdVztn4X/o23SJDGqz+LimVxeXUrRGbw5lGZAcd10eZw96KYDYqYv6Ed3tVaxYfpxthQgFuEGSxL34jdnRHEJbX9ozvIOWWeZx88T2+4ffG3kRdbpbu1jmXeM1AB1QvqrWCc6hrp7T13/qKzGal1iMPCEADs0pT+AsLIWuQESJ9oBwSLyPBZA6sK64a75V2cm18IofPXhnrexV9Ue3Yop54pGcEWEItzZnZ3/sm+jsvcQISVZHoWBtWrP8AXiRpRukC1IWSW9MZph2sqAeBEPgm8PZE8aD5llKyJQPpMpultxym1nbyhDU4e+vCoOryF8U7Qmd5uRR4ZgLof1yUg0ePP5wBOgoxHRo9mKnhRI1HS9RY5f2T488xL1YAB/OaA+2uAWfr/bt/EXtAg7tvVK8wm10bbmcZSQ/jx4uN2Z6F10/ksYlTOXjlk353C8fovDvUi7bANTDFgAjwFUYEbdCe4ORG1xiiut3JGsJ84YT1kY7TllqfB/piFOnSdT1KDXihHWFfEMP4bop147dS4scKgtJZqB9RtLtr72yIBocSQcsIOZRzY2QFklGcEeedOYjZ2wdt00vAmG2tUkF/dWM7iTwPgWLz4LumYFNrElYcw03Ii34QRYBwQ+yCytX/ERfTY5UNjCVJ4WPahFQ06j3NPJ0b1bAT2/UIMpMHcsEhH9SlPB1BtgZYEmOiZolKYCP0HTTgl231UDbHLeyBSGzTsoDoEC9gMWYCPCGtEk2vpOjvrOc2ZWWjY1L3jVFBbxuUoFkwqa96K/67afrsl/J3UIeZdcd5x0ZG3ftA1ce4bEK0D7xmmnOL+LI6PNYZcKBck8jvJNMXV++0FvuylrN3gIBT4vi+RSYN0edmMv3aWn0IgC8qnmYS75Paok0bE6lGAanyou2rbrM2XKf5F3jXY2B1ENG9XiN2Hqtg5FQLQLdamwPVRg7uETN4nN1Gu+f4R36B3iNqeAIqHXDxorzkpcExCAYL8tr/D3oZi2yjWappLWTj+XfYrnFwZ4z6g3DAtzOHdoXkf0YRICpV5AvIN328ccU1uWf25XSTvqDoCAUr7yn7BbnlAhmHgi0CPF3WGPH8k4rBBAdz0n9Gd1F2j9GmJV5qGGJ8gAXGhNghGyGb5KAZFw/es0L7IHkzM0nP/sMrramSwu9TktYDi7EYPkqc8gm+jQPAm0Au1ihsKoPpshYqVm4wQeB2IstNGtq8fFNHbFmW2GvoFDBRH+pa7vw3pttfu0G9n811rWH4WboJz5eGr0CCSsG83Rz9aicUxWGu7ZUMxJTBBH4onOtkCVR87teZ5xa9TjBmiiP/k6JRLnhno1fKYfqdXD/b0SujuDumA4OE5aew2LXYHFos1gLczd+P/faMsZY068g/dTumzBDpwmqPJkOCIzIqlWIfzAmyMlENw0sDL3ZS2h4t5BPK9Na6r93Pb83TcoVAQbq8OP7A8YsTNECXlV5UmzjT0wWozWuB+QVQjiZ6GU7eQjahptNjvdzdh2pBZg03yXh40dq/DdqjE652HUrwLjWTwOU1c5eF0ae29Ez6j3+CY18InRCx6bvHcsDbbX+DWoY4ugDXFxi7CEb6ffW6P2ITU+UNcqj5oat58B7byFpGstK35W9ZdTEr4feCuELtztGYhN9dDOQYlwolhiA9Bk0ElSPpZAnhuwN8uCIcdJ/XOh48czPvHGHL+4yze8Ku7nXSCJHhQFP1RVoFic/ucTRv7c2C2FmDfLjUm4ZzlVfg2iqaQV1c08q2jex2KADQB8xLc3jT3n4U21+0xfiERo6NIWA6ChjsesW+mfY6lz5Db1dKBQUw7e+EKmj7+PPxNtkVXN5F/y8lVexze2iXZQCUSD+K/8fSgRRcpaXREbKPZ+eUa9U+6r8pb+uaGSwMu0D+COsboxRhQStzJfaK4hLC9th+ySkxlNX+2giw99VQETNL+X/DCxy2yvCijLQ2uDU/FEzHWD7ylIuwvTVSxXvzSwj7xluBht5knHsLW21oRgFBHSy9I7KWXmc3wWnmpBfJ22UoTjuc8AXzmzY75J9TQO7QlQvtv62cIOcSsreNXJzq1T8LmlbmPOmwCSva/hy0kK53+WOGtZZPjeMLDNsX2Ta/YIeLluSEYqAG5ykM2ziRSIjf65ODQ9xfmZ8L52z2zhzDFGl0bDleMr/E2OEAWdcncjcZJ0S8OXqDApZ8Bq2D0wdd6uzW2Q5Y0IvDBcIsVXfRP6mW9Wc0RppXhp1wt1KJhhpAWSN1OGnlrU35pNpywRSxK0gA6yfz1R7n7JY3AnetqvTKf0Nn+zLmFytC4qd3ykN2LJRH4kvHRYg3Q+CEznvObLhcDzNN3Mgovxrt+sa0opJLV6ywuS5IdImXsk3tMgUZKdjeuBoVWpPWrVuVBzaxl60d4o+hjefeI/11o8PE3q1skKTLeV0+EeVPFP8ZTepYxg5b5b1bGQvhPuc3MuEhM85L14lJScPybbrmKceyp/JRFKFxkBfLHw8vkA+Ph++ELb0Y8BY/FwEszHVSYDcnjrYaDTe9bfq7ataBM+yUDmCKXYhjqPYsX9y9hpKtV0gN7rwd+L4nPqVdBYDyNeb5+9DzB1lMWN7tgdBW5Q0Gd+AjR3LcAm9/gaBNiet3+yhrFEvjs3aE/weN5x0M0kgfsfX1QjK9JwBLc//kSpzaZSYrGq4HhYY60v1f4tYQk1gKLjb4VNcaQ9P16E2PnU8Oir9In+h4ao7sboHnNUVhOqrGy9KALRbJ1wIM85HdUNHnChe4B64KnftqRDESC6mSrlIk9aj0dnb3QNM9MSecOcB98J1Mj+iu8E9uIL6wd4+mfnevGQ3qOtTXoYng4KoMW1DN5kHm7Eat+CnpdBNSFMRFWvdRTTyNr3+VgAkZS37ozr3KgMWnZEFI/JbrWyVOE8q+WNqh6yWiFdm3CSLj6f1cTyVQCqt3EpRLuVaydXtb1ZsyiJgXnjysXm8UzR8FceWRoXyxYih/XEnCBVfroL3iEgkQwvFSXkEZJyoGxZ+WY1ur95zqm4qaSIL3jVtM3yd5Hr6ygjyR2xEBAMjtEYNaq3JqFoTmQTsFw2Oxud6mIz3d0Jiep5G7G5kjfwrwDwFZPmHEMfBimjT/AaGDEa9chMjNBSDvidmvdw7HcKygr7Pg0ryRtrVzH6q+lZfzYrwYPAd1ANYSRDXwDHui+q2tYVyhx49zGbPhImdrU9xfkUn9TThvB+sEnTCiG/D0Ou0mIHtj0CDXrRuj5NKKurjJi6vc2I87okW9AxErYrti5veYu64BPgrSW4vfGQyKARxhN3Y8SgyDYwdCWjhQU0vhyz3yB+XAvHERy0WqdtSyqDzwsAfVieRFR9jIaIBmdFJGDDXBHCksa2Mr9UmbNGmLRZINYnjvgcoxY8H+LHCt93afMuPEWqiyXlkut+JqP4ySnTrXK8hDi4rX+QQ6StEikM/QV5i6PHHEDK6uulS+UGMsS5aX+OcnaeYMDgaMxT941QiZHV8Yz3MSSkTZWx2nyAal7N5VabsRr3GAniz/RsLRTJhhONM29InFYsVm3wiWIReITmazvhGq6F0UVi4OvSJrEsPNytv4eundHDf8RT77R5VWaKOuW3+6HMUJhuUIq4omaB0phCdpyjwEjhYxXe8KBYVj/UV0lhhUIeH3lAfrXcKIKUTnpLBZ2YNDMqTAigmPtrMMxa5xc+pmxHnlNFiWLqkBO+awCuOpQ+xQ+qivWCSYT0qRgsdK4xuxezocoiQi7O9xQArlYNI1osK7iUl9rEJbMDmh2FT4r/x1UgG0zvOcXzzyeFhuBljEutcmTBV64t9vrSOAiu7AHVZ6rOk+AGL6BpdcwmQPufPJtfyhlDBexS8a+nGSpvAYGvrqNILrttL6JnihAAv4Vyb/c5KjWUChrDSJrVlc6BPjvqYsVJjGh0mANtmFzFBIUXsXaO+L7GJsxVoL3QtDLj7z0iw2lLpskYU0EUQ9mOzS4S7aCVmy63rDopcxUP6AlikRg0xfhoH/Bdtb+1/I+bQnL3IY4w2puQribFgl9x8gz5ykXjb28yBWKJzanCZothI80UUTOPgRaDKeO8wLA7FqZ8gdAL8n/ERkdn5ccCpLioAiDn4tXm4dpsWLAwXZ9yfnlcxbVP6PIr3xQdak1MnzLmxwZM0SSo0Ww0a7yN7YFgNpT4aINNuuHECQS2AQt1bHQp2RJkIBEdJokyZdtd85JoVvyx/leX0GyN8FdvwIV84SpgY8ra5WyCem8K7ChBZZsETsuuA0cWbkfa/V480flZhZOyQAPPZ4gVK05oMWeB028mVXLahQEbeD4yCnVs46VHELBkw9Iu7R+h8SjQCvQiXJNRM9DpiqPi0sE45/6t8gkj6RcKqvnDot7IO2lkscu4MhU6PUzE3G5DJJyD4ErqTFXhe2su/1R9qat3BwaBirdFS72U4zBzfT//g4V//27D3BKIiHVKGsA0fy9+FzxcWnZcQ91GYjpW/k754XFRSvYXmBMCfDNYYrdYPds6VM+7JcaJt29cGQ9c6DWInopIYVzy/hx+J886WZAjoZJBU3FNff+sCeATiQtmGPw6OykPzvAVcWNeh8Qh2Km8hiGgzzpfifA2UHCuT2AlurdpIuBojW/h09o2H5O6jvveajLqjmfgXHfT8XPHJ3jxXye7PAjnPeqJanTnWBDlucOfQOoclbj9cXM0dC1D5wVNZOHPNQvsYF6cMT23p+0XvjJc1h90JPA8svdpGApM9yMYi+bPCVdKXXkyprMGpXDy8W4DoHJs5n02/i1IeK62sM/lIfjzq4fYtZIBLsgIayPirVvUnMsOYvi/KZSY9NOnURuIjw2WWYjvmfZLvd56b/ceHj3d9v+mvtfC5CUm/oMnl4Fk70LK3pqavjXjJAvThBaX9D8XHYY+4+Mvshq3UpdyoK54ynlCEd2gA/sE3Wz6Cu2vyGKqH9ssANomAE7viTAL/9IGv5w9/cdOYjvy3I65sw8x0VMpdBouoZud/wOoY+3jCPhPafQyNh4xyf4IDeB4VxbZh+abFjJjZ+W7ns8T0S2Rwv/WVsE4Wq0kD0hkcRyFxcxnwYE2N/DKRVhKCn0A61IeNqJmFgW3MHJ/DcaPv1PadK61Hs07N8cpwkTwjan+7VYT/bRADwiPr0BVaPbKT8vFjv4ZimZivEd+3RHtKyplMLU/ZHix4FQcNUKaLbE5x9CGZ2MeThvcpmKnhWuP9Lo0kEnlA20v9JN1J3RJ+1NtFfRQIWNhf1IXxXk+qLRR2hJGlaK9jX57TbskoA7PtLKfjIA1mYd5lvgFqagOOLHzBF0PYUiF0+giZ+Cy3SFLnpDBLhbyNoill3dOaK3GgfqQkdNkdlv4Ie3Iq/UTInct8ZCNP4ZlqR5vQ7rFyzvz2JzDDzkJ4RSnX9bWKx0m8tAgaiDrmNfXj3z0UDpiQ5l7iskRCli0n/LdoGXAq6iJR2dTQgpAeCzWHq/qOh76PMAGHHZMgzbPhfQnpeMEUC4YOImG55CXYa4ZORWQekwegPBdue5yRYXjAr9OiyB8mlLR2a3q8b4I+ax3tQzOxUJx07QAAA=="

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
   badge this style comes from. The ring declares no stable attribute, so it is
   anchored by the two '<circle>'s only it draws inside a 14×14 '<svg>'. */
[data-composer-stats] [class$='_pill'],
button:has(> svg[viewBox='0 0 14 14'] > circle) {
  padding: 1px 11px;
  border: 1.5px solid var(--luna-sub-edge);
  border-radius: 999px;
  corner-shape: round;
  background: var(--luna-sub-plate);
  color: var(--luna-sub-ink);
}

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
        const stats = document.querySelector('[data-composer-stats]')
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
          return () => script.remove()
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
