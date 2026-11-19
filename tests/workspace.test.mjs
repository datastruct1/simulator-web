import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

const saved = new Map()
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key),
}
const { useSimulator } = await import('../src/state/simulator.ts')
const { useWorkspace } = await import('../src/state/workspace.ts')
const domain = await import('../src/components/workspace/lib/domain.ts')
const grading = await import('../src/components/workspace/lib/assessment.ts')
const { decodeWorkspace } = await import('../src/components/workspace/lib/storage.ts')
const { WORKSPACE_SCHEMA, createSeedQuestions } = await import('../src/data/workspace.ts')
const simulator = useSimulator(), workspace = useWorkspace()
const defaults = domain.clone(workspace.data)

beforeEach(async () => {
  for (const tone of ['information', 'success', 'warning', 'error']) simulator.state.settings[`${tone}AutoClose`] = false
  workspace.data.recording.active = false
  workspace.cancelAssessment()
  Object.assign(workspace.data, domain.clone(defaults))
  simulator.reset()
  simulator.login('student', '演示学员')
  simulator.state.logs = []
  simulator.state.toasts = []
  simulator.state.speed = 1
  simulator.state.paused = false
  workspace.tickAssessments()
  await nextTick()
})

function localScene(mode = 'state') {
  const scene = domain.emptyScene()
  scene.mode = mode
  scene.name = '可执行的本地测试场景'
  scene.workloadName = '初始阀门关闭'
  scene.workload = { schemaVersion: 1, name: '初始阀门关闭', elapsed: 0, devices: { V1601: { value: 0, working: false, enabled: true, error: false } } }
  if (mode === 'sequence') {
    scene.legacyOps = [
      { id: 'op-1', index: 1, weight: 2, deviceId: 'V1601', operation: '打开' },
      { id: 'op-2', index: 2, weight: 1, deviceId: 'V1601', operation: '关闭' },
    ]
    return scene
  }
  const transition = scene.states.find(state => state.kind === 'transition')
  const final = scene.states.find(state => state.kind === 'final')
  const condition = { ...domain.emptyCondition(), deviceId: 'V1601', value: 0, comparator: '>', source: 'user' }
  transition.groups = [{ id: domain.newId('group'), kind: 'score', name: '实际手动操作', events: [
    { id: domain.newId('event'), name: '打开阀门得分', condition, action: { ...domain.emptyAction(), score: 10 } },
    { id: domain.newId('event'), name: '终止本次场景', condition: domain.clone(condition), action: { ...domain.emptyAction(), kind: 'activate', stateId: final.id } },
  ] }]
  return scene
}
function launch(scene, options = {}) {
  assert.equal(workspace.requestOperation({ operationId: `scene:${scene.id}`, scene, mode: 'practice', returnPage: 'exam', ...options }), true)
  return workspace.data.activeOperation
}

test('590 道原题全部可作答、选项正确答案和导入校验完整', () => {
  const questions = createSeedQuestions()
  assert.equal(questions.length, 590)
  for (const question of questions) assert.equal(domain.validateQuestion(question), '', question.id)
  const imported = domain.questionsFromFile('\uFEFF' + JSON.stringify([questions[0]]), 'T11.json')
  assert.equal(imported.errors.length, 0)
  assert.equal(imported.questions[0].id, questions[0].id)
  const corrupt = domain.clone(questions[0]); corrupt.id = '__proto__'
  assert.notEqual(domain.validateQuestion(corrupt), '')
})

