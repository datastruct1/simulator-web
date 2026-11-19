import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIlabServer } from '../server/ilab.ts'
const origin = 'http://localhost:5173'
const result = { username: 'spoof', appid: 'spoof', title: 'spoof', originId: 'sample_1', status: 2, score: 80, startTime: 1700000000000, endTime: 1700000010000, timeUsed: 10, steps: [] }
const sign = value => createHash('md5').update(value + 'app' + 'SECRET').digest('hex').toUpperCase()
async function setup(t, handler, dir) {
  const dataDir = dir ?? await mkdtemp(join(tmpdir(), 'ilab-'))
  let clock = 1700000000000
  const server = createIlabServer({ appid: 'app', secret: 'SECRET', projectTitle: 'Project', requiresAiData: true }, { dataDir, now: () => clock, fetch: handler })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections() }); if (!dir) await rm(dataDir, { recursive: true, force: true }) })
  let cookie = '', csrf = ''
  async function request(path, body, extra = {}) {
    const r = await fetch(base + '/api/ilab/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', cookie, 'x-csrf-token': csrf, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const data = await r.json()
    assert.ok(!JSON.stringify(data).includes('SECRET')); assert.ok(!JSON.stringify(data).includes('TOKEN'))
    return { r, data }
  }
  async function login(ticket = 'a%2Fb+c') {
    const { r, data } = await request('auth', { ticket })
    assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = data.csrfToken
    assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/)
    assert.notEqual(data.sessionId, cookie.split('=')[1]); return data
  }
  return { request, login, dataDir, advance: n => { clock += n } }
}
const auth = () => ({ code: 0, access_token: 'TOKEN-original', un: 'alice', dis: 'Alice', create_time: 1700000000, expires_time: 1700000010 })
const json = value => Response.json(value)

test('signature, ticket preserved, cookie, CSRF, identity, idempotency and refresh original token', async t => {
  let uploads = 0, refreshes = 0
  const s = await setup(t, async (url, init) => {
    assert.equal(init.redirect, 'error')
    if (url.pathname.endsWith('/token')) {
      assert.equal(url.searchParams.get('ticket'), 'a%2Fb+c'); assert.equal(url.searchParams.get('signature'), sign('a%2Fb+c')); return json(auth())
    }
    if (url.pathname.endsWith('/refresh')) {
      refreshes++; assert.equal(url.searchParams.get('access_token'), 'TOKEN-original'); assert.equal(url.searchParams.get('signature'), sign('TOKEN-original'))
      return json({ code: 0, access_token: `TOKEN-refreshed${refreshes}`, expires_time: refreshes === 1 ? 1700000010 : 1700000100 })
    }
    uploads++; const body = JSON.parse(init.body)
    assert.equal(body.username, 'alice'); assert.equal(body.appid, 'app'); assert.equal(body.title, 'Project'); return json({ code: 0, id: 'record1' })
  })
  assert.equal((await s.request('session')).r.status, 401)
  await s.login()
  assert.equal((await s.request('results', { result }, { 'x-csrf-token': '' })).r.status, 403)
  assert.equal((await s.request('auth', { ticket: 'x' }, { origin: 'https://evil.example' })).r.status, 403)
  s.advance(20000)
  assert.deepEqual((await s.request('results', { result })).data, { status: 'uploaded', originId: result.originId, id: 'record1' })
  assert.equal(refreshes, 2)
  await s.request('results', { result }); assert.equal(uploads, 1)
  assert.equal((await s.request('results', { result: { ...result, score: 81 } })).r.status, 409)
  const files = await readdir(s.dataDir)
  const disk = await readFile(join(s.dataDir, files[0]), 'utf8'); assert.ok(!disk.includes('TOKEN')); assert.ok(!disk.includes('SECRET'))
  await s.request('logout', {}); assert.equal((await s.request('session')).r.status, 401)
})

