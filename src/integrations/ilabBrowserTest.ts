import SparkMD5 from 'spark-md5'

// ONLY the publicly documented shared test credentials. Never put production secrets here.
const appid = '10000'
const secret = 'DDO7jw9TAZlLwRLRKSpBWXIlYZe9PKaD5Wc1S5ZQ0U8='
const base = 'http://39.105.173.29'
const projectTitle = '接口连通公测课程页'
let session: { username: string; displayName: string; csrfToken: string; expiresAt: number; mode: 'test'; projectTitle: string; sessionId: string; token: string } | null = null
const attempts = new Map<string, { status: 'uncertain' | 'uploaded'; id?: string; code?: number }>()
const attemptKey = 'simulator.ilab.public-test.attempts.v1'
try { const saved = JSON.parse(localStorage.getItem(attemptKey) ?? '[]'); if (Array.isArray(saved)) for (const [key, value] of saved) if (typeof key === 'string' && (value?.status === 'uncertain' || value?.status === 'uploaded')) attempts.set(key, value) } catch { /* Upload is blocked if persistence is unavailable. */ }
function persistAttempts() { localStorage.setItem(attemptKey, JSON.stringify([...attempts])) }
const json = (value: unknown, status = 200) => Response.json(value, { status })
const publicSession = () => session && ({ username: session.username, displayName: session.displayName, csrfToken: session.csrfToken, expiresAt: session.expiresAt, mode: session.mode, projectTitle, sessionId: session.sessionId })

/** Browser-only official public test mode. HTTP mixed content / CORS may block the real request. */
export async function browserTestTransport(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = String(input).split('?')[0]!.replace('/api/ilab/', '')
  if (path === 'config') return json({ enabled: true, mode: 'test', appid, projectTitle, requiresAiData: true })
  if (path === 'session') return session ? json(publicSession()) : json({ error: '请从测试平台重新进入' }, 401)
  if (path === 'logout') { session = null; return json({ status: 'logged_out' }) }
  if (path === 'auth') {
    session = null
    const ticket = JSON.parse(String(init?.body ?? '{}')).ticket
    if (typeof ticket !== 'string' || !ticket) return json({ error: '测试 ticket 无效' }, 400)
    const url = new URL('/open/api/v2/token', base)
    url.search = new URLSearchParams({ ticket, appid, signature: SparkMD5.hash(ticket + appid + secret).toUpperCase() }).toString()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' })
      const value = await response.json()
      const expiry = Number(value.expires_time); const expiresAt = expiry < 1e12 ? expiry * 1000 : expiry
      if (!response.ok || value.code !== 0 || typeof value.un !== 'string' || typeof value.access_token !== 'string' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return json({ error: `测试平台认证失败（返回码 ${typeof value.code === 'number' ? value.code : '未知'}）` }, 401)
      session = { username: value.un, displayName: typeof value.dis === 'string' ? value.dis : value.un, csrfToken: crypto.randomUUID(), expiresAt, mode: 'test', projectTitle, sessionId: crypto.randomUUID(), token: value.access_token }
      return json(publicSession())
    } catch { return json({ error: '无法连接官方测试接口：GitHub Pages 的 HTTPS 页面可能被浏览器拦截 HTTP 请求或跨域请求。请查看浏览器控制台。' }, 502) }
  }
  if (!session) return json({ error: '请先通过测试平台 ticket 认证' }, 401)
  if (path === 'results' && init?.method === 'POST') {
    if (Date.now() >= session.expiresAt) return json({ error: '测试 token 已过期，请从平台重新进入。' }, 401)
    const result = JSON.parse(String(init.body ?? '{}')).result
    if (!result || typeof result.originId !== 'string') return json({ error: '实验结果无效' }, 400)
    const key = `${session.username}:${result.originId}`
    const old = attempts.get(key)
    if (old?.status === 'uploaded') return json({ status: 'uploaded', originId: result.originId, id: old.id, platformResponse: { code: old.code, id: old.id } })
    if (old?.status === 'uncertain') return json({ error: '上次请求结果不确定，请先到测试平台人工核查，不能重复上传。', status: 'uncertain' }, 409)
    const payload = { ...result, username: session.username, appid, title: projectTitle }
    const url = new URL('/open/api/v2/data_upload', base); url.searchParams.set('access_token', session.token)
    attempts.set(key, { status: 'uncertain' })
    try { persistAttempts() } catch { attempts.delete(key); return json({ error: '浏览器存储不可用，为防止重复提交已阻止上传。' }, 503) }
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error' })
      const value = await response.json()
      if (typeof value.code === 'number' && value.code !== 0) { attempts.delete(key); persistAttempts(); return json({ error: `测试平台拒绝（返回码 ${value.code}）`, platformResponse: { code: value.code } }, 502) }
      if (!response.ok || value.code !== 0 || !((typeof value.id === 'string' && value.id) || typeof value.id === 'number')) return json({ error: '平台未明确确认结果，请先人工核查。', status: 'uncertain' }, 502)
      const id = String(value.id); attempts.set(key, { status: 'uploaded', id, code: value.code }); persistAttempts()
      return json({ status: 'uploaded', originId: result.originId, id, platformResponse: { code: value.code, id: value.id } })
    } catch { return json({ error: '测试上传无法确认：浏览器可能拦截 HTTP 或跨域请求；请先在平台核查后再试。', status: 'uncertain' }, 502) }
  }
  return json({ error: '浏览器公测直连不支持报告上传或结果查询；请使用平台后台核查。' }, 501)
}
