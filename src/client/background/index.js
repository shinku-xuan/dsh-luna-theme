/** Background settings UI, draft editor and media renderer owned by one Client fiber. */
import React from 'react'
import { Button, Switch, Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import catalog from '../../../resources/backgrounds.json' with { type: 'json' }
import { orderedBackgrounds } from './playback.js'
import { createBackgroundEditor } from './editor.js'
import { createBackgroundRenderer } from './renderer.js'

const NS = 'settings.lunaBackground'
const backgrounds = orderedBackgrounds(catalog.backgrounds)
const h = React.createElement
const dictionaries = {
  zh: {
    nav: '背景', title: '背景', description: '调整露娜背景的动效和显示效果。',
    animated: '启用动态背景', mode: '播放方式', rotate: '按顺序播放', fixed: '固定背景', choose: '选择背景',
    interval: '轮换间隔', seconds: '秒', intervalHint: '默认 30 秒，最少 12 秒。', intervalError: '请输入不小于 12 的整数秒数',
    mask: '遮罩比例', maskHint: '提高比例可减弱背景干扰，遮罩颜色随明暗主题变化。',
    blur: '模糊度', blurHint: '只模糊背景画面，不影响文字和控件。',
    transparency: '背景透明度', transparencyHint: '0% 为完全显示，100% 为完全透明。',
    save: '保存', restore: '恢复默认', unsaved: '尚未保存', saving: '正在保存…', saved: '设置已保存',
    loading: '正在读取背景设置…', unavailable: '背景设置暂不可用，请重新连接 DSH', locked: '当前设置为只读',
    saveError: '设置未保存，请重试', saveUnconfirmed: '未能确认保存结果，请重试', retry: '重试',
    videoError: '动画暂时无法播放，已使用静态画面', posterError: '背景加载失败，暂时保留已有画面',
    reduced: '系统已开启减少动态效果，当前显示静态画面。',
  },
  en: {
    nav: 'Background', title: 'Background', description: 'Adjust Luna’s animation and background appearance.',
    animated: 'Animated background', mode: 'Playback mode', rotate: 'Play in order', fixed: 'Fixed background', choose: 'Choose background',
    interval: 'Rotation interval', seconds: 'seconds', intervalHint: 'Default: 30 seconds; minimum: 12 seconds.', intervalError: 'Enter a whole number of at least 12 seconds.',
    mask: 'Mask strength', maskHint: 'Increase to soften the background. The mask follows the light or dark theme.',
    blur: 'Blur', blurHint: 'Blur the background image while keeping text and controls sharp.',
    transparency: 'Background transparency', transparencyHint: '0% shows the full image; 100% makes it transparent.',
    save: 'Save', restore: 'Restore defaults', unsaved: 'Unsaved changes', saving: 'Saving…', saved: 'Settings saved',
    loading: 'Loading background settings…', unavailable: 'Background settings are unavailable. Reconnect to DSH.', locked: 'These settings are read-only.',
    saveError: 'Settings could not be saved. Try again.', saveUnconfirmed: 'The save could not be confirmed. Try again.', retry: 'Retry',
    videoError: 'Animation is unavailable. Showing the still image.', posterError: 'The background could not load. Keeping the previous image.',
    reduced: 'Your system prefers reduced motion. Showing the still image.',
  },
}
for (const locale of ['zh','en']) for (const item of backgrounds) dictionaries[locale][`background.${item.id}`] = item.name[locale]

/** Shared themed menu with normal outside-click, keyboard and portal handling. */
function PlaybackMode({ t, value, disabled, edit }) {
  const [open, setOpen] = React.useState(false)
  return h(Menu, {
    open, portal: true, autoFocus: true, selectedId: value, selection: 'fill',
    className: 'luna-bg-mode-control', listClassName: 'luna-bg-mode-menu', onClose: () => setOpen(false),
    items: [{ id: 'rotate', label: t('rotate') }, { id: 'fixed', label: t('fixed') }],
    onSelect: mode => { edit('backgroundMode', mode); setOpen(false) },
    anchor: h(Button, { variant: 'outline', className: 'luna-bg-mode-trigger', disabled,
      'aria-label': t('mode'), 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(!open) },
      h('span', null, t(value)), h(IconChevronDownOutlineRegular, { size: 14 })),
  })
}

/** Localized settings component; unmounting discards edits that were never saved. */
function BackgroundSection({ t, useBackground, edit, editInterval, save, restore, discard, retryMedia }) {
  const state = useBackground(snapshot => snapshot)
  const disabled = state.status !== 'ready' || !state.writable || state.saving
  React.useEffect(() => () => { discard() }, [discard])
  const row = field => {
    const spec = catalog.controls[field]
    const id = `luna-background-${field}`
    return h('div', { className: 'luna-bg-row', key: field },
      h('div', { className: 'luna-bg-label' }, h('label', { htmlFor: id }, t(field)), h('output', { htmlFor: id }, `${state.values[field]}${spec.unit}`)),
      h('input', { id, type: 'range', min: spec.min, max: spec.max, step: spec.step, value: state.values[field], disabled,
        'aria-describedby': `${id}-hint`, 'aria-valuetext': `${state.values[field]}${spec.unit}`,
        onChange: event => edit(field, Number(event.target.value)) }),
      h('p', { id: `${id}-hint`, className: 'luna-bg-hint' }, t(`${field}Hint`)))
  }
  return h('section', { className: 'luna-bg-settings', 'data-luna-background-settings': '' },
    h('h2', null, t('title')), h('p', { className: 'luna-bg-description' }, t('description')),
    h('div', { className: 'luna-bg-toggle' }, h('div', { className: 'luna-bg-label' }, t('animated')),
      h(Switch, { checked: state.values.animated, disabled, label: t('animated'), onChange: value => edit('animated', value) })),
    h('div', { className: 'luna-bg-row' }, h('div', { className: 'luna-bg-label' }, t('mode')),
      h(PlaybackMode, { t, value: state.values.backgroundMode, disabled, edit })),
    state.values.backgroundMode === 'fixed' ? h('div', { className: 'luna-bg-thumbnails', role: 'radiogroup', 'aria-label': t('choose') },
      ...backgrounds.map(item => h('label', { className: 'luna-bg-thumbnail', key: item.id },
        h('input', { type: 'radio', name: 'luna-background-choice', value: item.id, disabled,
          checked: state.values.backgroundId === item.id, 'aria-label': t(`background.${item.id}`), onChange: () => edit('backgroundId', item.id) }),
        h('img', { src: new URL(`dsh-luna/backgrounds/${item.id}.png?v=${item.revision}`, document.baseURI).href,
          alt: '', loading: 'lazy', decoding: 'async', draggable: false })))) : null,
    h('div', { className: 'luna-bg-row' }, h('label', { htmlFor: 'luna-background-interval', className: 'luna-bg-label' }, t('interval')),
      h('div', { className: 'luna-bg-number-row' }, h('input', { id: 'luna-background-interval', type: 'number', min: catalog.rotation.minimumSeconds,
        step: 1, inputMode: 'numeric', value: state.intervalText, disabled, 'aria-invalid': state.intervalInvalid,
        'aria-describedby': 'luna-background-interval-hint', onChange: event => editInterval(event.target.value) }), h('span', { className: 'luna-bg-hint' }, t('seconds'))),
      h('p', { id: 'luna-background-interval-hint', className: 'luna-bg-hint', role: state.intervalInvalid ? 'alert' : undefined },
        t(state.intervalInvalid ? 'intervalError' : 'intervalHint'))),
    ...Object.keys(catalog.controls).map(row),
    state.reduced && state.values.animated ? h('p', { className: 'luna-bg-hint' }, t('reduced')) : null,
    state.mediaError ? h('div', { className: 'luna-bg-notice', role: 'status' }, h('span', null, t(state.mediaError)),
      h(Button, { size: 'sm', variant: 'outline', onClick: retryMedia }, t('retry'))) : null,
    h('div', { className: 'luna-bg-footer' },
      h(Button, { size: 'sm', variant: 'primary', disabled: disabled || !state.dirty, onClick: () => { void save() } }, t('save')),
      h(Button, { size: 'sm', variant: 'outline', disabled, onClick: restore }, t('restore')),
      h('span', { className: 'luna-bg-hint', role: 'status', 'aria-live': 'polite' },
        t(state.status === 'loading' ? 'loading' : state.status === 'unavailable' ? 'unavailable' : !state.writable ? 'locked' :
          state.saveError ?? (state.saving ? 'saving' : state.dirty ? 'unsaved' : 'saved')))))
}

/**
 * Bind the feature to DSH settings without applying uncommitted editor values.
 * @param ctx Client plugin context owning registrations and renderer cleanup.
 */
export function installBackground(ctx) {
  const renderer = createBackgroundRenderer(catalog, patch => editor.mediaState(patch))
  const editor = createBackgroundEditor(catalog, (values, ready) => renderer.apply(values, ready))
  ctx.effect(() => renderer.mount())
  ctx.effect(() => () => editor.dispose())
  ctx.inject(['slots','locale','configForms'], child => {
    child.effect(() => editor.bind(child.configForms.get('dsh-luna-theme')))
    child.effect(() => child.locale.register(NS, dictionaries))
    const t = child.locale.bind(NS)
    child.slots.inject('settings.section', () => child.slots.register({
      name: 'settings.section', id: 'background', order: 15, label: () => t('nav'), locale: NS,
      inject: () => ({ hooks: { background: editor.store }, ...editor.actions, retryMedia: () => renderer.retry() }),
    }, BackgroundSection))
  })
}
