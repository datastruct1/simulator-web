import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserTestTransport } from '../src/integrations/ilabBrowserTest.ts'

test('公测浏览器使用真实 ticket 换取身份，回传测试环境且展示平台返回值', async t => {
  const original = globalThis.fetch
  const store = new Map(); globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) }
  t.after(() => { globalThis.fetch = original; delete globalThis.localStorage })
  let uploads = 0
  globalThis.fetch = async (url, init) => {
    assert.equal(url.origin, 'http://39.105.173.29')
    if (url.pathname.endsWith('/token')) { assert.equal(url.searchParams.get('ticket'), 'test+ticket'); assert.equal(url.searchParams.get('appid'), '10000'); return Response.json({ code: 0, un: 'tester', access_token: 'secret-token', expires_time: Math.floor(Date.now()/1000)+300 }) }
    uploads++; assert.equal(url.pathname, '/open/api/v2/data_upload'); assert.equal(JSON.parse(init.body).username, 'tester'); return Response.json({ code: 0, id: 42 })
  }
  const auth = await browserTestTransport('/api/ilab/auth', { method:'POST', body: JSON.stringify({ ticket: 'test+ticket' }) }); assert.equal((await auth.json()).username, 'tester')
  const init = { method:'POST', body: JSON.stringify({ result: { originId: 'abc', username: 'not-tester' } }) }
  const reply = await (await browserTestTransport('/api/ilab/results', init)).json(); assert.deepEqual(reply.platformResponse, { code: 0, id: 42 })
  await browserTestTransport('/api/ilab/results', init); assert.equal(uploads, 1)
})