test('理论单多判断按实际答案及权重折算，未答不虚给分', () => {
  const questions = [
    { ...domain.clone(defaults.questions[0]), id: 'single', type: '单选题', points: 1, options: [{ id: 's-a', text: '正确', correct: true }, { id: 's-b', text: '错误', correct: false }] },
    { ...domain.clone(defaults.questions[0]), id: 'multiple', type: '多选题', points: 3, options: [{ id: 'm-a', text: '正确1', correct: true }, { id: 'm-b', text: '正确2', correct: true }, { id: 'm-c', text: '错误', correct: false }] },
    { ...domain.clone(defaults.questions[0]), id: 'boolean', type: '判断题', points: 1, options: [{ id: 'b-a', text: '正确', correct: true }, { id: 'b-b', text: '错误', correct: false }] },
  ]
  assert.equal(workspace.startTheory({ questions, title: '真实答案判分', mode: 'exam', returnPage: 'student', maxScore: 100 }), true)
  workspace.selectAnswer('single', 's-a')
  workspace.selectAnswer('multiple', 'm-a')
  workspace.revealAnswer('single')
  assert.deepEqual(workspace.data.activeTheory.revealed, [])
  const score = workspace.submitTheory()
  assert.equal(score.score, 20)
  assert.deepEqual(score.details.map(detail => detail.passed), [true, false, false])
  assert.equal(workspace.data.activeTheory, null)
  assert.equal(workspace.data.scores[0].id, score.id)
})

test('练习揭示答案后锁定本题，收藏属于实际会话身份', () => {
  const question = defaults.questions[0]
  workspace.startTheory({ questions: [question], title: '练习', mode: 'practice', returnPage: 'student' })
  workspace.selectAnswer(question.id, question.options[0].id)
  workspace.revealAnswer(question.id)
  workspace.selectAnswer(question.id, question.options[1].id)
  assert.deepEqual(workspace.data.activeTheory.answers[question.id], [question.options[0].id])
  workspace.toggleFavourite(question.id)
  assert.deepEqual(workspace.data.favourites['student-demo'], [question.id])
})

test('真实考试到时自动交卷，100x 仿真速度不改变截止或考试用时', () => {
  workspace.startTheory({ questions: [defaults.questions[0]], title: '真实计时', mode: 'exam', returnPage: 'student', durationMinutes: 1 })
  const deadline = workspace.data.activeTheory.deadlineAt
  simulator.setSpeed(100)
  simulator.tickSimulation(10000)
  assert.equal(workspace.data.activeTheory.deadlineAt, deadline)
  workspace.tickAssessments(deadline + 100000)
  assert.equal(workspace.data.activeTheory, null)
  assert.equal(workspace.data.scores[0].reason, 'timeout')
  assert.equal(workspace.data.scores[0].durationSeconds, 60)
  assert.equal(Date.parse(workspace.data.scores[0].submittedAt), deadline)
})

test('已发布题目快照不随题库编辑变化；删除成绩也不能重新领取已提交考试', () => {
  const task = workspace.data.tasks.find(task => task.id === 'task-theory')
  task.snapshot.questions = [domain.clone(defaults.questions[0])]
  const question = task.snapshot.questions[0]
  const correct = question.options.find(option => option.correct).id
  const live = workspace.data.questions.find(item => item.id === question.id)
  live.options.forEach(option => { option.correct = option.id !== correct })
  assert.equal(workspace.startTask(task), true)
  workspace.selectAnswer(question.id, correct)
  const score = workspace.submitTheory()
  assert.equal(score.score, 100)
  workspace.removeScores([score.id])
  assert.equal(workspace.data.scores.length, 0)
  assert.match(workspace.availableTask(task, 'student-demo'), /已经提交/)
  assert.equal(workspace.startTask(task), false)
})

test('隐藏成绩不在全局日志中泄露数值', () => {
  workspace.startTheory({ questions: [defaults.questions[0]], title: '成绩保密测试', mode: 'exam', returnPage: 'student', scoreVisible: false })
  const score = workspace.submitTheory()
  assert.equal(score.scoreVisible, false)
  assert.ok(simulator.state.logs.some(log => log.action.includes('成绩暂不可见')))
  assert.equal(simulator.state.logs.some(log => /实际得分/.test(log.action)), false)
})

