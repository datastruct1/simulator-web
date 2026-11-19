import assert from 'node:assert/strict'
import test from 'node:test'
import { validateExperimentResult } from '../src/integrations/result.ts'
import { buildOperationResult, collectAiData } from '../src/integrations/operationResult.ts'

// Synthetic, offline fixtures only: never submitted to the platform.
function fixture(count = 10) {
  const startedAt = 1700000000000
  const context = { operationId: 'operation_abc_123', startedAt, username: 'test-user', appid: '10000', mode: 'test', projectTitle: '合成测试实验', requiresAiData: true, aiCalls: [] }
  const session = { id: context.operationId, startedAt, returnPage: 'student', title: '合成操作子模块', finished: true, autoDemoDetected: false, flowId: 'test-flow',
    recordedOps: Array.from({ length: count }, (_, i) => ({ deviceId: `V${i + 1}`, operation: i % 2 ? '关闭' : '打开', at: startedAt + (i + 1) * 1000, logId: `log_${i}`, changes: { value: i % 2 ? 0 : 100 }, sequenceEligible: true })) }
  const score = { id: 'score-test-1', kind: 'operation', startedAt, submittedAt: new Date(startedAt + (count + 2) * 1000).toISOString(), score: 67.5, maxScore: 100, reason: 'manual', notes: '合成测试评分', details: [] }
  return { context, session, score }
}
function result() { const f = fixture(); return buildOperationResult(f.context, f.session, f.score) }

test('2022完整字段：真实动作映射结果通过校验', () => {
  const data = result()
  assert.equal(validateExperimentResult(data, true), null)
  assert.equal(data.score, 68)
  assert.equal(data.steps.length, 10)
  assert.deepEqual(data.ai_data, { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] })
})

for (const key of ['username', 'title', 'appid', 'originId', 'status', 'score', 'startTime', 'endTime', 'timeUsed', 'steps']) {
  test(`2022必填字段：${key}`, () => {
    const data = result(); delete data[key]
    assert.notEqual(validateExperimentResult(data, true), null)
  })
}

const invalid = [
  ['非法状态', data => { data.status = 3 }, 7],
  ['成绩超范围', data => { data.score = 101 }, 9],
  ['成绩非整数', data => { data.score = 0.1 }, 6],
  ['originId不能带横杠', data => { data.originId = 'invalid-id' }, 6],
  ['title超长', data => { data.title = '实'.repeat(101) }, 6],
  ['结束早于开始', data => { data.endTime = data.startTime - 1 }, 6],
  ['时间戳只有10位', data => { data.startTime = 1700000000 }, 6],
  ['timeUsed不得为0', data => { data.timeUsed = 0 }, 6],
  ['timeUsed不得超过观测区间', data => { data.timeUsed = 999 }, 8],
  ['完整实验不足10步', data => { data.steps.pop() }, 14],
  ['步骤数超过200', data => { data.steps = Array.from({ length: 201 }, (_, i) => ({ ...data.steps[0], seq: i + 1 })) }, 10],
  ['步骤不允许未知字段', data => { data.steps[0].extra = 1 }, 11],
  ['步骤不允许重复序号', data => { data.steps[1].seq = data.steps[0].seq }, 11],
  ['步骤时间超出实验范围', data => { data.steps[0].startTime = data.startTime - 1 }, 11],
  ['步骤不允许伪造零时长', data => { data.steps[0].endTime = data.steps[0].startTime }, 11],
  ['步骤用时不允许超过观测区间', data => { data.steps[0].timeUsed = 2 }, 11],
  ['步骤评价超长', data => { data.steps[0].evaluation = '好'.repeat(201) }, 11],
  ['步骤备注超长', data => { data.steps[0].remarks = '好'.repeat(201) }, 11],
  ['步骤扩展必须为对象', data => { data.steps[0].ext_data = [] }, 11],
  ['步骤分数不允许负值', data => { data.steps[0].score = -1 }, 11],
  ['完整推荐实验仍需AI数据', data => { delete data.ai_data }, 19],
]
for (const [name, mutate, code] of invalid) {
  test(`2022校验：${name}`, () => {
    const data = result(); mutate(data)
    assert.equal(validateExperimentResult(data, true)?.code, code)
  })
}

for (const key of ['seq', 'title', 'startTime', 'endTime', 'timeUsed', 'expectTime', 'maxScore', 'score', 'repeatCount', 'evaluation', 'scoringModel']) {
  test(`2022步骤必填字段：${key}`, () => {
    const data = result(); delete data.steps[0][key]
    assert.equal(validateExperimentResult(data, true)?.code, 11)
  })
}

test('未完成实验允许不足10步且不校验AI增补', () => {
  const data = result(); data.status = 2; data.steps = data.steps.slice(0, 1); delete data.ai_data
  assert.equal(validateExperimentResult(data, true), null)
})

test('非推荐项目的完整实验可不提供AI增补', () => {
  const data = result(); delete data.ai_data
  assert.equal(validateExperimentResult(data, false), null)
})

