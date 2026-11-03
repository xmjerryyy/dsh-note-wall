/**
 * dsh-note-wall — Host half.
 *
 * Owns the notes file and answers the browser half over one exact Fetch route
 * (`/api/dsh-note-wall`). The browser half speaks the harness's `rpc.call`
 * dialect, which posts `{ type: 'client-request', rpcId, payload: { method,
 * payload } }`; every answer is `{ type: 'server-response', rpcId, result }`.
 *
 * Why a route and not a Client-callable Remote service: a plain-JS package
 * bundle cannot register generated typert Remotes, and this keeps the whole
 * feature inside the package with no dependency on harness internals. The
 * trade-off is that the note store is package-private rather than shared with
 * other plugins; the agent-facing tool below covers the model's access.
 *
 * Storage is a single JSON document under `<DSH_HOME>/note-wall/notes.json`,
 * written atomically (temp file + rename) so a crash never truncates the wall.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-note-wall'

/** Only these methods are reachable from the browser; anything else is rejected. */
const METHODS = new Set(['list', 'save', 'remove', 'clear'])
const ROUTE_PATH = '/api/dsh-note-wall'
const MAX_NOTE_CHARS = 10000
const MAX_NOTES = 2000

const COLOR_IDS = new Set(['amber', 'rose', 'violet', 'sky', 'mint', 'slate'])

/** `<DSH_HOME>/note-wall/notes.json`, falling back to `~/.dsh/note-wall`. */
function storeRoot() {
  const home = process.env.DSH_HOME
  const base = typeof home === 'string' && home !== '' ? home : join(homedir(), '.dsh')
  return join(base, 'note-wall')
}

function storeFile() {
  return join(storeRoot(), 'notes.json')
}

function nowIso() {
  return new Date().toISOString()
}

function emptyStore() {
  return { version: 1, notes: [] }
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeText(value) {
  if (typeof value !== 'string') return ''
  // Keep the author's line breaks, drop the control bytes that would break
  // the JSON round trip, and bound the note so one paste cannot fill the disk.
  const cleaned = value
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
  return cleaned.slice(0, MAX_NOTE_CHARS)
}

/** Coerce one stored/incoming record into the canonical note shape, or null. */
function normalizeNote(value) {
  const raw = asRecord(value)
  if (raw === null) return null
  const text = normalizeText(raw.text)
  if (text === '') return null
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : randomUUID()
  const color = typeof raw.color === 'string' && COLOR_IDS.has(raw.color) ? raw.color : 'amber'
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt
  const pinned = raw.pinned === true
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim().slice(0, 24)).filter(Boolean))].slice(0, 8)
    : []
  return { id, text, color, createdAt, updatedAt, pinned, tags }
}

function normalizeStore(value) {
  const raw = asRecord(value)
  const notes = Array.isArray(raw?.notes) ? raw.notes : []
  const kept = []
  const seen = new Set()
  for (const entry of notes) {
    const note = normalizeNote(entry)
    if (note === null || seen.has(note.id)) continue
    seen.add(note.id)
    kept.push(note)
  }
  return { version: 1, notes: kept.slice(0, MAX_NOTES) }
}

/** Pinned first, then newest — the order the wall renders. */
function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

/** Property first (live), then a guarded `get` — never the other way round. */
function readService(ctx, name) {
  try {
    const direct = ctx[name]
    if (direct !== undefined && direct !== null) return direct
  } catch {}
  try {
    if (typeof ctx.get === 'function') return ctx.get(name)
  } catch {}
  return undefined
}

export const inject = ['connection', 'tools']