test('待开始操作任务恢复时复核原截止时间，不依赖安全门禁开关', () => {
  const task = workspace.data.tasks.find(task => task.kind === 'operation')
  const started = workspace.startTask(task)
  if (started) {
    // Free-operation mode disables the safety gate; construct a pending launch explicitly
    // to test deadline revalidation without changing the application's safety policy.
    const pending = domain.clone(workspace.data.activeOperation)
    workspace.cancelAssessment()
    workspace.data.pendingLaunch = pending
  }
  assert.ok(workspace.data.pendingLaunch)
  assert.equal(workspace.data.activeOperation, null)
  simulator.state.safetyComplete = true
  workspace.data.pendingLaunch.taskDeadlineAt = Date.now() - 1
  assert.equal(workspace.resumePendingOperation(), false)
  assert.equal(workspace.data.activeOperation, null)
  assert.ok(simulator.state.toasts.some(toast => /截止/.test(toast.message)))
})

test('场景 JSON 必须有合法属性/比较/来源/逻辑和设备编号，损坏导入保持原库', () => {
  const scene = localScene()
  assert.equal(domain.validateScene(scene), '')
  for (const [key, value] of [['property', '__proto__'], ['comparator', 'invented'], ['source', 'admin'], ['logic', 'invented']]) {
    const bad = domain.clone(scene)
    bad.states[1].groups[0].events[0].condition[key] = value
    assert.notEqual(domain.validateScene(bad), '')
    assert.equal(workspace.importScene(JSON.stringify(bad)), false)
  }
  const bad = domain.clone(scene)
  bad.states[1].groups[0].events[0].action = { ...domain.emptyAction(), kind: 'device', deviceId: '__proto__' }
  assert.notEqual(domain.validateScene(bad), '')
  assert.equal(workspace.data.scenes.length, defaults.scenes.length)
  assert.equal({}.value, undefined)
})

test('source=user 需要本次手动变更实际满足目标，之前点过设备不算后来的系统动作', () => {
  const condition = { ...domain.emptyCondition(), deviceId: 'V1601', value: 50, comparator: '>=' }
  const context = { devices: { V1601: { id: 'V1601', value: 100, working: true, enabled: true, error: false } }, recordedOps: [], elapsedSeconds: 0, activeStateIds: [], stoppedStateIds: [], disabledStateIds: [] }
  assert.equal(grading.evaluateCondition(condition, context), false)
  context.recordedOps.push({ deviceId: 'V1601', operation: '打开', at: 1, logId: 'log-1', changes: { value: 25 } })
  assert.equal(grading.evaluateCondition(condition, context), false)
  context.recordedOps.push({ deviceId: 'V1601', operation: '打开', at: 2, logId: 'log-2', changes: { value: 75 } })
  assert.equal(grading.evaluateCondition(condition, context), true)
  condition.property = 'error'; condition.comparator = '=='; condition.boolValue = true
  context.devices.V1601.error = true
  assert.equal(grading.evaluateCondition(condition, context), false)
  context.recordedOps.push({ deviceId: 'V1601', operation: '关闭', at: 3, logId: 'log-3', changes: { error: true }, sequenceEligible: false })
  assert.equal(grading.evaluateCondition(condition, context), true)
})

test('自编场景只按本次手动事件运行，不被内置流程初始化/演示/最终工况覆盖', async () => {
  const scene = localScene(), session = launch(scene)
  assert.equal(simulator.state.stepIndex, 0)
  assert.equal(workspace.operationProgress(), 0)
  simulator.setDevice('V1601', { value: 100, working: true }, false)
  await nextTick()
  workspace.tickAssessments()
  assert.equal(workspace.operationProgress(), 0)
  simulator.setDevice('V1601', { value: 0, working: false })
  simulator.setDevice('V1601', { value: 100, working: true })
  await nextTick()
  workspace.tickAssessments()
  assert.equal(simulator.state.stepIndex, 0)
  assert.equal(session.recordedOps.length, 2)
  assert.equal(session.finished, true)
  assert.equal(workspace.operationProgress(), 100)
  simulator.setDevice('V1601', { value: 0, working: false })
  workspace.tickAssessments()
  assert.equal(session.recordedOps.length, 2)
  assert.equal(workspace.submitOperation().score, 100)
})

