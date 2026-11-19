import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { useIlab, setIlabTransportForTests } from '../src/state/ilab.ts'
const ilab = useIlab()
const config = { enabled: true, mode: 'test', appid: '10000', projectTitle: '合成测试项目', requiresAiData: true }
const session = { username: 'alice', displayName: '测试学员', csrfToken: 'csrf-only-memory', expiresAt: 1700100000000, mode: 'test', projectTitle: config.projectTitle, sessionId: 'public-context' }
function fixture() {
  const startedAt = 1700000000000
  return { operation: { id: 'op_test', startedAt, returnPage: 'student', title: '合成操作', flowId: 'flow_test', finished: true, autoDemoDetected: false,
    recordedOps: Array.from({ length: 10 }, (_, i) => ({ logId: `log_${i}`, deviceId: `V${i}`, at: startedAt + (i + 1) * 1000, operation: '打开', sequenceEligible: true, changes: { value: 100 } })) },
    score: { id: 'score_test', kind: 'operation', startedAt, submittedAt: new Date(startedAt + 12000).toISOString(), score: 80, maxScore: 100, reason: 'manual', notes: '合成测试', details: [] } }
}
function setup(t, handler = () => undefined, url = 'http://localhost:5173/simulator-web/?ticket=a%252Fb%2Bc') {
  const storage = new Map()
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
  globalThis.window = { location: { href: url }, history: { state: null, replaceState: (_state, _title, next) => { window.location.href = String(next) } } }
  ilab.state.contexts = []; ilab.state.jobs = []; ilab.state.config = null; ilab.state.session = null; ilab.state.phase = 'idle'
  const calls = []
  setIlabTransportForTests(async (path, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ path, init, body })
    const custom = handler(path, init, body)
    if (custom !== undefined) return custom
    if (path.endsWith('/config')) return Response.json(config)
    if (path.endsWith('/auth') || path.endsWith('/session')) return Response.json(session)
    if (path.endsWith('/logout')) return Response.json({ status: 'logged_out' })
    if (path.endsWith('/results')) return Response.json({ status: 'uploaded', originId: body.result.originId, id: 'mock_record_1' })
    throw new Error('Unexpected mock request')
  })
  t.after(async () => { await ilab.logout().catch(() => {}); delete globalThis.window; delete globalThis.localStorage })
  return { calls, storage }
}
async function settled(job) {
  for (let i = 0; i < 30 && job.status === 'uploading'; i++) await nextTurn()
  assert.notEqual(job.status, 'uploading')
}

test('ticket只解码一次，移出地址栏；公开会话不持久化CSRF或ticket', async t => {
  const { calls, storage } = setup(t)
  assert.equal(await ilab.initialise(), true)
  assert.equal(calls.find(call => call.path.endsWith('/auth')).body.ticket, 'a%2Fb+c')
  assert.equal(new URL(window.location.href).searchParams.has('ticket'), false)
  ilab.beginOperation('op_test', 1700000000000)
  const disk = [...storage.values()].join('')
  assert.ok(!disk.includes('csrf-only-memory'))
  assert.ok(!disk.includes('a%2Fb+c'))
  assert.ok(!disk.includes('csrfToken'))
})

test('操作交卷冻结结果并异步回传，成功响应才标记已回传', async t => {
  const { calls } = setup(t)
  await ilab.initialise()
  const { operation, score } = fixture()
  ilab.beginOperation(operation.id, operation.startedAt)
  const job = ilab.submitOperation(operation, score)
  score.notes = 'changed later'
  await settled(job)
  assert.equal(job.status, 'uploaded')
  assert.equal(job.result.ext_data.gradingNotes, '合成测试')
  const upload = calls.find(call => call.path.endsWith('/results'))
  assert.equal(upload.init.headers['X-CSRF-Token'], session.csrfToken)
  assert.equal(upload.body.result.username, 'alice')
  assert.equal(upload.body.result.steps.length, 10)
  assert.equal(ilab.submitOperation(operation, score), job)
  assert.equal(calls.filter(call => call.path.endsWith('/results')).length, 1)
})

test('未绑定的旧本地成绩、离线操作不会被新账号自动接管', async t => {
  const { calls } = setup(t)
  await ilab.initialise()
  const { operation, score } = fixture()
  assert.equal(ilab.submitOperation(operation, score), undefined)
  assert.equal(calls.filter(call => call.path.endsWith('/results')).length, 0)
})

test('用户或环境变化时不发送旧实验数据', async t => {
  const { calls } = setup(t)
  await ilab.initialise()
  const { operation, score } = fixture()
  ilab.beginOperation(operation.id, operation.startedAt)
  ilab.state.session.username = 'bob'
  const job = ilab.submitOperation(operation, score)
  assert.equal(job.status, 'blocked')
  assert.equal(calls.filter(call => call.path.endsWith('/results')).length, 0)
})

test('不足10条真实步骤的完成实验保留失败原因，不发送', async t => {
  const { calls } = setup(t)
  await ilab.initialise()
  const { operation, score } = fixture()
  operation.recordedOps.pop()
  ilab.beginOperation(operation.id, operation.startedAt)
  const job = ilab.submitOperation(operation, score)
  assert.equal(job.status, 'blocked')
  assert.match(job.message, /仅有 9 条/)
  assert.equal(calls.filter(call => call.path.endsWith('/results')).length, 0)
})

test('未知网络结果标记uncertain，重试使用同一originId和冻结数据', async t => {
  let count = 0
  const { calls } = setup(t, (path, _init, body) => {
    if (!path.endsWith('/results')) return
    if (++count === 1) throw new Error('mock network failure')
    return Response.json({ status: 'uploaded', originId: body.result.originId, confirmed: true })
  })
  await ilab.initialise()
  const { operation, score } = fixture()
  ilab.beginOperation(operation.id, operation.startedAt)
  const job = ilab.submitOperation(operation, score)
  await settled(job); assert.equal(job.status, 'uncertain')
  await ilab.retry(job); assert.equal(job.status, 'uploaded'); assert.equal(job.id, undefined)
  const uploads = calls.filter(call => call.path.endsWith('/results'))
  assert.deepEqual(uploads[0].body, uploads[1].body)
})

test('没有明确成功信息的HTTP200不标记成功', async t => {
  setup(t, path => path.endsWith('/results') ? Response.json({ code: 19 }) : undefined)
  await ilab.initialise()
  const { operation, score } = fixture()
  ilab.beginOperation(operation.id, operation.startedAt)
  const job = ilab.submitOperation(operation, score)
  await settled(job)
  assert.equal(job.status, 'uncertain')
})

test('注销时立即解绑身份，注销请求尚未完成也不能发送晚到的交卷', async t => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const { calls } = setup(t, path => path.endsWith('/logout') ? pending : undefined)
  await ilab.initialise()
  const { operation, score } = fixture()
  ilab.beginOperation(operation.id, operation.startedAt)
  const logout = ilab.logout()
  assert.equal(ilab.state.session, null)
  assert.equal(ilab.submitOperation(operation, score).status, 'blocked')
  assert.equal(calls.filter(call => call.path.endsWith('/results')).length, 0)
  release(Response.json({ status: 'logged_out' })); await logout
})
