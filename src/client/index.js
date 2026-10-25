/** Theme tokens, stylesheet and component script mounting. */
import { installBackground } from './background/index.js'
import backgroundCss from './background/background.css'
import SETTINGS_DATA_URI from '../../assets/luna-settings.webp'

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
     * Effects no token can carry. Scoped to the renderer's documented
     * `[data-slot="<key>"]` anchors, which are the stable seam dynamic styles
     * target — CSS-module class names are content-hashed per file and are not
     * a contract.
     */
    const LUNA_CSS = `
${backgroundCss.trim()}

${THEME_COLOR_CSS}
${SHIKI_ALIAS_CSS}
/* The settings artwork stays independent of the conversation background. */
html body {
  --luna-settings-image: url('${SETTINGS_DATA_URI}');
  --luna-scrim: rgba(250, 248, 255, 0.56);
  background-color: #f7f5fc;
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
@media (prefers-reduced-motion: reduce) {
  body[data-luna-motion-ready] { transition: none; }
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

    export default {
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

        installBackground(ctx)

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