test('活动操作不允许其他流程、自动演示、载入预设或工况替换，考试不暴露调试和题库', () => {
  const session = launch(localScene(), { mode: 'exam' })
  assert.equal(simulator.startFlow('supply'), false)
  assert.equal(simulator.startFlow('stop', false), false)
  assert.equal(simulator.nextStep(true), false)
  assert.equal(simulator.loadSnapshot({ schemaVersion: 1, devices: { V1601: { value: 100, working: true, enabled: true, error: false } } }), false)
  simulator.applyPreset('jiazhu')
  simulator.reset()
  assert.equal(simulator.state.devices.V1601.value, 0)
  simulator.navigate('teacher')
  assert.notEqual(simulator.state.page, 'teacher')
  simulator.openModal('debug', '调试')
  assert.equal(simulator.state.modal, null)
  simulator.state.autoDemo = true
  workspace.tickAssessments()
  simulator.tickSimulation(999)
  assert.equal(session.autoDemoDetected, true)
  assert.equal(simulator.state.devices.V1601.value, 0)
})

test('顺序录制只记录手动开关，LCS 匹配实际顺序并按权重计算', async () => {
  workspace.data.editorDraft = localScene('sequence')
  workspace.data.editorDraft.legacyOps = []
  workspace.toggleRecording()
  simulator.setDevice('V1601', { value: 100, working: true })
  await nextTick()
  simulator.setDevice('V1601', { value: 0, working: false }, false)
  await nextTick()
  simulator.setDevice('V1601', { value: 25, working: true })
  await nextTick()
  workspace.toggleRecording()
  assert.deepEqual(workspace.data.editorDraft.legacyOps.map(op => op.operation), ['打开', '打开'])
  const scene = localScene('sequence'), session = launch(scene)
  simulator.setDevice('V1601', { value: 100, working: true })
  await nextTick()
  workspace.tickAssessments()
  assert.equal(session.recordedOps.length, 1)
  const score = workspace.submitOperation()
  assert.equal(score.score, 66.7)
  assert.deepEqual(score.details.map(detail => detail.passed), [true, false])
})

test('工况导入用于场景动作时也保留传感器阈值和冻结，不只是开关数值', () => {
  const workload = domain.normaliseWorkload({ schemaVersion: 1, name: '全参数', elapsed: 5, devices: { Tit42: { value: 35, working: false, error: false, enabled: true, frozen: true, lowLow: null, high: 40, unit: '°C', min: -20, max: 80 } } })
  assert.equal(workload.devices.Tit42.frozen, true)
  assert.equal(workload.devices.Tit42.high, 40)
  assert.equal(workload.devices.Tit42.lowLow, null)
  assert.throws(() => domain.normaliseWorkload({ schemaVersion: 1, devices: { Tit42: { ...workload.devices.Tit42, frozen: 'yes' } } }))
})

test('业务持久化恢复理论答案与重考限制；操作恢复必须先初始化，损坏草稿不拖垮题库', () => {
  const scene = localScene('sequence')
  launch(scene)
  const raw = { schemaVersion: WORKSPACE_SCHEMA, data: domain.clone(workspace.data) }
  let restored = decodeWorkspace(raw, defaults)
  assert.equal(restored.warnings.length, 0)
  assert.equal(restored.state.activeOperation.runReady, false)
  workspace.cancelAssessment()
  workspace.startTheory({ questions: [defaults.questions[0]], title: '可恢复答题', mode: 'exam', returnPage: 'student' })
  const question = workspace.data.activeTheory.questions[0]
  workspace.selectAnswer(question.id, question.options[0].id)
  const theoryRaw = { schemaVersion: WORKSPACE_SCHEMA, data: domain.clone(workspace.data) }
  theoryRaw.data.editorDraft = { ...scene, states: [null] }
  restored = decodeWorkspace(theoryRaw, defaults)
  assert.equal(restored.state.questions.length, 590)
  assert.deepEqual(restored.state.activeTheory.answers[question.id], [question.options[0].id])
  assert.equal(restored.state.editorDraft, null)
  assert.ok(restored.warnings.length)
})

