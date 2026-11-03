/**
 * dsh-note-wall — browser half.
 *
 * Two contributions:
 *   1. `sidebar.panellist` — a sticky-note icon in the left rail. Its list id is
 *      the panel key the sidebar dispatches, so clicking it opens the wall.
 *   2. `main` keyed `note-wall` — the wall itself.
 *
 * The wall talks to the Host half over the package's exact Fetch route through
 * the client `connection.rpc` table (the same dialect `dsh-context` and
 * `dsh-opencode-palette` use): `rpc.call('/api', 'dsh-note-wall', {method,
 * payload})`. There is no second source of truth in the browser: notes live on
 * disk under `<DSH_HOME>/note-wall/notes.json`, so they survive a reload and are
 * visible to the agent through the `note_wall` tool.
 *
 * Styling follows the host: theme tokens only, layout copied from the
 * `dsh-context` management page (a 100%-height scrolling root, layer-1 cards,
 * 13px body). Card tints are `color-mix` over the accent token, so light and
 * dark both work without a second palette.
 */

window.__ModuleLoader__.load({
  id: 'dsh-note-wall',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-note-wall'
    const PANEL_ID = 'note-wall'
    const CHANNEL = '/api'
    const ENDPOINT = 'dsh-note-wall'
    const COLORS = ['amber', 'rose', 'violet', 'sky', 'mint', 'slate']

    const DICT = {
      zh: {
        'nav.title': '便签墙',
        'page.title': '便签墙',
        'page.subtitle': '随手记下灵感，落盘保存',
        'action.new': '新便签',
        'action.save': '存下',
        'action.cancel': '取消',
        'action.edit': '编辑',
        'action.delete': '删除',
        'action.pin': '置顶',
        'action.unpin': '取消置顶',
        'action.clear': '清空便签墙',
        'action.confirmClear': '再点一次清空',
        'search.placeholder': '搜索便签…',
        'filter.all': '全部',
        'filter.pinned': '置顶',
        'composer.placeholder': '写点什么…（Ctrl + Enter 保存，Esc 取消）',
        'empty.title': '墙上还是空的',
        'empty.hint': '点「新便签」写下第一条灵感。',
        'empty.filtered': '没有匹配的便签。',
        'count': '{n} 条',
        'state.loading': '正在读取便签…',
        'state.failed': '便签读取失败：{reason}',
        'state.hostUnavailable': '宿主通道不可用，便签无法保存。',
        'tag.hint': '#标签',
      },
      en: {
        'nav.title': 'Note Wall',
        'page.title': 'Note Wall',
        'page.subtitle': 'Jot down ideas; they are saved to disk',
        'action.new': 'New note',
        'action.save': 'Save',
        'action.cancel': 'Cancel',
        'action.edit': 'Edit',
        'action.delete': 'Delete',
        'action.pin': 'Pin',
        'action.unpin': 'Unpin',
        'action.clear': 'Clear wall',
        'action.confirmClear': 'Click again to clear',
        'search.placeholder': 'Search notes…',
        'filter.all': 'All',
        'filter.pinned': 'Pinned',
        'composer.placeholder': 'Write something… (Ctrl + Enter saves, Esc cancels)',
        'empty.title': 'Nothing on the wall yet',
        'empty.hint': 'Press “New note” to write your first idea.',
        'empty.filtered': 'No notes match.',
        'count': '{n} notes',
        'state.loading': 'Loading notes…',
        'state.failed': 'Could not load notes: {reason}',
        'state.hostUnavailable': 'Host channel unavailable; notes cannot be saved.',
        'tag.hint': '#tag',
      },
    }

    /* ── styles ─────────────────────────────────────────────────────────────
       One stylesheet for the whole plugin, inserted once and removed with the
       Client run. Every colour is a `--dsw-alias-*` token or a mix of one, so
       the wall follows the theme ramp instead of shipping its own yellow. */
    const CSS = `
.nw-root{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);font-size:13px;padding:16px 20px 40px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.nw-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.nw-titles{display:flex;align-items:baseline;gap:8px;min-width:0}
.nw-titles b{font-size:15px;font-weight:600}
.nw-count{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:1px 8px;font-size:11px}
.nw-head-actions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nw-search{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:7px;font:inherit;outline:none;padding:5px 10px;font-size:12px;min-width:150px}
.nw-search:focus-visible{border-color:var(--dsw-alias-brand-primary)}
.nw-search::placeholder{color:var(--dsw-alias-label-secondary)}
.nw-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:7px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;padding:4px 11px;transition:border-color .18s ease,color .18s ease,background-color .18s ease}
.nw-btn:hover{border-color:var(--dsw-alias-label-secondary)}
.nw-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.nw-btn:disabled{opacity:.5;cursor:default}
.nw-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base)}
.nw-btn-primary:hover{filter:brightness(1.06);border-color:transparent}
.nw-btn-ghost{color:var(--dsw-alias-label-secondary);border-color:transparent;background:0 0}
.nw-btn-ghost:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.nw-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nw-chip{border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:999px;font:inherit;font-size:11px;line-height:16px;cursor:pointer;padding:2px 11px}
.nw-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.nw-chip-on,.nw-chip-on:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}
.nw-note,.nw-composer{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;display:flex;flex-direction:column}
.nw-composer{background:var(--nw-tint)}
.nw-grid{margin:0;padding:0;list-style:none;display:grid;align-items:start;gap:10px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.nw-grid-cell{display:flex;list-style:none}
.nw-grid-item{min-width:0;flex:1;display:flex}
.nw-note{flex:1;position:relative;min-height:120px;border-color:transparent;background:var(--nw-tint)}
.nw-note:focus-within{border-color:var(--dsw-alias-label-secondary)}
.nw-note-pinned{border-color:color-mix(in srgb, var(--nw-accent) 55%, transparent)}
.nw-note-bar{height:3px;background:var(--nw-accent);opacity:.75;flex:none}
.nw-note-body{color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;flex:1;padding:10px 12px 6px;font-size:12.5px;line-height:1.6}
.nw-note-empty{color:var(--dsw-alias-label-secondary)}
.nw-note-foot{display:flex;align-items:center;gap:6px;padding:0 8px 8px 12px}
.nw-note-time{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:10.5px;line-height:1.5}
.nw-note-actions{margin-left:auto;display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .15s ease}
.nw-note:hover .nw-note-actions,.nw-note:focus-within .nw-note-actions,.nw-note-actions-on{opacity:1}
.nw-icon-btn{border:0;background:0 0;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0}
.nw-icon-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.nw-icon-btn-on{color:var(--nw-accent)}
.nw-icon-btn-danger:hover{color:var(--dsw-alias-state-error-primary)}
.nw-editor{box-sizing:border-box;width:100%;min-height:96px;resize:vertical;border:0;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.6;outline:none;padding:10px 12px 4px}
.nw-editor::placeholder{color:var(--dsw-alias-label-secondary)}
.nw-editor-foot{display:flex;align-items:center;gap:8px;padding:6px 10px 10px;flex-wrap:wrap}
.nw-swatches{display:flex;align-items:center;gap:4px}
.nw-swatch{box-sizing:border-box;width:16px;height:16px;border-radius:50%;border:1px solid transparent;background:var(--nw-accent);cursor:pointer;padding:0}
.nw-swatch-on{border-color:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}
.nw-editor-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.nw-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
.nw-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;text-align:center;padding:44px 20px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:6px;align-items:center}
.nw-empty b{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}
.nw-banner{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 11px;font-size:12px;line-height:1.55}
.nw-tint-amber{--nw-accent:var(--dsw-alias-state-warn-primary);--nw-tint:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,var(--dsw-alias-bg-layer-1))}
.nw-tint-rose{--nw-accent:var(--dsw-alias-state-error-primary);--nw-tint:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-layer-1))}
.nw-tint-violet{--nw-accent:var(--dsw-alias-brand-primary);--nw-tint:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1))}
.nw-tint-sky{--nw-accent:var(--dsw-alias-state-idle-primary);--nw-tint:color-mix(in srgb,var(--dsw-alias-state-idle-primary) 16%,var(--dsw-alias-bg-layer-1))}
.nw-tint-mint{--nw-accent:var(--dsw-alias-state-success-primary);--nw-tint:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,var(--dsw-alias-bg-layer-1))}
.nw-tint-slate{--nw-accent:var(--dsw-alias-label-secondary);--nw-tint:color-mix(in srgb,var(--dsw-alias-label-secondary) 11%,var(--dsw-alias-bg-layer-1))}
`

    function installStyles(ctx) {
      if (typeof document === 'undefined') return
      const tagId = 'dsh-note-wall/notes.css'
      ctx.effect(() => {
        if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return () => {}
        const tag = document.createElement('style')
        tag.dataset.plugin = NS
        tag.dataset.pluginCss = tagId
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'note-wall: stylesheet')
    }

    /** Read a service without racing activation: the ctx.get form is the portable one. */
    function serviceAt(ctx, name) {
      try {
        if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') {
          const value = ctx.get(name)
          if (value !== undefined && value !== null) return value
        }
      } catch {}
      try {
        return ctx === null || ctx === undefined ? undefined : ctx[name]
      } catch {
        return undefined
      }
    }

    function createTranslator(ctx) {
      let bound = null
      try {
        const locale = serviceAt(ctx, 'locale')
        if (locale !== null && typeof locale === 'object' && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, DICT), 'note-wall: dictionaries')
          if (typeof locale.bind === 'function') bound = locale.bind(NS)
        }
      } catch {}
      return function t(key, vars) {
        let text = null
        try {
          if (bound !== null) {
            const value = bound(key)
            if (typeof value === 'string' && value !== '' && value !== key) text = value
          }
        } catch {}
        if (text === null) text = DICT.zh[key] ?? DICT.en[key] ?? key
        if (vars === undefined) return text
        return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])))
      }
    }

    /* ── host bridge ────────────────────────────────────────────────────────
       `connection.rpc.call` posts the harness's `client-request` envelope to
       `/api/<endpoint>`; the Host half answers with `{ ok, value }`. Anything
       missing means the host half is not mounted, and the wall says so instead
       of pretending the save worked. */
    function createApi(ctx) {
      function callTable() {
        const connection = serviceAt(ctx, 'connection')
        const table = connection !== null && connection !== undefined ? connection.rpc : undefined
        if (table !== null && table !== undefined && typeof table.call === 'function') return table.call.bind(table)
        return null
      }
      return {
        available() {
          return callTable() !== null
        },
        async invoke(method, payload) {
          const call = callTable()
          if (call === null) throw new Error('host-unavailable')
          const result = await call(CHANNEL, ENDPOINT, { method, payload: payload === undefined ? {} : payload })
          if (result !== null && typeof result === 'object' && result.ok === true) return result.value
          const message =
            result !== null && typeof result === 'object' && result.error ? result.error.message : 'rpc failed'
          throw new Error(message === undefined ? 'rpc failed' : message)
        },
      }
    }

    /* ── small view helpers ─────────────────────────────────────────────── */
    function fmtTime(iso) {
      try {
        const date = new Date(iso)
        if (Number.isNaN(date.getTime())) return ''
        const pad = (n) => String(n).padStart(2, '0')
        const now = new Date()
        const sameYear = date.getFullYear() === now.getFullYear()
        const stamp = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
        return sameYear ? stamp : `${date.getFullYear()}-${stamp}`
      } catch {
        return ''
      }
    }

    function Icon(props) {
      const size = props.size ?? 14
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: props.bold ? 2.2 : 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block' },
        },
        ...(props.paths ?? []),
      )
    }

    const paths = {
      pin: [h('path', { key: 'a', d: 'M9 4h6l-1 6 3 3v2H7v-2l3-3z' }), h('path', { key: 'b', d: 'M12 15v5' })],
      pencil: [h('path', { key: 'a', d: 'M4 20h4l10-10-4-4L4 16z' }), h('path', { key: 'b', d: 'M13 6l4 4' })],
      trash: [
        h('path', { key: 'a', d: 'M4 7h16' }),
        h('path', { key: 'b', d: 'M9 7V4h6v3' }),
        h('path', { key: 'c', d: 'M6 7l1 13h10l1-13' }),
      ],
      plus: [h('path', { key: 'a', d: 'M12 5v14' }), h('path', { key: 'b', d: 'M5 12h14' })],
    }

    /** The rail icon. `size` and `active` come from the sidebar owner. */
    function NoteWallIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 18
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block', opacity: props.active ? 1 : 0.82 },
        },
        h('path', { d: 'M5 4h14v10l-5 6H5z' }),
        h('path', { d: 'M14 20v-5h5' }),
        h('path', { d: 'M8.5 8.5h7' }),
        h('path', { d: 'M8.5 11.5h4.5' }),
      )
    }

    /* ── note card ──────────────────────────────────────────────────────── */
    function NoteCard(props) {
      const { note, t, onSave, onDelete } = props
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState(note.text)
      const [color, setColor] = React.useState(note.color)
      const ref = React.useRef(null)

      React.useEffect(() => {
        if (!editing) return
        const node = ref.current
        if (node !== null && typeof node.focus === 'function') node.focus()
      }, [editing])

      const startEdit = () => {
        setDraft(note.text)
        setColor(note.color)
        setEditing(true)
      }
      const commit = () => {
        const text = draft.trim()
        if (text === '') return
        setEditing(false)
        onSave({ ...note, text, color })
      }
      const cancel = () => {
        setEditing(false)
        setDraft(note.text)
      }

      const tint = `nw-tint-${COLORS.includes(color) ? color : 'amber'}`
      const cardClass = ['nw-note', tint, note.pinned ? 'nw-note-pinned' : ''].filter(Boolean).join(' ')

      return h(
        'div',
        { className: 'nw-grid-item' },
        h(
          'article',
          { className: cardClass, 'aria-label': note.text.slice(0, 60) },
          h('div', { className: 'nw-note-bar' }),
          editing
            ? h(
                React.Fragment,
                null,
                h('textarea', {
                  ref,
                  className: 'nw-editor',
                  value: draft,
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      cancel()
                    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      commit()
                    }
                  },
                  'aria-label': t('action.edit'),
                }),
                h(
                  'div',
                  { className: 'nw-editor-foot' },
                  h(
                    'div',
                    { className: 'nw-swatches' },
                    ...COLORS.map((id) =>
                      h('button', {
                        key: id,
                        type: 'button',
                        className: `nw-swatch ${id === color ? 'nw-swatch-on' : ''} nw-tint-${id}`,
                        'aria-label': id,
                        'aria-pressed': id === color,
                        onClick: () => setColor(id),
                      }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'nw-editor-actions' },
                    h('button', { type: 'button', className: 'nw-btn nw-btn-ghost', onClick: cancel }, t('action.cancel')),
                    h('button', { type: 'button', className: 'nw-btn nw-btn-primary', onClick: commit }, t('action.save')),
                  ),
                ),
              )
            : h(
                React.Fragment,
                null,
                h('div', { className: 'nw-note-body', onDoubleClick: startEdit }, note.text),
                h(
                  'div',
                  { className: 'nw-note-foot' },
                  h('time', { className: 'nw-note-time', dateTime: note.updatedAt }, fmtTime(note.updatedAt)),
                  h(
                    'div',
                    { className: `nw-note-actions ${note.pinned ? 'nw-note-actions-on' : ''}` },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: `nw-icon-btn ${note.pinned ? 'nw-icon-btn-on' : ''}`,
                        title: note.pinned ? t('action.unpin') : t('action.pin'),
                        'aria-label': note.pinned ? t('action.unpin') : t('action.pin'),
                        'aria-pressed': note.pinned,
                        onClick: () => onSave({ ...note, pinned: !note.pinned }),
                      },
                      h(Icon, { paths: paths.pin, size: 13, bold: note.pinned }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'nw-icon-btn',
                        title: t('action.edit'),
                        'aria-label': t('action.edit'),
                        onClick: startEdit,
                      },
                      h(Icon, { paths: paths.pencil, size: 13 }),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'nw-icon-btn nw-icon-btn-danger',
                        title: t('action.delete'),
                        'aria-label': t('action.delete'),
                        onClick: () => onDelete(note),
                      },
                      h(Icon, { paths: paths.trash, size: 13 }),
                    ),
                  ),
                ),
              ),
        ),
      )
    }

    /* ── composer ───────────────────────────────────────────────────────── */
    function Composer(props) {
      const { t, onSave, onClose } = props
      const [draft, setDraft] = React.useState('')
      const [color, setColor] = React.useState('amber')
      const ref = React.useRef(null)

      React.useEffect(() => {
        const node = ref.current
        if (node !== null && typeof node.focus === 'function') node.focus()
      }, [])

      const commit = () => {
        const text = draft.trim()
        if (text === '') return
        onSave({ text, color })
        setDraft('')
      }

      return h(
        'div',
        { className: `nw-composer nw-tint-${color}` },
        h('div', { className: 'nw-note-bar' }),
        h('textarea', {
          ref,
          className: 'nw-editor',
          placeholder: t('composer.placeholder'),
          value: draft,
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              onClose()
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              commit()
            }
          },
          'aria-label': t('action.new'),
        }),
        h(
          'div',
          { className: 'nw-editor-foot' },
          h(
            'div',
            { className: 'nw-swatches' },
            ...COLORS.map((id) =>
              h('button', {
                key: id,
                type: 'button',
                className: `nw-swatch ${id === color ? 'nw-swatch-on' : ''} nw-tint-${id}`,
                'aria-label': id,
                'aria-pressed': id === color,
                onClick: () => setColor(id),
              }),
            ),
          ),
          h(
            'div',
            { className: 'nw-editor-actions' },
            h('button', { type: 'button', className: 'nw-btn nw-btn-ghost', onClick: onClose }, t('action.cancel')),
            h('button', { type: 'button', className: 'nw-btn nw-btn-primary', disabled: draft.trim() === '', onClick: commit }, t('action.save')),
          ),
        ),
      )
    }

    /* ── page ───────────────────────────────────────────────────────────── */
    function NoteWallPage(props) {
      const t = props.t
      const api = props.api
      const [notes, setNotes] = React.useState(null)
      const [status, setStatus] = React.useState('loading')
      const [failure, setFailure] = React.useState('')
      const [composing, setComposing] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      const [confirmClear, setConfirmClear] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        api
          .invoke('list')
          .then((value) => {
            if (!alive) return
            setNotes(Array.isArray(value.notes) ? value.notes : [])
            setStatus('ready')
          })
          .catch((error) => {
            if (!alive) return
            setStatus('failed')
            setFailure(String(error && error.message ? error.message : error))
          })
        return () => {
          alive = false
        }
      }, [api])

      React.useEffect(() => {
        if (!confirmClear) return
        const timer = setTimeout(() => setConfirmClear(false), 4000)
        return () => clearTimeout(timer)
      }, [confirmClear])

      const applyResult = (value) => {
        if (value && Array.isArray(value.notes)) setNotes(value.notes)
      }

      const create = (draft) => {
        api
          .invoke('save', { text: draft.text, color: draft.color })
          .then((value) => {
            applyResult(value)
            setComposing(false)
            setStatus('ready')
          })
          .catch((error) => {
            setStatus('failed')
            setFailure(String(error && error.message ? error.message : error))
          })
      }

      const update = (note) => {
        api
          .invoke('save', { id: note.id, text: note.text, color: note.color, pinned: note.pinned })
          .then(applyResult)
          .catch((error) => {
            setStatus('failed')
            setFailure(String(error && error.message ? error.message : error))
          })
      }

      const remove = (note) => {
        api
          .invoke('remove', { id: note.id })
          .then(applyResult)
          .catch((error) => {
            setStatus('failed')
            setFailure(String(error && error.message ? error.message : error))
          })
      }

      const clearAll = () => {
        if (!confirmClear) {
          setConfirmClear(true)
          return
        }
        setConfirmClear(false)
        api
          .invoke('clear')
          .then(applyResult)
          .catch((error) => {
            setStatus('failed')
            setFailure(String(error && error.message ? error.message : error))
          })
      }

      const shown = React.useMemo(() => {
        const list = Array.isArray(notes) ? notes : []
        const needle = query.trim().toLowerCase()
        return list.filter((note) => {
          if (filter === 'pinned' && !note.pinned) return false
          if (needle === '') return true
          const haystack = `${note.text} ${Array.isArray(note.tags) ? note.tags.join(' ') : ''}`.toLowerCase()
          return haystack.includes(needle)
        })
      }, [notes, query, filter])

      const total = Array.isArray(notes) ? notes.length : 0
      const broken = status === 'failed'
      const hostMissing = failure === 'host-unavailable'

      const header = h(
        'div',
        { className: 'nw-head' },
        h(
          'div',
          { className: 'nw-titles' },
          h('b', null, t('page.title')),
          total > 0 ? h('span', { className: 'nw-count' }, t('count', { n: total })) : null,
        ),
        h(
          'div',
          { className: 'nw-head-actions' },
          h('input', {
            className: 'nw-search',
            type: 'search',
            value: query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'nw-btn nw-btn-primary',
              onClick: () => setComposing((open) => !open),
              disabled: hostMissing,
            },
            t('action.new'),
          ),
          total > 0
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'nw-btn',
                  onClick: clearAll,
                  title: t('action.clear'),
                },
                confirmClear ? t('action.confirmClear') : t('action.clear'),
              )
            : null,
        ),
      )

      const filters = h(
        'div',
        { className: 'nw-filters' },
        ...['all', 'pinned'].map((id) =>
          h(
            'button',
            {
              key: id,
              type: 'button',
              className: `nw-chip ${filter === id ? 'nw-chip-on' : ''}`,
              'aria-pressed': filter === id,
              onClick: () => setFilter(id),
            },
            t(id === 'all' ? 'filter.all' : 'filter.pinned'),
          ),
        ),
        hostMissing ? h('span', { className: 'nw-hint' }, t('state.hostUnavailable')) : null,
      )

      let body
      if (broken) {
        body = h('div', { className: 'nw-banner', role: 'alert' }, t('state.failed', { reason: hostMissing ? t('state.hostUnavailable') : failure }))
      } else if (status === 'loading') {
        body = h('div', { className: 'nw-hint' }, t('state.loading'))
      } else if (shown.length === 0) {
        body = h(
          'div',
          { className: 'nw-empty' },
          h('b', null, t('empty.title')),
          h('span', null, total === 0 ? t('empty.hint') : t('empty.filtered')),
        )
      } else {
        body = h(
          'ul',
          { className: 'nw-grid' },
          ...shown.map((note) => h('li', { key: note.id, className: 'nw-grid-cell' }, h(NoteCard, { note, t, onSave: update, onDelete: remove }))),
        )
      }

      return h(
        'div',
        { className: 'nw-root' },
        header,
        filters,
        composing ? h(Composer, { t, onSave: create, onClose: () => setComposing(false) }) : null,
        body,
      )
    }

    /* ── client plugin ──────────────────────────────────────────────────── */
    return {
      name: NS,
      apply(ctx) {
        const t = createTranslator(ctx)
        const api = createApi(ctx)
        try {
          installStyles(ctx)
        } catch (error) {
          console.warn('note-wall: stylesheet not installed', error)
        }

        try {
          if (typeof ctx.inject !== 'function') return
          ctx.inject(['slots'], (owner) => {
            try {
              const slots = serviceAt(owner, 'slots') ?? serviceAt(ctx, 'slots')
              if (slots === undefined || slots === null || typeof slots.inject !== 'function') return
              slots.inject('main', () =>
                slots.register(
                  { name: 'main', key: PANEL_ID, locale: NS },
                  (props) => h(NoteWallPage, { ...props, t, api }),
                ),
              )
              slots.inject('sidebar.panellist', () =>
                slots.register(
                  { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('nav.title'), locale: NS },
                  NoteWallIcon,
                ),
              )
            } catch (error) {
              console.warn('note-wall: slot registration failed', error)
            }
          })
        } catch (error) {
          console.warn('note-wall: client half failed', error)
        }
      },
    }
  },
})
