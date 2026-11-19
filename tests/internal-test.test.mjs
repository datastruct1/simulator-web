import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIlabServer } from '../server/ilab.ts'

test('内部测试保存、身份隔离、管理员验证与幂等，不访问实验空间', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'internal-test-'))
  const server = createIlabServer({ internalTest: { enabled: true, adminKey: 'test-admin-secret-123', allowedOrigins: ['http://localhost:5173'], dataDir: dir } }, { fetch: async () => { throw new Error('must not reach ilab') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${server.address().port}/api/internal-test/`
  const sessionId = '5c5073cb-4d4e-4119-9e0a-a35878697888'
  const body = JSON.stringify({ sessionId, score: { id: 'score1', kind: 'theory', score: 80, details: [{ response: 'A' }] } })
  const post = (origin = 'http://localhost:5173') => fetch(base + 'records', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body })
  assert.equal((await (await fetch(base + 'config')).json()).mode, 'internal-test')
  assert.equal((await post('https://other.example')).status, 403)
  assert.equal((await fetch(base + 'records')).status, 401)
  const first = await (await post()).json(), second = await (await post()).json()
  assert.equal(first.status, 'saved'); assert.equal(first.id, second.id)
  const records = await (await fetch(base + 'records', { headers: { authorization: 'Bearer test-admin-secret-123' } })).json()
  assert.equal(records.records.length, 1); assert.equal(records.records[0].identity, '测试用户'); assert.equal(records.records[0].sessionId, sessionId); assert.equal(records.records[0].score.details[0].response, 'A')
})