test('试卷导入不会因相同题干去重而丢失被引用的新题目编号', () => {
  const question = domain.clone(defaults.questions[0])
  question.id = 'paper-specific-question'
  question.options.forEach((option, index) => { option.id = `paper-specific-${index}` })
  const paper = { ...domain.clone(defaults.papers[0]), id: 'paper-import', questionIds: [question.id] }
  assert.equal(workspace.importPapers(JSON.stringify({ questions: [question], papers: [paper] })), true)
  assert.ok(workspace.data.questions.some(item => item.id === question.id))
  assert.deepEqual(workspace.data.papers.find(item => item.id === paper.id).questionIds, [question.id])
})

test('XAML 大写设备编号、原传感器和软管别名共享数值、单位、量程和记录', () => {
  assert.equal(simulator.state.devices.PIT7A, simulator.state.devices.Pit7A)
  assert.equal(simulator.state.devices.TIT42, simulator.state.devices.Tit42)
  assert.equal(simulator.state.devices.RG001, simulator.state.devices.Rg001)
  assert.equal(simulator.state.devices.Pipe1756445628569, simulator.state.devices.Rg001)
  simulator.setDevice('PIT7A', { value: -65 })
  assert.equal(simulator.state.devices.Pit7A.value, -65)
  assert.equal(simulator.state.devices.PIT7A.min, -100)
  assert.equal(simulator.state.devices.PIT7A.unit, 'Pa')
  assert.equal(simulator.state.logs[0].deviceId, 'Pit7A')
  simulator.setDevice('RG001', { value: 100, working: true })
  assert.equal(simulator.state.devices.Rg001.kind, 'hose')
  assert.equal(simulator.state.devices.Pipe1756445628569.value, 100)
})

test('原阶段评分真正接入会话：不靠初始化赠分，触发操作任意次序可部分结算和交卷', async () => {
  assert.equal(workspace.requestOperation({ operationId: 'pump-failure', mode: 'practice', returnPage: 'exam' }), true)
  const session = workspace.data.activeOperation
  assert.equal(session.flowAssessment.definition.stages.length, 2)
  assert.equal(workspace.operationProgress(), 0)
  const stages = session.flowAssessment.definition.stages
  // Deliberate system-only initialization is not a manual scoring frame.
  for (const rule of stages[0].triggers) simulator.setDevice(rule.name, { value: 100, working: true }, false)
  await nextTick()
  assert.equal(session.flowAssessment.nextStageIndex, 0)
  let at = Date.now() + 1000
  for (const rule of [...stages[0].triggers].reverse()) {
    simulator.setDevice(rule.name, { value: 0, working: false })
    await nextTick(); workspace.tickAssessments(++at)
  }
  assert.equal(session.flowAssessment.nextStageIndex, 1)
  assert.equal(workspace.operationProgress(), 50)
  const restored = decodeWorkspace({ schemaVersion: WORKSPACE_SCHEMA, data: domain.clone(workspace.data) }, defaults)
  assert.equal(restored.state.activeOperation.flowAssessment.nextStageIndex, 1)
  assert.equal(restored.state.activeOperation.runReady, false)
  for (const rule of [...stages[1].triggers].reverse()) {
    simulator.setDevice(rule.name, { value: 100, working: true })
    await nextTick(); workspace.tickAssessments(++at)
  }
  assert.equal(session.flowAssessment.nextStageIndex, 2)
  assert.equal(session.finished, true)
  const score = workspace.submitOperation()
  assert.equal(score.score, 100)
  assert.equal(score.details.length, 6)
  assert.match(score.notes, /原 WPF 阶段判分/)
})

test('损坏原评分运行态或录制数据只被隔离，不使已保存题库和任务全部丢失', () => {
  workspace.requestOperation({ operationId: 'pump-failure', mode: 'practice', returnPage: 'exam' })
  const raw = { schemaVersion: WORKSPACE_SCHEMA, data: domain.clone(workspace.data) }
  raw.data.activeOperation.flowAssessment.rules = [null]
  raw.data.recording = 42
  const restored = decodeWorkspace(raw, defaults)
  assert.equal(restored.state.activeOperation, null)
  assert.equal(restored.state.questions.length, 590)
  assert.equal(restored.state.tasks.length, defaults.tasks.length)
  assert.ok(restored.warnings.length >= 2)
})