export function apply(ctx) {
  // Read injected services as properties (`ctx.connection`), never through a
  // one-shot `ctx.get('connection')`: the get form races fiber activation and
  // silently answers `undefined`, which would disable the whole plugin with no
  // error anywhere. The property is live for the life of this fiber.
  const connection = ctx.connection ?? readService(ctx, 'connection')
  const fetchRegistry = connection === undefined || connection === null ? undefined : connection.fetch
  // The two halves are independent: the agent tool reads the store directly and
  // must work even where the Fetch carrier is absent, so a missing route is a
  // warning about the browser UI only — never an early return that would also
  // drop the tool.
  const routeUp = fetchRegistry !== undefined && fetchRegistry !== null && typeof fetchRegistry.register === 'function'
  if (!routeUp) {
    ctx.logger?.warn?.('note-wall: connection.fetch unavailable; the browser wall cannot reach the store')
  }

  let queue = Promise.resolve()
  /** Serialize every read-modify-write so two browser tabs cannot clobber each other. */
  function serialize(operation) {
    const run = queue.then(operation, operation)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function readStore() {
    try {
      const text = await readFile(storeFile(), 'utf8')
      return normalizeStore(JSON.parse(text))
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyStore()
      // A corrupt file must not brick the panel: keep the bytes for post-mortem
      // and start a fresh wall instead of throwing on every open.
      try {
        await rename(storeFile(), `${storeFile()}.corrupt-${Date.now()}`)
      } catch {}
      return emptyStore()
    }
  }

  async function writeStore(store) {
    const file = storeFile()
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, `${JSON.stringify({ version: 1, notes: store.notes }, null, 2)}\n`, 'utf8')
    await rename(temp, file)
  }

  const handlers = {
    async list() {
      const store = await serialize(readStore)
      return { notes: sortNotes(store.notes) }
    },

    async save(args) {
      const input = asRecord(args) ?? {}
      const id = typeof input.id === 'string' && input.id !== '' ? input.id : undefined
      const suppliedText = normalizeText(input.text)
      // Text is required only for a NEW note. An update may carry just the pin
      // or the colour, so the field is resolved against the stored note below.
      if (id === undefined && suppliedText === '') return { notes: null, error: 'empty' }
      return serialize(async () => {
        const store = await readStore()
        const index = id === undefined ? -1 : store.notes.findIndex((note) => note.id === id)
        const time = Date.now()
        if (index >= 0) {
          const previous = store.notes[index]
          const next = normalizeNote({
            ...previous,
            text: suppliedText === '' ? previous.text : suppliedText,
            color: typeof input.color === 'string' ? input.color : previous.color,
            pinned: typeof input.pinned === 'boolean' ? input.pinned : previous.pinned,
            tags: Array.isArray(input.tags) ? input.tags : previous.tags,
            updatedAt: time,
          })
          store.notes[index] = next
        } else {
          if (store.notes.length >= MAX_NOTES) return { notes: null, error: 'full' }
          const created = normalizeNote({
            id: id ?? randomUUID(),
            text: suppliedText,
            color: input.color,
            tags: input.tags,
            pinned: input.pinned === true,
            createdAt: time,
            updatedAt: time,
          })
          if (created === null) return { notes: null, error: 'empty' }
          store.notes.unshift(created)
        }
        await writeStore(store)
        return { notes: sortNotes(store.notes), error: null }
      })
    },

    async remove(args) {
      const input = asRecord(args) ?? {}
      const id = typeof input.id === 'string' ? input.id : ''
      return serialize(async () => {
        const store = await readStore()
        const next = store.notes.filter((note) => note.id !== id)
        if (next.length !== store.notes.length) await writeStore({ version: 1, notes: next })
        return { notes: sortNotes(next), error: null }
      })
    },

    async clear() {
      return serialize(async () => {
        await writeStore(emptyStore())
        return { notes: [], error: null }
      })
    },
  }

  const routeFetch = async (request) => {
    if (!request || request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 })
    }
    let body = null
    try {
      body = await request.json()
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
    const reply = (result) => Response.json({ type: 'server-response', rpcId, result })
    if (body?.type !== 'client-request') return reply({ ok: false, error: { code: 'bad-request', message: 'not a client-request', details: {} } })
    const call = asRecord(body.payload)
    const method = typeof call?.method === 'string' ? call.method : ''
    if (!METHODS.has(method)) {
      return reply({ ok: false, error: { code: 'bad-request', message: `unknown method: ${method}`, details: {} } })
    }
    try {
      const value = await handlers[method](call?.payload)
      return reply({ ok: true, value })
    } catch (error) {
      return reply({ ok: false, error: { code: 'internal', message: String(error?.message ?? error), details: {} } })
    }
  }

  if (routeUp) {
    try {
      ctx.effect(
        () => fetchRegistry.register({ path: ROUTE_PATH, methods: ['POST'], requestBody: 'buffered', fetch: routeFetch }),
        'note-wall: rpc route',
      )
    } catch (error) {
      const message = String(error?.message ?? error)
      // A live patch reload replays the row; the earlier instance keeps serving.
      if (!/already registered|duplicate/i.test(message)) {
        ctx.logger?.warn?.(`note-wall: route registration failed: ${message}`)
      }
    }
  }

  registerTool(ctx, handlers)
}

