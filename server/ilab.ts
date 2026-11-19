import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateExperimentResult, type IlabExperimentResult } from '../src/integrations/result.ts'
import { handleInternalTest, type InternalTestConfig } from './internal-test.ts'

export interface IlabConfig {
  mode?: 'test' | 'production'; appid?: string; secret?: string; projectTitle?: string
  requiresAiData?: boolean; allowedOrigins?: string[]; cookieSecure?: boolean
  sessionTtlMs?: number; maxSessions?: number; timeoutMs?: number
  internalTest?: InternalTestConfig
}
type Session = { username: string; displayName: string; csrfToken: string; expiresAt: number; sessionId: string; token: string; originalToken: string; tokenExpires: number; refreshes: number; refreshing?: Promise<string> }
type RecordEntry = { result: IlabExperimentResult; status: 'uploaded' | 'failed' | 'uncertain'; id?: string | number; confirmed?: boolean; platformResponse?: { code: number; id?: string | number }; attachment?: { hash: string; status: 'uploaded' | 'failed' | 'uncertain'; id?: string } }
class Failure extends Error {
  http: number; code?: string | number; uncertain: boolean
  constructor(http: number, message: string, code?: string | number, uncertain = false) { super(message); this.http = http; this.code = code; this.uncertain = uncertain }
}
const random = () => randomBytes(32).toString('hex')
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
const object = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v)

