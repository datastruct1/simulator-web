import { WORKSPACE_SCHEMA, WORKSPACE_STORAGE_KEY } from '../../../data/workspace'
import type { OperationLaunch, OperationSession, TheorySession, WorkspaceFile, WorkspaceScore, WorkspaceState, WorkspaceTask } from '../../../data/workspace'
import { asObject, clone, normalisePaper, normaliseQuestion, normaliseScene, normaliseStudent, validateSceneStructure } from './domain'

export interface StorageStatus { error: string; savedAt: string; recoveryData: string; persistent: boolean }
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const validId = (value: unknown): value is string => typeof value === 'string' && !!value && value.length <= 200 && !['__proto__', 'prototype', 'constructor'].includes(value)
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
function task(raw: unknown): WorkspaceTask {
  const item = asObject(raw)
  if (!validId(item.id) || typeof item.title !== 'string' || !['theory', 'operation'].includes(String(item.kind)) || !['practice', 'exam'].includes(String(item.mode)) || !stringArray(item.participants) || !stringArray(item.attachmentIds) || !numeric(item.durationMinutes) || item.durationMinutes <= 0 || typeof item.startAt !== 'string' || typeof item.endAt !== 'string' || !Number.isFinite(Date.parse(item.startAt)) || !Number.isFinite(Date.parse(item.endAt))) throw new Error('任务结构不合法。')
  if (typeof item.description !== 'string' || typeof item.remark !== 'string' || typeof item.scoreVisible !== 'boolean' || typeof item.allStudents !== 'boolean' || item.durationMinutes > 1440 || Date.parse(item.endAt) <= Date.parse(item.startAt)) throw new Error('任务内容、时间或可见性不合法。')
  if (item.snapshot) {
    const snapshot = asObject(item.snapshot)
    if (snapshot.questions) { if (!Array.isArray(snapshot.questions)) throw new Error('任务题目快照不合法。'); snapshot.questions = snapshot.questions.map((value, index) => normaliseQuestion(value, index)) }
    if (snapshot.scene) snapshot.scene = normaliseScene(snapshot.scene)
  }
  return clone(item) as unknown as WorkspaceTask
}
function file(raw: unknown): WorkspaceFile {
  const item = asObject(raw)
  if (!validId(item.id) || typeof item.name !== 'string' || !numeric(item.size) || item.size < 0 || !['uploaded', 'builtin'].includes(String(item.origin)) || !['builtin', 'indexeddb', 'memory'].includes(String(item.storage)) || !stringArray(item.participants)) throw new Error('文件元数据不合法。')
  if (typeof item.type !== 'string' || typeof item.allStudents !== 'boolean' || (item.origin === 'builtin' && typeof item.builtinText !== 'string')) throw new Error('文件类型或发布信息不合法。')
  return clone(item) as unknown as WorkspaceFile
}
function score(raw: unknown): WorkspaceScore {
  const item = asObject(raw)
  if (!validId(item.id) || !validId(item.studentId) || !numeric(item.score) || !numeric(item.maxScore) || item.maxScore <= 0 || item.score < 0 || item.score > item.maxScore || !numeric(item.durationSeconds) || !['theory', 'operation'].includes(String(item.kind)) || !Array.isArray(item.details) || typeof item.submittedAt !== 'string') throw new Error('成绩记录不合法。')
  if (typeof item.scoreVisible !== 'boolean' || typeof item.title !== 'string' || typeof item.taskId !== 'string' || !numeric(item.accuracy) || item.accuracy < 0 || item.accuracy > 100 || !['practice', 'exam'].includes(String(item.mode))) throw new Error('成绩名称、可见性或训练模式不合法。')
  for (const rawDetail of item.details) {
    const detail = asObject(rawDetail)
    if (!numeric(detail.score) || !numeric(detail.maxScore) || typeof detail.passed !== 'boolean' || typeof detail.title !== 'string') throw new Error('成绩详情不合法。')
    if (detail.question) detail.question = normaliseQuestion(detail.question)
  }
  return clone(item) as unknown as WorkspaceScore
}
function launch(raw: unknown): OperationLaunch {
  const item = asObject(raw)
  if (!validId(item.id) || !validId(item.studentId) || typeof item.flowId !== 'string' || typeof item.title !== 'string' || !['exam', 'student'].includes(String(item.returnPage)) || !['practice', 'exam'].includes(String(item.mode)) || !numeric(item.maxScore) || item.maxScore <= 0 || !numeric(item.durationMinutes) || item.durationMinutes <= 0) throw new Error('操作考核结构不合法。')
  if (item.taskDeadlineAt !== undefined && !numeric(item.taskDeadlineAt)) throw new Error('操作任务截止时间不合法。')
  if (item.scene) item.scene = normaliseScene(item.scene)
  return clone(item) as unknown as OperationLaunch
}
function operation(raw: unknown): OperationSession {
  const item = asObject(raw); launch(item)
  if (!numeric(item.startedAt) || (!numeric(item.deadlineAt) && item.deadlineAt !== null) || !Array.isArray(item.steps) || !stringArray(item.completedSteps) || !Array.isArray(item.recordedOps) || !numeric(item.observedStepIndex) || !stringArray(item.activeStateIds) || !stringArray(item.stoppedStateIds) || !stringArray(item.disabledStateIds)) throw new Error('活动操作考核数据损坏。')
  if (item.recordedOps.length > 3000 || item.steps.length > 5000 || !Number.isInteger(item.observedStepIndex) || item.observedStepIndex < 0) throw new Error('操作记录或步骤数量无效。')
  for (const rawStep of item.steps) {
    const step = asObject(rawStep)
    if (!validId(step.id) || typeof step.name !== 'string' || typeof step.description !== 'string' || typeof step.deviceId !== 'string' || !Array.isArray(step.rules) || !numeric(step.maxScore) || step.maxScore < 0) throw new Error('操作步骤快照损坏。')
  }
  for (const rawOp of item.recordedOps) {
    const op = asObject(rawOp)
    if (!validId(op.deviceId) || !validId(op.logId) || !numeric(op.at) || !['打开', '关闭'].includes(String(op.operation))) throw new Error('手动操作记录损坏。')
    if (op.changes) for (const [key, value] of Object.entries(asObject(op.changes))) {
      if (!['value', 'working', 'error', 'enabled'].includes(key) || (key === 'value' ? !numeric(value) : typeof value !== 'boolean')) throw new Error('手动属性变更损坏。')
    }
  }
  if (item.flowAssessment) {
    const runtime = asObject(item.flowAssessment), definition = asObject(runtime.definition)
    if (!Array.isArray(definition.stages) || definition.stages.length > 500 || !Array.isArray(runtime.rules) || runtime.rules.length > 5000 || !Array.isArray(runtime.stageCompletedAt) || runtime.stageCompletedAt.length !== definition.stages.length || !numeric(runtime.nextStageIndex) || !Number.isInteger(runtime.nextStageIndex) || runtime.nextStageIndex < 0 || runtime.nextStageIndex > definition.stages.length || runtime.maxScore !== item.maxScore || !stringArray(runtime.notes)) throw new Error('原阶段评分运行态损坏。')
    for (const rawStage of definition.stages) {
      const stage = asObject(rawStage)
      if (typeof stage.name !== 'string' || !Array.isArray(stage.conditions) || !Array.isArray(stage.triggers)) throw new Error('原评分阶段定义损坏。')
      for (const rawRule of [...stage.conditions, ...stage.triggers]) { const rule = asObject(rawRule); if (typeof rule.name !== 'string' || typeof rule.type !== 'string') throw new Error('原评分规则损坏。') }
    }
    for (const rawResult of runtime.rules) {
      const result = asObject(rawResult)
      if (!validId(result.id) || !numeric(result.stageIndex) || !Number.isInteger(result.stageIndex) || result.stageIndex < 0 || result.stageIndex >= definition.stages.length || !numeric(result.maxScore) || result.maxScore < 0 || !numeric(result.score) || result.score < 0 || result.score > result.maxScore || (result.passed !== null && typeof result.passed !== 'boolean') || !Array.isArray(result.readings)) throw new Error('原阶段评分明细损坏。')
    }
  }
  const events = asObject(item.runtimeEvents)
  if (Object.values(events).some(value => !numeric(value))) throw new Error('事件计时数据损坏。')
  const session = clone(item) as unknown as OperationSession
  // Simulator device state is deliberately not persisted by this workspace. Do not award progress after a reload until a manual restart.
  session.runReady = false
  return session
}
function theory(raw: unknown): TheorySession {
  const item = asObject(raw)
  if (!validId(item.id) || !validId(item.studentId) || !Array.isArray(item.questions) || !item.questions.length || !numeric(item.startedAt) || !numeric(item.maxScore) || item.maxScore <= 0 || (!numeric(item.deadlineAt) && item.deadlineAt !== null) || !['exam', 'student'].includes(String(item.returnPage)) || !['practice', 'exam'].includes(String(item.mode))) throw new Error('活动理论答题数据损坏。')
  const questions = item.questions.map((value, index) => normaliseQuestion(value, index)), rawAnswers = asObject(item.answers), answers: Record<string, string[]> = {}
  for (const question of questions) {
    const selected = Array.isArray(rawAnswers[question.id]) ? [...new Set((rawAnswers[question.id] as unknown[]).filter((id): id is string => typeof id === 'string' && question.options.some(option => option.id === id)))] : []
    answers[question.id] = question.type === '多选题' ? selected : selected.slice(0, 1)
  }
  return { ...clone(item), questions, answers, revealed: stringArray(item.revealed) ? item.revealed.filter(id => questions.some(question => question.id === id)) : [], currentIndex: Math.max(0, Math.min(questions.length - 1, numeric(item.currentIndex) ? Math.floor(item.currentIndex) : 0)) } as unknown as TheorySession
}
export function decodeWorkspace(raw: unknown, defaults: WorkspaceState): { state: WorkspaceState; warnings: string[] } {
  const input = asObject(raw)
  if (input.schemaVersion !== WORKSPACE_SCHEMA) throw new Error(`本地数据版本不兼容（需要版本 ${WORKSPACE_SCHEMA}）。原始数据可导出后恢复。`)
  const data = asObject(input.data), state = clone(defaults), warnings: string[] = []
  const converters: Record<string, (item: unknown, index: number) => unknown> = {
    questions: normaliseQuestion, papers: normalisePaper, tasks: task, students: normaliseStudent, files: file, scores: score, scenes: normaliseScene,
  }
  for (const [key, converter] of Object.entries(converters)) {
    if (!Array.isArray(data[key]) || (data[key] as unknown[]).length > 20000) throw new Error(`本地 ${key} 列表不存在或数量异常。`)
    const ids = new Set<string>(), rows: unknown[] = []
    ;(data[key] as unknown[]).forEach((value, index) => {
      try {
        const row = converter(value, index), rowId = asObject(row).id
        if (!validId(rowId) || ids.has(rowId)) throw new Error('编号重复或无效。')
        ids.add(rowId); rows.push(row)
      } catch (error) { warnings.push(`${key} 第 ${index + 1} 条：${error instanceof Error ? error.message : '无效'}`) }
    })
    ;(state as unknown as Record<string, unknown>)[key] = rows
  }
  for (const key of ['teacherTab', 'studentTab', 'examTab', 'offlineStudentId', 'lastScoreId', 'editorSelectedState'] as const) if (typeof data[key] === 'string') state[key] = data[key] as string
  state.hiddenFlowIds = stringArray(data.hiddenFlowIds) ? data.hiddenFlowIds : []
  state.submittedTaskKeys = [...new Set([...(stringArray(data.submittedTaskKeys) ? data.submittedTaskKeys : []), ...state.scores.filter(score => score.taskId && score.mode === 'exam').map(score => JSON.stringify([score.taskId, score.studentId]))])]
  state.favourites = {}
  if (data.favourites && typeof data.favourites === 'object') for (const [id, values] of Object.entries(asObject(data.favourites))) if (validId(id) && stringArray(values)) state.favourites[id] = values
  try { state.activeTheory = data.activeTheory ? theory(data.activeTheory) : null } catch (error) { warnings.push(String(error)) }
  try { state.activeOperation = data.activeOperation ? operation(data.activeOperation) : null } catch (error) { warnings.push(String(error)) }
  try { state.pendingLaunch = data.pendingLaunch ? launch(data.pendingLaunch) : null } catch (error) { warnings.push(String(error)) }
  if (state.activeTheory && (state.activeOperation || state.pendingLaunch)) { state.activeOperation = null; state.pendingLaunch = null; warnings.push('同时存在多份活动考核，已保留理论答题并移除冲突操作。') }
  // An editor draft may be deliberately incomplete. Preserve its typed structure; validation happens on Save/Run.
  if (data.editorDraft) {
    try {
      const draft = asObject(data.editorDraft)
      const error = validateSceneStructure(draft as unknown as NonNullable<WorkspaceState['editorDraft']>)
      if (error) throw new Error(error)
      state.editorDraft = clone(draft) as unknown as WorkspaceState['editorDraft']
    } catch (error) { warnings.push(String(error)) }
  }
  if (data.recording) {
    try {
      const recording = asObject(data.recording)
      state.recording = { active: false, autoIncrement: recording.autoIncrement !== false, nextIndex: numeric(recording.nextIndex) && Number.isInteger(recording.nextIndex) && recording.nextIndex >= 0 ? recording.nextIndex : 1, lastLogId: '' }
    } catch (error) { warnings.push(String(error)) }
  }
  return { state, warnings }
}
export function readWorkspace(defaults: WorkspaceState): { state: WorkspaceState; status: StorageStatus } {
  const status: StorageStatus = { error: '', savedAt: '', recoveryData: '', persistent: true }
  let raw = ''
  try {
    raw = localStorage.getItem(WORKSPACE_STORAGE_KEY) || ''
    if (!raw) return { state: defaults, status }
    const input: unknown = JSON.parse(raw), result = decodeWorkspace(input, defaults)
    status.savedAt = typeof asObject(input).savedAt === 'string' ? asObject(input).savedAt as string : ''
    if (result.warnings.length) { status.error = `已跳过 ${result.warnings.length} 条损坏记录。可导出原数据查看。`; status.recoveryData = raw }
    return { state: result.state, status }
  } catch (error) {
    status.error = `无法读取本地工作台数据：${error instanceof Error ? error.message : '浏览器存储不可用'}。当前使用内存 / 演示数据。`
    status.recoveryData = raw; status.persistent = !raw
    return { state: defaults, status }
  }
}
export function writeWorkspace(state: WorkspaceState, status: StorageStatus): boolean {
  try {
    if (status.recoveryData) {
      localStorage.setItem(`${WORKSPACE_STORAGE_KEY}.recovery`, status.recoveryData)
    }
    const savedAt = new Date().toISOString()
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ schemaVersion: WORKSPACE_SCHEMA, savedAt, data: state }))
    status.savedAt = savedAt; status.persistent = true
    if (!status.recoveryData) status.error = ''
    return true
  } catch (error) {
    status.persistent = false
    status.error = `本地保存失败：${error instanceof Error ? error.message : '存储空间不足或被禁用'}。本次修改仍在内存中，请及时导出备份。`
    return false
  }
}
