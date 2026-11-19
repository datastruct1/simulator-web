import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface InternalTestConfig { enabled: boolean; adminKey?: string; allowedOrigins: string[]; dataDir: string }
const adminPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>内部测试成绩</title><body><h1>内部测试成绩（非平台数据）</h1><p>仅供测试，成绩由浏览器提交，未经服务端判分。</p><form id="f"><label>管理员口令 <input id="key" type="password" autocomplete="current-password" required></label> <button>查询</button></form><p id="message"></p><pre id="output" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><script>document.getElementById('f').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('message'),o=document.getElementById('output');o.textContent='';try{const r=await fetch('/api/internal-test/records',{headers:{Authorization:'Bearer '+document.getElementById('key').value},cache:'no-store'});const j=await r.json();m.textContent=r.ok?'最近 '+j.records.length+' 条测试记录':(j.error||'查询失败');if(r.ok)o.textContent=JSON.stringify(j.records,null,2)}catch{m.textContent='连接失败'}};</script></body></html>`

export async function handleInternalTest(req: IncomingMessage, res: ServerResponse, config: InternalTestConfig): Promise<boolean> {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (!path.startsWith('/api/internal-test/')) return false
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
  const send = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)) }
  if (!config.enabled) { send(404, { error: '内部测试模式未启用' }); return true }
  if (req.method === 'GET' && path === '/api/internal-test/config') { send(200, { enabled: true, mode: 'internal-test' }); return true }
  if (req.method === 'GET' && path === '/api/internal-test/admin') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"); res.end(adminPage); return true
  }
  if (req.method === 'GET' && path === '/api/internal-test/records') {
    const provided = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
    const digest = (s: string) => createHash('sha256').update(s).digest()
    if (!config.adminKey || !timingSafeEqual(digest(provided), digest(config.adminKey))) { send(401, { error: '管理员口令错误' }); return true }
    try {
      const names = (await readdir(config.dataDir)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).sort().slice(-500)
      const records = await Promise.all(names.map(async name => JSON.parse(await readFile(resolve(config.dataDir, name), 'utf8'))))
      records.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      send(200, { mode: 'internal-test', records })
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') send(200, { mode: 'internal-test', records: [] }); else send(500, { error: '读取失败' }) }
    return true
  }
  if (req.method === 'POST' && path === '/api/internal-test/records') {
    if (!config.allowedOrigins.includes(req.headers.origin ?? '') || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) { send(403, { error: '请求来源或格式不允许' }); return true }
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) { send(413, { error: '数据过大' }); return true }; chunks.push(Buffer.from(chunk)) }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || typeof body !== 'object' || typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.sessionId) || !body.score || typeof body.score !== 'object' || !['theory', 'operation'].includes(body.score.kind) || typeof body.score.id !== 'string' || body.score.id.length > 150) { send(400, { error: '测试记录格式错误' }); return true }
      // Idempotent per session/score; never trust a browser-supplied path.
      const id = createHash('sha256').update(JSON.stringify([body.sessionId, body.score.id])).digest('hex')
      await mkdir(config.dataDir, { recursive: true, mode: 0o700 })
      const filename = resolve(config.dataDir, `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}.json`)
      const record = { mode: 'internal-test', identity: '测试用户', sessionId: body.sessionId, receivedAt: new Date().toISOString(), score: body.score }
      try { await writeFile(filename, JSON.stringify(record), { flag: 'wx', mode: 0o600 }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e }
      send(200, { status: 'saved', mode: 'internal-test', id, sessionId: body.sessionId }); return true
    } catch { send(400, { error: '保存失败，请检查数据或联系管理员' }); return true }
  }
  send(404, { error: '接口不存在' }); return true
}