test('business failure does not report uploaded', async t => {
  const s = await setup(t, async url => json(url.pathname.endsWith('/token') ? auth() : { code: 19, msg: 'SECRET TOKEN' }))
  await s.login(); const r = await s.request('results', { result }); assert.equal(r.r.status, 502); assert.equal(r.data.code, 19)
  assert.equal((await s.request('results?originId=sample_1')).data.status, 'failed')
})

test('uncertain persists, query confirms critical fields, no blind resend across restart', async t => {
  let uploads = 0, found = false
  const handler = async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) { uploads++; throw new Error('SECRET TOKEN network') }
    assert.equal(url.searchParams.get('signature'), sign('TOKEN-original'))
    return json(found ? { code: 0, data: { ...result, username: 'alice', appid: 'app', title: 'Project', id: 'confirmed' } } : { code: 0, data: null })
  }
  const s = await setup(t, handler); await s.login()
  assert.equal((await s.request('results', { result })).data.status, 'uncertain')
  const restarted = await setup(t, handler, s.dataDir); await restarted.login()
  assert.equal((await restarted.request('results', { result })).data.code, 'MANUAL_CONFIRMATION_REQUIRED'); assert.equal(uploads, 1)
  found = true
  assert.equal((await restarted.request('results?originId=sample_1')).data.id, 'confirmed'); assert.equal(uploads, 1)
})

test('disabled never contacts upstream', async t => {
  const server = createIlabServer({}, { fetch: async () => { throw new Error('must not fetch') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await (await fetch(base + '/api/ilab/config')).json()).enabled, false)
})

test('concurrent same originId uploads once and users have separate records', async t => {
  let release, entered, uploads = 0
  const ready = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const s = await setup(t, async (url, init) => {
    if (url.pathname.endsWith('/token')) return json({ ...auth(), un: url.searchParams.get('ticket') })
    uploads++; entered(); await gate; return json({ code: 0, id: 'id-' + JSON.parse(init.body).username })
  })
  await s.login('alice')
  const first = s.request('results', { result })
  await ready
  try { assert.equal((await s.request('results', { result })).data.code, 'IN_PROGRESS') } finally { release() }
  assert.equal((await first).r.status, 200); assert.equal(uploads, 1)
  await s.login('bob')
  assert.equal((await s.request('results?originId=sample_1')).r.status, 404)
  assert.equal((await s.request('results', { result })).data.id, 'id-bob'); assert.equal(uploads, 2)
})

test('official data_get array without code/id confirms record without fabricating platform id', async t => {
  let uploads = 0
  const s = await setup(t, async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) { uploads++; throw new Error('mock timeout') }
    return json({ meta: { total: '1' }, data: [{ ...result, username: 'alice', appid: 'app', title: 'Project' }] })
  })
  await s.login()
  assert.equal((await s.request('results', { result })).data.status, 'uncertain')
  const response = (await s.request('results', { result })).data
  assert.deepEqual(response, { status: 'uploaded', originId: result.originId, confirmed: true })
  assert.equal('id' in response, false)
  assert.equal(uploads, 1)
})

test('query must match full steps, not just the overall grade', async t => {
  const s = await setup(t, async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) throw new Error('mock timeout')
    return json({ data: [{ ...result, username: 'alice', appid: 'app', title: 'Project', steps: [{ title: 'different' }] }] })
  })
  await s.login(); await s.request('results', { result })
  assert.equal((await s.request('results?originId=sample_1')).data.status, 'uncertain')
})

test('code=0 without upload id is uncertain, not a safely retryable failure', async t => {
  let uploads = 0
  const s = await setup(t, async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) { uploads++; return json({ code: 0 }) }
    return json({ data: [] })
  })
  await s.login()
  assert.equal((await s.request('results', { result })).data.status, 'uncertain')
  assert.equal((await s.request('results', { result })).data.status, 'uncertain')
  assert.equal(uploads, 1)
})