for (const key of ['group_id', 'group_name', 'role_in_group', 'group_members']) {
  test(`可选分组字段长度：${key}`, () => {
    const data = result(); data[key] = 'a'.repeat(20)
    assert.equal(validateExperimentResult(data, true), null)
    data[key] += 'a'
    assert.equal(validateExperimentResult(data, true)?.code, 6)
  })
}

test('映射只使用真实手动动作，不从提示、自动演示或重复日志凑10步', () => {
  const f = fixture(9)
  f.session.recordedOps.push({ ...f.session.recordedOps[0] })
  f.session.recordedOps.push({ ...f.session.recordedOps[0], logId: 'auto', sequenceEligible: false })
  f.session.recordedOps.push({ ...f.session.recordedOps[0], logId: 'unknown', sequenceEligible: undefined })
  f.session.recordedOps.push({ ...f.session.recordedOps[0], logId: 'old', at: f.session.startedAt - 1000 })
  f.session.recordedOps.push({ ...f.session.recordedOps[0], logId: 'future', at: Date.parse(f.score.submittedAt) + 1000 })
  f.session.steps = Array.from({ length: 50 }, (_, i) => ({ name: `预定义步骤${i}` }))
  assert.throws(() => buildOperationResult(f.context, f.session, f.score), /仅有 9 条真实操作步骤/)
})

test('同一毫秒批量操作合为一个区间，不拆成虚构额外步骤', () => {
  const f = fixture()
  f.session.recordedOps[1].at = f.session.recordedOps[0].at
  assert.throws(() => buildOperationResult(f.context, f.session, f.score), /仅有 9 条真实操作步骤/)
})

test('步骤时间来自实际记录边界，不均分时长、不使用当前上传时间', () => {
  const f = fixture()
  f.session.recordedOps[0].at = f.session.startedAt + 250
  const data = buildOperationResult(f.context, f.session, f.score)
  assert.equal(data.steps[0].startTime, f.session.startedAt)
  assert.equal(data.steps[0].endTime, f.session.startedAt + 250)
  assert.equal(data.steps[0].timeUsed, 1)
  assert.equal(data.steps[1].startTime, f.session.startedAt + 250)
  assert.equal(data.steps[1].endTime, f.session.startedAt + 2000)
  assert.equal(data.steps[1].timeUsed, 2)
  assert.equal(validateExperimentResult(data, true), null)
})

test('动作过程不虚构逐步得分：总分仍来自已有评分，步骤0分并注明', () => {
  const data = result()
  assert.equal(data.score, 68)
  assert.ok(data.steps.every(step => step.maxScore === 0 && step.score === 0 && step.scoringModel.includes('不单独赋分')))
  assert.ok(data.steps.every(step => step.remarks.includes('不代表设备动作持续时间')))
})

test('完成状态不由交卷或及格分数冒充', () => {
  const f = fixture(2); f.session.finished = false; f.score.score = 100
  const data = buildOperationResult(f.context, f.session, f.score)
  assert.equal(data.status, 2)
  assert.equal(data.steps.length, 2)
  assert.equal(validateExperimentResult(data, true), null)
})

for (const mutate of [f => { f.session.autoDemoDetected = true }, f => { f.session.returnPage = 'exam' }, f => { f.context.operationId = 'other' }, f => { f.context.startedAt -= 1 }, f => { f.score.kind = 'theory' }]) {
  test('拒绝自动演示、离线考试、错误会话或理论答题映射', () => {
    const f = fixture(); mutate(f)
    assert.throws(() => buildOperationResult(f.context, f.session, f.score))
  })
}

test('真实步骤超过200时不静默截断', () => {
  const f = fixture(201)
  assert.throws(() => buildOperationResult(f.context, f.session, f.score), /200 步上限/)
})

const model = { model: '合成测试模型', version: 'test-version', deployment: '本地运行' }
test('AI统计：真实调用数量、模型去重、场景去重及token累加', () => {
  assert.deepEqual(collectAiData([
    { model, scenario: '智能导学', inputTokens: 12, outputTokens: 4 },
    { model, scenario: '智能导学', inputTokens: 8, outputTokens: 6 },
  ]), { ai_call_count: 2, ai_models_used: [model], ai_usage_scenarios: ['智能导学'], ai_input_token_count: 20, ai_output_token_count: 10 })
})

test('AI未知token数量不得伪装为0', () => {
  const data = collectAiData([{ model, scenario: '智能导学', inputTokens: 1 }, { model, scenario: '智能导学' }])
  assert.equal(data.ai_call_count, 2)
  assert.equal('ai_input_token_count' in data, false)
  assert.equal('ai_output_token_count' in data, false)
})

test('单次AI调用的负token不能被另一条未知用量掩盖', () => {
  assert.throws(() => collectAiData([{ model, scenario: '智能导学', inputTokens: -1 }, { model, scenario: '智能导学' }]), /非负安全整数/)
})