/**
 * The agent's half of the same operations: one tool, one action parameter,
 * calling the handlers the browser calls. Without it the wall would be a place
 * the model cannot read, which is the wrong default for "jot down an idea".
 *
 * `tools` is a declared injection, so the framework holds this row until the
 * registry exists and `ctx.tools` is a live service, not a racing probe.
 */
function registerTool(ctx, handlers) {
  const tools = readService(ctx, 'tools')
  if (tools === undefined || tools === null || typeof tools.register !== 'function') {
    ctx.logger?.warn?.('note-wall: tools service missing; the note_wall tool is unavailable')
    return
  }
  const call = (method, args) => handlers[method](args)
  try {
    ctx.effect(
      () =>
        tools.register({
          name: 'note_wall',
          description:
            '便签墙（用户侧边栏里的灵感便签）。action=list 读取全部便签；action=add 新增一条；action=update 改写一条；action=remove 删除一条；action=clear 清空。用户说"记一下""存成便签""把想法放墙上"时用 add。',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['list', 'add', 'update', 'remove', 'clear'], description: '要执行的操作。' },
              text: { type: 'string', description: '便签正文（add/update 必填）。' },
              id: { type: 'string', description: '便签 id（update/remove 必填）。' },
              color: { type: 'string', enum: ['amber', 'rose', 'violet', 'sky', 'mint', 'slate'], description: '便签颜色。' },
              pinned: { type: 'boolean', description: '是否置顶。' },
            },
            required: ['action'],
          },
          output: {
            schema: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                notes: { type: 'array', items: { type: 'object', additionalProperties: true } },
                error: { type: ['string', 'null'] },
              },
            },
            render(_args, value) {
              const record = asRecord(value)
              const notes = Array.isArray(record?.notes) ? record.notes : null
              const failure = typeof record?.error === 'string' ? record.error : null
              let text
              if (record?.ok === false) text = `便签墙操作失败：${failure ?? '未知错误'}`
              else if (notes === null) text = '便签墙已更新。'
              else if (notes.length === 0) text = '便签墙现在没有便签。'
              else
                text = [
                  `便签墙共 ${notes.length} 条：`,
                  ...notes.map((note, index) => {
                    const item = asRecord(note) ?? {}
                    const pin = item.pinned === true ? '📌 ' : ''
                    const tags = Array.isArray(item.tags) && item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''
                    return `${index + 1}. ${pin}${String(item.text ?? '')}${tags}  \`${String(item.id ?? '')}\``
                  }),
                ].join('\n')
              return [{ type: 'text', text }]
            },
          },
          execute: async (args) => {
            const input = asRecord(args) ?? {}
            const action = typeof input.action === 'string' ? input.action : ''
            try {
              if (action === 'list') {
                const result = await call('list', {})
                return { ok: true, notes: result.notes, error: null }
              }
              if (action === 'add' || action === 'update') {
                const result = await call('save', {
                  id: action === 'update' ? input.id : undefined,
                  text: input.text,
                  color: input.color,
                  pinned: input.pinned,
                })
                if (result.error !== null) return { ok: false, notes: null, error: result.error }
                return { ok: true, notes: result.notes, error: null }
              }
              if (action === 'remove') {
                const result = await call('remove', { id: input.id })
                return { ok: true, notes: result.notes, error: null }
              }
              if (action === 'clear') {
                const result = await call('clear', {})
                return { ok: true, notes: result.notes, error: null }
              }
              return { ok: false, notes: null, error: `unknown action: ${action}` }
            } catch (error) {
              return { ok: false, notes: null, error: String(error?.message ?? error) }
            }
          },
        }),
      'note-wall: agent tool',
    )
  } catch (error) {
    ctx.logger?.warn?.(`note-wall: tool registration failed: ${String(error?.message ?? error)}`)
  }
}