export function createIlabServer(config: IlabConfig, options: { fetch?: typeof fetch; now?: () => number; dataDir?: string } = {}) {
  const mode = config.mode ?? 'test', now = options.now ?? Date.now
  const enabled = !!(config.appid && config.secret && config.projectTitle)
  const secure = mode === 'production' || config.cookieSecure === true
  const base = mode === 'production' ? 'https://www.ilab-x.com' : 'http://39.105.173.29'
  const sessions = new Map<string, Session>(), locks = new Set<string>()
  const dataDir = resolve(options.dataDir ?? '.ilab-data')
  const signature = (value: string) => createHash('md5').update(value + config.appid + config.secret).digest('hex').toUpperCase()
  const expiry = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : 0 }
  async function upstream(path: string, params: Record<string, string>, body?: unknown, attachment?: Buffer) {
    const url = new URL(path, base)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    try {
      const response = await (options.fetch ?? fetch)(url, {
        method: body === undefined && attachment === undefined ? 'GET' : 'POST', redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
        headers: attachment !== undefined ? { 'Content-Type': 'application/octet-stream' } : body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(attachment !== undefined ? { body: new Uint8Array(attachment).buffer } : body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) throw new Error('http')
      const value: unknown = await response.json()
      if (!object(value)) throw new Error('json')
      return value
    } catch { throw new Failure(502, '上游响应无法确认，请人工确认后再操作', 'UPSTREAM_UNCERTAIN', true) }
  }
  async function token(s: Session): Promise<string> {
    if (s.refreshing) return s.refreshing
    if (s.tokenExpires > now()) return s.token
    s.refreshing = (async () => {
      while (s.tokenExpires <= now() && s.refreshes < 2) {
        s.refreshes++
        const r = await upstream('/open/api/v2/token/refresh', { access_token: s.originalToken, appid: config.appid!, signature: signature(s.originalToken) })
        if (r.code !== 0 || typeof r.access_token !== 'string' || !r.access_token) throw new Failure(401, '登录已过期，请从实验空间重新进入', 'TOKEN_EXPIRED')
        s.token = r.access_token; s.tokenExpires = expiry(r.expires_time)
      }
      if (s.tokenExpires <= now()) throw new Failure(401, '登录已过期，请从实验空间重新进入', 'TOKEN_EXPIRED')
      return s.token
    })()
    try { return await s.refreshing } finally { delete s.refreshing }
  }
  function file(key: string) { return resolve(dataDir, `${key}.json`) }
  async function load(key: string): Promise<RecordEntry | undefined> {
    try { return JSON.parse(await readFile(file(key), 'utf8')) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e }
  }
  async function save(key: string, entry: RecordEntry) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 })
    const temp = `${file(key)}.${random()}.tmp`
    await writeFile(temp, JSON.stringify(entry), { mode: 0o600 }); await rename(temp, file(key))
  }
  async function confirm(s: Session, key: string, entry: RecordEntry) {
    try {
      const t = await token(s)
      const r = await upstream('/open/api/v2/data_get', { access_token: t, appid: config.appid!, signature: signature(t), originId: entry.result.originId, username: s.username })
      const expected = entry.result
      // Official data_get returns {meta, data:[...]}, without code/id in its documented success example.
      // Object-shaped responses remain supported, but an absent numeric upload id must never be fabricated.
      const candidates = Array.isArray(r.data) ? r.data : object(r.data) ? [r.data] : [r]
      const fields = ['username', 'appid', 'originId', 'title', 'score', 'status', 'startTime', 'endTime', 'timeUsed'] as const
      const sameValue = (actual: unknown, wanted: unknown) => typeof wanted === 'number'
        ? (typeof actual === 'number' || (typeof actual === 'string' && /^\d+$/.test(actual))) && Number(actual) === wanted : actual === wanted
      const matches = candidates.filter(data => object(data) && fields.every(k => sameValue(data[k], expected[k])) &&
        Array.isArray(data.steps) && data.steps.length === expected.steps.length && expected.steps.every((step, index) => {
          const actual = data.steps[index]
          return object(actual) && Object.entries(step).every(([k, v]) => typeof v === 'object' ? canonical(actual[k]) === canonical(v) : sameValue(actual[k], v))
        }) && (expected.ai_data === undefined || data.ai_data === undefined || canonical(data.ai_data) === canonical(expected.ai_data)))
      if ((r.code === undefined || r.code === 0) && matches.length === 1) {
        const data = matches[0]!
        entry.status = 'uploaded'; entry.confirmed = true
        if ((typeof data.id === 'string' && data.id.length > 0) || (typeof data.id === 'number' && Number.isSafeInteger(data.id))) entry.id = data.id
        await save(key, entry); return entry
      }
    } catch { /* Never resend an upload whose outcome is unknown. */ }
    throw new Failure(409, '结果尚无法确认，请联系管理员人工确认；请勿新建originId或重复上传', 'MANUAL_CONFIRMATION_REQUIRED', true)
  }
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)) }
    try {
      if (config.internalTest && await handleInternalTest(req, res, config.internalTest)) return
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      if (req.method === 'GET' && path === '/api/ilab/config') return send(200, { enabled, mode, appid: config.appid ?? '', projectTitle: config.projectTitle ?? '', requiresAiData: config.requiresAiData ?? true })
      if (!enabled) throw new Failure(503, '实验空间集成未配置', 'DISABLED')
      let body: Record<string, any> = {}
      if (req.method === 'POST') {
        if (!(config.allowedOrigins ?? ['http://localhost:5173']).includes(req.headers.origin ?? '')) throw new Failure(403, 'Origin不允许')
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new Failure(415, '需要JSON请求')
        const chunks: Buffer[] = []; let size = 0
        const limit = path === '/api/ilab/reports' ? 7 * 1024 * 1024 : 262144
        for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Failure(413, '请求过大'); chunks.push(Buffer.from(chunk)) }
        try { const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString()); if (!object(parsed)) throw new Error(); body = parsed } catch { throw new Failure(400, 'JSON格式错误') }
      }
      for (const [id, s] of sessions) if (s.expiresAt <= now()) sessions.delete(id)
      const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('ilab_session='))?.slice(13)
      const session = cookie ? sessions.get(cookie) : undefined
      const publicSession = (s: Session) => ({ username: s.username, displayName: s.displayName, csrfToken: s.csrfToken, expiresAt: s.expiresAt, mode, projectTitle: config.projectTitle, sessionId: s.sessionId })
      if (req.method === 'POST' && path === '/api/ilab/auth') {
        // An attempted account switch must not leave a previous user's session usable after auth failure.
        if (cookie) sessions.delete(cookie)
        res.setHeader('Set-Cookie', `ilab_session=; HttpOnly; SameSite=Lax; Path=/api/ilab; Max-Age=0${secure ? '; Secure' : ''}`)
        if (typeof body.ticket !== 'string' || !body.ticket || body.ticket.length > 8192) throw new Failure(400, 'ticket格式错误')
        if (sessions.size >= (config.maxSessions ?? 1000)) throw new Failure(503, '会话数量已达上限')
        const r = await upstream('/open/api/v2/token', { ticket: body.ticket, appid: config.appid!, signature: signature(body.ticket) })
        if (r.code !== 0 || typeof r.access_token !== 'string' || !r.access_token || typeof r.un !== 'string' || !r.un || expiry(r.expires_time) <= now()) throw new Failure(401, '认证失败')
        const ttl = Math.min(config.sessionTtlMs ?? 72 * 3600000, 72 * 3600000)
        const s: Session = { username: r.un, displayName: typeof r.dis === 'string' ? r.dis : r.un, csrfToken: random(), expiresAt: now() + ttl, sessionId: random(), token: r.access_token, originalToken: r.access_token, tokenExpires: expiry(r.expires_time), refreshes: 0 }
        if (cookie) sessions.delete(cookie)
        const id = random(); sessions.set(id, s)
        res.setHeader('Set-Cookie', `ilab_session=${id}; HttpOnly; SameSite=Lax; Path=/api/ilab; Max-Age=${Math.floor((s.expiresAt - now()) / 1000)}${secure ? '; Secure' : ''}`)
        return send(200, publicSession(s))
      }
      if (!session) throw new Failure(401, '请先登录')
      if (req.method === 'POST' && req.headers['x-csrf-token'] !== session.csrfToken) throw new Failure(403, 'CSRF校验失败')
      if (req.method === 'GET' && path === '/api/ilab/session') return send(200, publicSession(session))
      if (req.method === 'POST' && path === '/api/ilab/logout') { sessions.delete(cookie!); res.setHeader('Set-Cookie', `ilab_session=; HttpOnly; SameSite=Lax; Path=/api/ilab; Max-Age=0${secure ? '; Secure' : ''}`); return send(200, { status: 'logged_out' }) }
      if (req.method === 'POST' && path === '/api/ilab/reports') {
        const { originId, filename, title, contentBase64 } = body
        const remarks = body.remarks ?? ''
        if (typeof originId !== 'string' || !/^[A-Za-z0-9_]{1,512}$/.test(originId)) throw new Failure(400, 'originId格式错误')
        if (typeof filename !== 'string' || filename.length > 255 || !/^[^/\\\x00-\x1f]+\.[A-Za-z0-9]{1,12}$/.test(filename)) throw new Failure(400, '报告文件名需要有效扩展名，不能含路径')
        if (typeof title !== 'string' || !title.trim() || title.length > 100 || typeof remarks !== 'string' || remarks.length > 200) throw new Failure(400, '报告标题或备注格式错误')
        if (typeof contentBase64 !== 'string' || !contentBase64 || contentBase64.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) throw new Failure(400, '报告数据无效或超出5MB')
        const bytes = Buffer.from(contentBase64, 'base64')
        if (!bytes.length || bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== contentBase64) throw new Failure(400, '报告数据无效或超出5MB')
        const key = createHash('sha256').update(JSON.stringify([mode, config.appid, session.username, originId])).digest('hex')
        if (locks.has(key)) throw new Failure(409, '该实验正在处理中', 'IN_PROGRESS')
        locks.add(key)
        try {
          const entry = await load(key)
          if (entry?.status !== 'uploaded') throw new Failure(409, '请先成功回传当前用户的实验结果，再上传报告')
          const hash = createHash('sha256').update(bytes).update(JSON.stringify([filename, title, remarks])).digest('hex')
          if (entry.attachment && entry.attachment.hash !== hash) throw new Failure(409, '该实验已绑定其他报告，不能覆盖', 'PAYLOAD_CONFLICT')
          if (entry.attachment?.status === 'uploaded') return send(200, { status: 'uploaded', originId, id: entry.attachment.id })
          if (entry.attachment?.status === 'uncertain') throw new Failure(409, '上次报告上传结果不明确，请在平台人工确认，不能重复上传', 'MANUAL_CONFIRMATION_REQUIRED', true)
          const t = await token(session)
          entry.attachment = { hash, status: 'uncertain' }; await save(key, entry)
          const r = await upstream('/open/api/v2/attachment_upload', { access_token: t, appid: config.appid!, originId, filename, title, remarks }, undefined, bytes)
          if (typeof r.code === 'number' && r.code !== 0) {
            entry.attachment.status = 'failed'; await save(key, entry)
            throw new Failure(502, `实验空间拒绝报告（返回码 ${r.code}），请对照官方说明检查。`, r.code)
          }
          if (r.code !== 0 || !((typeof r.id === 'string' && r.id) || (typeof r.id === 'number' && Number.isSafeInteger(r.id)))) throw new Failure(502, '报告响应没有明确确认成功，请在平台人工确认', 'UPSTREAM_UNCERTAIN', true)
          entry.attachment.status = 'uploaded'; entry.attachment.id = String(r.id); await save(key, entry)
          return send(200, { status: 'uploaded', originId, id: entry.attachment.id })
        } finally { locks.delete(key) }
      }
      if (req.method === 'GET' && path === '/api/ilab/results' && req.headers['x-csrf-token'] !== session.csrfToken) throw new Failure(403, 'CSRF校验失败')
      if (path !== '/api/ilab/results' || !['POST', 'GET'].includes(req.method ?? '')) throw new Failure(404, '接口不存在')
      let result: IlabExperimentResult | undefined
      if (req.method === 'POST') {
        if (!object(body.result)) throw new Failure(400, '结果格式错误')
        result = { ...body.result, username: session.username, appid: config.appid!, title: config.projectTitle! } as IlabExperimentResult
        const error = validateExperimentResult(result, config.requiresAiData ?? true)
        if (error) throw new Failure(400, error.msg, error.code)
      }
      const originId = result?.originId ?? url.searchParams.get('originId')
      if (!originId || originId.length > 512 || !/^[A-Za-z0-9_]+$/.test(originId)) throw new Failure(400, 'originId格式错误')
      const key = createHash('sha256').update(JSON.stringify([mode, config.appid, session.username, originId])).digest('hex')
      if (locks.has(key)) throw new Failure(409, '该结果正在处理中', 'IN_PROGRESS')
      locks.add(key)
      try {
        let entry = await load(key)
        if (entry && result && canonical(entry.result) !== canonical(result)) throw new Failure(409, 'originId已绑定其他结果', 'PAYLOAD_CONFLICT')
        if (entry?.status === 'uncertain') entry = await confirm(session, key, entry)
        if (entry?.status === 'uploaded') return send(200, { status: 'uploaded', originId, ...(entry.id !== undefined ? { id: String(entry.id) } : {}), ...(entry.confirmed ? { confirmed: true } : {}), ...(entry.platformResponse ? { platformResponse: entry.platformResponse } : {}) })
        if (!result) { if (!entry) throw new Failure(404, '没有当前用户的记录'); return send(200, { status: entry.status, originId }) }
        const t = await token(session)
        entry = { result, status: 'uncertain' }; await save(key, entry)
        const r = await upstream('/open/api/v2/data_upload', { access_token: t }, result)
        if (typeof r.code === 'number' && r.code !== 0) {
          entry.status = 'failed'; entry.platformResponse = { code: r.code }; await save(key, entry)
          const failure = new Failure(502, `实验空间拒绝实验结果（返回码 ${r.code}），请对照官方技术说明检查。`, r.code)
          Object.assign(failure, { platformResponse: entry.platformResponse }); throw failure
        }
        if (r.code !== 0 || !((typeof r.id === 'string' && r.id.length > 0) || (typeof r.id === 'number' && Number.isSafeInteger(r.id)))) {
          throw new Failure(502, '平台响应没有明确确认成功，请先查询记录；不能直接重复上传。', 'UPSTREAM_UNCERTAIN', true)
        }
        entry.status = 'uploaded'; entry.id = r.id; entry.platformResponse = { code: r.code, id: r.id }; await save(key, entry)
        return send(200, { status: 'uploaded', originId, id: String(r.id), platformResponse: entry.platformResponse })
      } finally { locks.delete(key) }
    } catch (e) {
      const error = e instanceof Failure ? e : new Failure(500, '服务暂时不可用')
      const platformResponse = (error as Failure & { platformResponse?: { code: number } }).platformResponse
      send(error.http, { error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.uncertain ? { status: 'uncertain' } : {}), ...(platformResponse ? { platformResponse } : {}) })
    }
  }).on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n') })
}