test('failed account switch invalidates the previous cookie session', async t => {
  let authCalls = 0
  const s = await setup(t, async () => json(++authCalls === 1 ? auth() : { code: 4, msg: 'mock invalid ticket' }))
  await s.login()
  assert.equal((await s.request('auth', { ticket: 'invalid' })).r.status, 401)
  assert.equal((await s.request('session')).r.status, 401)
})

test('completed experiment with fewer than ten steps is blocked before upload', async t => {
  let uploads = 0
  const s = await setup(t, async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    uploads++; return json({ code: 0, id: 'should_not_upload' })
  })
  await s.login()
  const response = await s.request('results', { result: { ...result, status: 1, ai_data: { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] } } })
  assert.equal(response.r.status, 400)
  assert.equal(response.data.code, 14)
  assert.equal(uploads, 0)
})

test('auth requires allowed Origin and JSON content-type, and response is no-store', async t => {
  const s = await setup(t, async () => json(auth()))
  assert.equal((await s.request('auth', { ticket: 'valid' }, { origin: '' })).r.status, 403)
  assert.equal((await s.request('auth', { ticket: 'valid' }, { 'content-type': 'text/plain' })).r.status, 415)
  const response = await s.request('config')
  assert.equal(response.r.headers.get('cache-control'), 'no-store')
})

test('report requires result upload first, preserves raw file bytes and URL encoding, and is idempotent', async t => {
  let reports = 0
  const bytes = Buffer.from([0, 255, 128, 10, 13, 65])
  const report = { originId: result.originId, filename: '实验 报告+a%.pdf', title: '实验 报告+测试', remarks: '真实附件测试替身', contentBase64: bytes.toString('base64') }
  const s = await setup(t, async (url, init) => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) return json({ code: 0, id: 'experiment_id' })
    assert.equal(url.pathname, '/open/api/v2/attachment_upload')
    assert.equal(url.searchParams.get('filename'), report.filename)
    assert.equal(url.searchParams.get('title'), report.title)
    assert.equal(url.searchParams.get('originId'), result.originId)
    assert.equal(init.headers['Content-Type'], 'application/octet-stream')
    assert.deepEqual(Buffer.from(init.body), bytes)
    reports++; return json({ code: 0, id: 'attachment_id' })
  })
  await s.login()
  assert.equal((await s.request('reports', report)).r.status, 409)
  assert.equal(reports, 0)
  await s.request('results', { result })
  assert.equal((await s.request('reports', report)).data.id, 'attachment_id')
  assert.equal((await s.request('reports', report)).data.id, 'attachment_id')
  assert.equal(reports, 1)
  assert.equal((await s.request('reports', { ...report, contentBase64: Buffer.from('changed').toString('base64') })).r.status, 409)
})

test('uncertain report is not blindly uploaded again', async t => {
  let reports = 0
  const s = await setup(t, async url => {
    if (url.pathname.endsWith('/token')) return json(auth())
    if (url.pathname.endsWith('/data_upload')) return json({ code: 0, id: 'experiment_id' })
    reports++; throw new Error('mock timeout')
  })
  await s.login(); await s.request('results', { result })
  const report = { originId: result.originId, filename: 'report.txt', title: 'report', contentBase64: Buffer.from('synthetic test').toString('base64') }
  assert.equal((await s.request('reports', report)).data.status, 'uncertain')
  assert.equal((await s.request('reports', report)).data.status, 'uncertain')
  assert.equal(reports, 1)
})

test('report rejects empty, invalid base64 and path-like filenames', async t => {
  const s = await setup(t, async () => json(auth()))
  await s.login()
  const report = { originId: result.originId, filename: 'report.txt', title: 'report', contentBase64: 'QQ==' }
  for (const change of [{ contentBase64: '' }, { contentBase64: '!invalid' }, { contentBase64: 'QQ=' }, { filename: '../report.txt' }, { filename: 'report' }]) {
    assert.equal((await s.request('reports', { ...report, ...change })).r.status, 400)
  }
})
