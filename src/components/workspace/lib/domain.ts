import { computed, ref, watch, type Ref } from 'vue'
import { pages, workflows } from '../../../data/catalog'
import { isDeviceId, validateSnapshot } from '../../../state/engine'
import { questionTypes, propertyLabels, logicLabels } from '../../../data/workspace'
import type { Comparator, LocalFlowRule, LocalWorkload, SceneAction, SceneCondition, SceneDefinition, WorkspacePaper, WorkspaceQuestion, WorkspaceStudent } from '../../../data/workspace'

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export const newId = (prefix = 'local') => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
export const isoNow = () => new Date().toISOString()
export const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10
export const validLocalId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && id.trim() === id && !/[\u0000-\u001f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id)
export const safeName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || '导出文件'
export function formatDate(value: string | number | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}
export function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':')
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${round(bytes / 1024)} KB`
  return `${round(bytes / 1024 / 1024)} MB`
}
export function toDateInput(value: string | number) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function matches(text: string, query: string) { return text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) }
export function usePagination<T>(items: Ref<T[]>, initialSize = 10) {
  const page = ref(1), pageSize = ref(initialSize)
  const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize.value)))
  watch([() => items.value.length, pageSize], () => { page.value = Math.min(page.value, pageCount.value) })
  const rows = computed(() => items.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  return { page, pageSize, pageCount, rows }
}
export function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
export const answerLetters = (question: WorkspaceQuestion, ids: string[]) => question.options.flatMap((option, index) => ids.includes(option.id) ? [String.fromCharCode(65 + index)] : []).join('、') || '未作答'
export const correctIds = (question: WorkspaceQuestion) => question.options.filter(option => option.correct).map(option => option.id)
export const answerIsCorrect = (question: WorkspaceQuestion, ids: string[]) => {
  const expected = correctIds(question)
  return ids.length === expected.length && expected.every(id => ids.includes(id))
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = safeName(filename); document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }))
}
export function csvCell(value: unknown) {
  let text = String(value ?? '')
  // Prevent spreadsheet formula execution in downloaded user-authored CSV values.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export function makeCsv(rows: unknown[][]) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') }
/** RFC4180-style parser: quoted commas/newlines and doubled quotes are supported. */
export function parseCsv(text: string): string[][] {
  const result: string[][] = []; let row: string[] = [], cell = '', quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else if (!quoted && cell.length) throw new Error('CSV 引号位置不正确。')
      else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); if (row.some(value => value.trim())) result.push(row)
      row = []; cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号。')
  row.push(cell); if (row.some(value => value.trim())) result.push(row)
  return result
}
export const asObject = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('数据必须是 JSON 对象。')
  return raw as Record<string, unknown>
}
const textOf = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const numberOf = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const stringsOf = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => item.trim()))] : []

export function validateQuestion(question: WorkspaceQuestion): string {
  if (!question || !validLocalId(question.id) || typeof question.content !== 'string' || !Array.isArray(question.options) || !Array.isArray(question.tags)) return '题目结构或编号不合法。'
  if (!question.content.trim() || question.content.length > 10000) return '题目内容不能为空，且不得超过 10000 字。'
  if (!questionTypes.includes(question.type)) return '题目类型不支持。'
  if (question.options.length < 2 || question.options.length > 8) return '题目需要 2～8 个选项。'
  if (question.type === '判断题' && question.options.length !== 2) return '判断题必须有两个选项。'
  if (question.options.some(option => !option || !validLocalId(option.id) || typeof option.text !== 'string' || !option.text.trim() || typeof option.correct !== 'boolean')) return '选项编号、内容或答案不合法。'
  if (new Set(question.options.map(option => option.id)).size !== question.options.length) return '选项编号重复。'
  const answers = question.options.filter(option => option.correct).length
  if (!answers || (question.type !== '多选题' && answers !== 1)) return question.type === '多选题' ? '请至少勾选一个正确答案。' : '单选题和判断题必须有且仅有一个正确答案。'
  if (!Number.isFinite(question.points) || question.points <= 0 || question.points > 1000) return '分值权重必须在 0～1000 之间且大于 0。'
  return ''
}
export function normaliseQuestion(raw: unknown, index = 0, fallbackTag = ''): WorkspaceQuestion {
  const item = asObject(raw), id = textOf(item.id ?? item.Id) || newId('question')
  const content = textOf(item.content ?? item.Content ?? item.Title ?? item.title)
  const inputOptions = item.options ?? item.Options
  if (!Array.isArray(inputOptions)) throw new Error(`第 ${index + 1} 题没有选项。`)
  const answer = textOf(item.answer ?? item.Answer ?? item.RightAnswer).toUpperCase()
  const options = inputOptions.map((rawOption, optionIndex) => {
    const option = typeof rawOption === 'string' ? { text: rawOption } : asObject(rawOption)
    return { id: textOf(option.id) || `${id}-${optionIndex}`, text: textOf(option.text ?? option.Sentence ?? option.Content ?? option.content),
      correct: typeof option.correct === 'boolean' ? option.correct : typeof option.IsAnswer === 'boolean' ? option.IsAnswer : answer.includes(String.fromCharCode(65 + optionIndex)) }
  })
  const inputTags = item.tags ?? item.Tags
  const tags = Array.isArray(inputTags) ? inputTags.map(tag => typeof tag === 'string' ? tag : textOf(asObject(tag).Content)).filter(Boolean) : []
  if (fallbackTag && !tags.includes(fallbackTag)) tags.push(fallbackTag)
  const nativeType = textOf(item.type ?? item.QType)
  const type = questionTypes.includes(nativeType as WorkspaceQuestion['type']) ? nativeType as WorkspaceQuestion['type'] : options.filter(option => option.correct).length > 1 ? '多选题' : '单选题'
  const question: WorkspaceQuestion = { id, content, options, type, tags, explanation: textOf(item.explanation ?? item.Explain ?? item.Explanation),
    points: numberOf(item.points, 1), locked: item.locked === true, source: textOf(item.source) || '用户导入（本地）', updatedAt: textOf(item.updatedAt) || isoNow() }
  const error = validateQuestion(question)
  if (error) throw new Error(`第 ${index + 1} 题：${error}`)
  return question
}
export function questionsFromFile(text: string, filename: string): { questions: WorkspaceQuestion[]; errors: string[] } {
  const questions: WorkspaceQuestion[] = [], errors: string[] = []
  let rows: unknown[]
  const fallbackTag = /T11/i.test(filename) ? 'T11' : /T12/i.test(filename) ? 'T12' : ''
  if (/\.csv$/i.test(filename)) {
    const csv = parseCsv(text)
    if (csv.length < 2) throw new Error('CSV 文件为空或只有表头。')
    rows = csv.slice(1).map(fields => ({ content: fields[0], options: fields.slice(1, 6).filter(value => value?.trim()).map(value => ({ text: value.replace(/\[正确\]/g, '').trim(), correct: value.includes('[正确]') })), tags: fields.slice(6).join(',').split(/[,，;；]/).filter(Boolean) }))
  } else {
    const input: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
    rows = Array.isArray(input) ? input : (asObject(input).questions as unknown[])
    if (!Array.isArray(rows)) throw new Error('JSON 应为题目数组或包含 questions 数组的对象。')
  }
  if (rows.length > 10000) throw new Error('一次最多导入 10000 道题目。')
  rows.forEach((row, index) => { try { questions.push(normaliseQuestion(row, index, fallbackTag)) } catch (error) { errors.push(error instanceof Error ? error.message : `第 ${index + 1} 题无效`) } })
  return { questions, errors }
}
export function normalisePaper(raw: unknown): WorkspacePaper {
  const item = asObject(raw)
  const paper: WorkspacePaper = { id: textOf(item.id) || newId('paper'), title: textOf(item.title), description: textOf(item.description),
    questionIds: stringsOf(item.questionIds), durationMinutes: numberOf(item.durationMinutes, 60), maxScore: numberOf(item.maxScore, 100),
    passPercent: numberOf(item.passPercent, 60), shuffle: item.shuffle === true, createdAt: textOf(item.createdAt) || isoNow(), updatedAt: textOf(item.updatedAt) || isoNow() }
  if (!paper.title || !paper.questionIds.length || paper.durationMinutes < 1 || paper.durationMinutes > 1440 || paper.maxScore <= 0 || paper.maxScore > 10000 || paper.passPercent < 0 || paper.passPercent > 100) throw new Error('试卷名称、题目数量、时长或分数设置无效。')
  return paper
}
export function normaliseStudent(raw: unknown): WorkspaceStudent {
  const item = asObject(raw), name = textOf(item.name ?? item.Name ?? item.姓名), studentNo = textOf(item.studentNo ?? item.StudentId ?? item.学号)
  if (!name || !studentNo) throw new Error('学生姓名和学号不能为空。')
  return { id: textOf(item.id) || newId('student'), name, studentNo, group: textOf(item.group ?? item.班级) || '未分组' }
}

export function emptyCondition(): SceneCondition {
  return { id: newId('condition'), kind: 'device', deviceType: '阀门', deviceId: '', property: 'value', comparator: '>', value: 0, upper: 100,
    boolValue: true, seconds: 60, stateId: '', stateStatus: 'active', source: 'user', logic: 'and', children: [] }
}
export function emptyAction(): SceneAction {
  return { id: newId('action'), kind: 'score', score: 2, weight: 1, stateId: '', workloadName: '', deviceId: '', property: 'value', value: 100, boolValue: true, message: '' }
}
export function emptyScene(): SceneDefinition {
  const initialId = newId('state'), transitionId = newId('state'), finalId = newId('state')
  return { id: newId('scene'), name: '未命名场景题', description: '', flowId: 'supply', page: 'lfss', requiresSafety: false,
    durationMinutes: 20, maxScore: 100, passPercent: 60, mode: 'state',
    states: [{ id: initialId, name: '初始状态', kind: 'initial', groups: [], conditions: [] }, { id: transitionId, name: '状态 1', kind: 'transition', groups: [], conditions: [] }, { id: finalId, name: '终止状态', kind: 'final', groups: [], conditions: [] }],
    initialActiveStates: [transitionId], workloadName: '', legacyOps: [], createdAt: isoNow(), updatedAt: isoNow() }
}
export function ruleCondition(rule: LocalFlowRule): SceneCondition {
  const condition = emptyCondition(); condition.source = 'any'
  const names = rule.name.trim().split(/\s+/).filter(Boolean)
  if (names.length > 1) { condition.kind = 'logic'; condition.children = names.map(name => ruleCondition({ ...rule, name })); return condition }
  condition.deviceId = names[0] || ''
  const type = rule.type
  if (['DeviceOpen', 'DeviceClose'].includes(type)) { condition.property = 'working'; condition.boolValue = type === 'DeviceOpen'; condition.comparator = '==' }
  else if (type === 'ValveOpen') { condition.comparator = '>'; condition.value = 0 }
  else if (type === 'ValveClose') { condition.comparator = '=='; condition.value = 0 }
  else { condition.kind = 'sensor'; condition.source = 'any'; condition.comparator = type === 'LessThan' ? '<' : type === 'GreaterThan' ? '>' : '=='; condition.value = rule.value ?? 0 }
  return condition
}
export function sceneFromWorkflow(flowId: string): SceneDefinition {
  const flow = workflows.find(item => item.id === flowId)
  if (!flow) throw new Error('未找到流程。')
  const scene = emptyScene(); scene.name = `${flow.name}（场景副本）`; scene.description = `从原 WPF 流程 ${flow.source} 复制，设备条件为本地演示评估。`
  scene.flowId = flow.id; scene.page = flow.page; scene.requiresSafety = flow.requiresSafety
  const finalState = scene.states.find(state => state.kind === 'final')!
  const transitions = flow.steps.map((step, index) => ({ id: newId('state'), name: step.name || `状态 ${index + 1}`, kind: 'transition' as const, conditions: [], groups: [] as SceneDefinition['states'][number]['groups'] }))
  transitions.forEach((state, index) => {
    const step = flow.steps[index]!, condition = emptyCondition(); condition.kind = 'logic'; condition.source = 'any'; condition.children = step.rules.map(ruleCondition)
    if (!condition.children.length) { condition.kind = 'time'; condition.seconds = index + 1 }
    const score = emptyAction(); score.score = step.rules.reduce((total, rule) => total + (rule.weight ?? 1), 0) || 1
    const transfer = emptyAction(); transfer.kind = 'activate'; transfer.stateId = transitions[index + 1]?.id ?? finalState.id
    const stop = emptyAction(); stop.kind = 'stop'; stop.stateId = state.id
    state.groups.push({ id: newId('group'), name: '分数记录', kind: 'score', events: [{ id: newId('event'), name: step.name, condition: clone(condition), action: score }] },
      { id: newId('group'), name: '状态变更', kind: 'transfer', events: [{ id: newId('event'), name: '激活下一状态', condition: clone(condition), action: transfer }, { id: newId('event'), name: '停止当前状态', condition: clone(condition), action: stop }] })
  })
  scene.states = [scene.states[0]!, ...transitions, finalState]; scene.initialActiveStates = transitions[0] ? [transitions[0].id] : []
  return scene
}
export function validateCondition(condition: SceneCondition, scene: SceneDefinition, depth = 0, draft = false): string {
  if (!condition || typeof condition !== 'object' || !validLocalId(condition.id)) return '条件结构或编号无效。'
  if (depth > 6) return '逻辑条件最多嵌套 6 层。'
  if (!['device', 'sensor', 'time', 'state', 'logic', 'always'].includes(condition.kind)) return '未知条件类型。'
  if (!Object.hasOwn(propertyLabels, condition.property) || !['==', '!=', '>', '>=', '<', '<=', 'between'].includes(condition.comparator)) return '条件属性或比较方式无效。'
  if (!['user', 'any'].includes(condition.source) || !Object.hasOwn(logicLabels, condition.logic) || !['active', 'stopped', 'disabled'].includes(condition.stateStatus)) return '条件来源、逻辑或状态方式无效。'
  if (typeof condition.boolValue !== 'boolean' || typeof condition.deviceId !== 'string' || typeof condition.stateId !== 'string' || !Array.isArray(condition.children) || condition.children.length > 50) return '条件字段结构无效。'
  if (!Number.isFinite(condition.value) || !Number.isFinite(condition.upper) || !Number.isFinite(condition.seconds)) return '条件数值必须是有限数字。'
  if (condition.kind === 'device' || condition.kind === 'sensor') {
    const ids = condition.deviceId.trim().split(/\s+/).filter(Boolean)
    if ((!draft && !ids.length) || ids.length > 50 || ids.some(id => !isDeviceId(id))) return '请选择有效设备。'
    if (condition.property !== 'value' && !['==', '!='].includes(condition.comparator)) return '布尔属性只能比较等于或不等于。'
  }
  if (condition.comparator === 'between' && condition.value > condition.upper) return '数值范围下限不能大于上限。'
  if (condition.kind === 'time' && condition.seconds < 0) return '时间条件不能为负数。'
  if (!draft && condition.kind === 'state' && !scene.states.some(state => state?.id === condition.stateId)) return '状态条件引用了不存在的状态。'
  if (condition.kind === 'logic' && !draft && !condition.children.length) return '逻辑条件至少包含一个子条件。'
  for (const child of condition.children) { const error = validateCondition(child, scene, depth + 1, draft); if (error) return error }
  return ''
}
export function validateAction(action: SceneAction, scene: SceneDefinition, draft = false): string {
  if (!action || typeof action !== 'object' || !validLocalId(action.id)) return '动作结构或编号无效。'
  if (!['score', 'activate', 'stop', 'disable', 'load', 'device', 'notify'].includes(action.kind)) return '未知动作类型。'
  if (!Object.hasOwn(propertyLabels, action.property) || typeof action.boolValue !== 'boolean' || typeof action.deviceId !== 'string' || typeof action.stateId !== 'string' || typeof action.message !== 'string' || typeof action.workloadName !== 'string') return '动作属性或字段结构无效。'
  if (!Number.isFinite(action.score) || Math.abs(action.score) > 10000 || !Number.isFinite(action.weight) || action.weight <= 0 || action.weight > 10000 || !Number.isFinite(action.value)) return '动作分值、权重和数值必须合法。'
  if (!draft && ['activate', 'stop', 'disable'].includes(action.kind) && !scene.states.some(state => state?.id === action.stateId)) return '动作引用了不存在的状态。'
  if (action.kind === 'device' && ((!draft && !action.deviceId) || (action.deviceId && !isDeviceId(action.deviceId)))) return '设备设置动作必须选择有效设备。'
  if (!draft && action.kind === 'load' && !action.workload) return '加载工况动作必须选择工况文件。'
  if (action.workload) { try { normaliseWorkload(action.workload) } catch (error) { return error instanceof Error ? error.message : '动作工况无效。' } }
  if (!draft && action.kind === 'notify' && !action.message.trim()) return '消息提示内容不能为空。'
  if (action.message.length > 10000) return '消息提示内容过长。'
  return ''
}
/** Structural checks also apply to incomplete, persisted editor drafts. */
export function validateSceneStructure(scene: SceneDefinition, draft = true): string {
  if (!scene || typeof scene !== 'object' || !validLocalId(scene.id) || typeof scene.name !== 'string' || typeof scene.description !== 'string' || typeof scene.flowId !== 'string' || typeof scene.page !== 'string') return '场景结构或编号无效。'
  if (!['state', 'sequence'].includes(scene.mode) || typeof scene.requiresSafety !== 'boolean') return '场景模式或安全检查设置无效。'
  if (!Array.isArray(scene.states) || scene.states.length > 500 || !Array.isArray(scene.initialActiveStates) || !scene.initialActiveStates.every(id => validLocalId(id)) || !Array.isArray(scene.legacyOps) || scene.legacyOps.length > 500) return '场景状态 / 操作列表结构或数量无效。'
  if (new Set(scene.states.map(state => state?.id)).size !== scene.states.length) return '状态编号重复。'
  const eventIds = new Set<string>(), groupIds = new Set<string>()
  let eventCount = 0
  for (const state of scene.states) {
    if (!state || !validLocalId(state.id) || typeof state.name !== 'string' || !['initial', 'transition', 'final'].includes(state.kind) || !Array.isArray(state.groups) || state.groups.length > 100 || !Array.isArray(state.conditions) || state.conditions.length > 100) return '状态结构不合法。'
    for (const condition of state.conditions) { const error = validateCondition(condition, scene, 0, draft); if (error) return error }
    for (const group of state.groups) {
      if (!group || !validLocalId(group.id) || groupIds.has(group.id) || typeof group.name !== 'string' || !['score', 'transfer'].includes(group.kind) || !Array.isArray(group.events)) return '事件组结构或编号无效。'
      groupIds.add(group.id)
      for (const event of group.events) {
        if (!event || !validLocalId(event.id) || eventIds.has(event.id) || typeof event.name !== 'string' || ++eventCount > 5000) return '事件结构、编号或数量无效。'
        eventIds.add(event.id)
        const error = validateCondition(event.condition, scene, 0, draft) || validateAction(event.action, scene, draft)
        if (error) return `${state.name}：${error}`
      }
    }
  }
  const opIds = new Set<string>()
  for (const op of scene.legacyOps) {
    if (!op || !validLocalId(op.id) || opIds.has(op.id) || typeof op.deviceId !== 'string' || (op.deviceId && !isDeviceId(op.deviceId)) || !['打开', '关闭'].includes(op.operation)) return '操作结构或编号无效。'
    opIds.add(op.id)
  }
  return ''
}
export function validateScene(scene: SceneDefinition): string {
  const structureError = validateSceneStructure(scene, scene?.mode === 'sequence')
  if (structureError) return structureError
  if (!scene.name.trim() || scene.name.length > 120) return '场景名称不能为空，且不得超过 120 字。'
  if (!workflows.some(flow => flow.id === scene.flowId) || !pages.some(page => page.id === scene.page)) return '请选择对应的工艺流程和有效初始页面。'
  if (!Number.isFinite(scene.maxScore) || scene.maxScore <= 0 || scene.maxScore > 10000 || !Number.isFinite(scene.durationMinutes) || scene.durationMinutes < 1 || scene.durationMinutes > 1440 || !Number.isFinite(scene.passPercent) || scene.passPercent < 0 || scene.passPercent > 100) return '总分、时限或通过比例无效。'
  if (scene.workload) { try { normaliseWorkload(scene.workload) } catch (error) { return error instanceof Error ? error.message : '初始工况无效。' } }
  if (scene.mode === 'sequence') {
    if (!scene.legacyOps.length) return '至少添加一个操作。'
    if (scene.legacyOps.some(op => !isDeviceId(op.deviceId) || !Number.isFinite(op.weight) || op.weight <= 0 || op.weight > 10000 || !Number.isInteger(op.index) || op.index < 0 || op.index > 1000000)) return '操作的设备、时间序号或分数权重无效。'
    return ''
  }
  if (scene.states.filter(state => state.kind === 'initial').length !== 1 || scene.states.filter(state => state.kind === 'final').length !== 1) return '必须保留唯一的初始状态和终止状态。'
  if (!scene.initialActiveStates.length || scene.initialActiveStates.some(id => !scene.states.some(state => state.id === id && state.kind === 'transition'))) return '请选择至少一个有效初始化激活状态。'
  if (scene.states.some(state => !state.name.trim())) return '状态名称不能为空。'
  const scored = scene.states.some(state => state.groups.some(group => group.events.some(event => event.action.kind === 'score' && event.action.score > 0)))
  return scored ? '' : '至少添加一个加分事件。'
}
export function normaliseScene(raw: unknown): SceneDefinition {
  const item = asObject(raw)
  if (item.mode !== 'state' && item.mode !== 'sequence') throw new Error('不支持的场景格式。请导入本 Web 编辑器导出的场景 JSON；原 WPF 引用图格式不可直接加载。')
  const scene = clone(item) as unknown as SceneDefinition
  if (!scene.id) scene.id = newId('scene')
  const error = validateScene(scene)
  if (error) throw new Error(error)
  return scene
}
export function normaliseWorkload(raw: unknown): LocalWorkload {
  const input = asObject(raw), snapshot = validateSnapshot(input)
  // Keep sensor thresholds, frozen flags and motor parameters, not only on/off.
  return { schemaVersion: 1, name: textOf(input.name) || '导入工况', elapsed: snapshot.elapsed, devices: snapshot.devices as LocalWorkload['devices'] }
}
export function conditionText(condition: SceneCondition, scene?: SceneDefinition): string {
  if (condition.kind === 'always') return '始终成立'
  if (condition.kind === 'logic') return `${logicLabels[condition.logic]}：${condition.children.map(child => conditionText(child, scene)).join('；') || '尚未添加子条件'}`
  if (condition.kind === 'time') return `开始后经过 ${condition.seconds} 秒`
  if (condition.kind === 'state') return `${scene?.states.find(state => state.id === condition.stateId)?.name ?? '未选择状态'} · ${condition.stateStatus === 'active' ? '激活' : condition.stateStatus === 'stopped' ? '停止' : '禁用'}`
  return `${condition.deviceId || '未选择设备'} · ${propertyLabels[condition.property]} ${condition.comparator === 'between' ? `${condition.value}～${condition.upper}` : `${condition.comparator} ${condition.property === 'value' ? condition.value : condition.boolValue ? '是' : '否'}`} ${condition.source === 'user' ? '（需本次手动操作）' : ''}`
}
export function actionText(action: SceneAction, scene?: SceneDefinition) {
  if (action.kind === 'score') return `${action.score >= 0 ? '加分' : '减分'} ${Math.abs(action.score)} · 权重 ${action.weight}`
  if (action.kind === 'load') return `加载工况：${action.workloadName || '未选择'}`
  if (action.kind === 'device') return `设备设置：${action.deviceId} · ${propertyLabels[action.property]} = ${action.property === 'value' ? action.value : action.boolValue}`
  if (action.kind === 'notify') return `消息提示：${action.message}`
  return `${action.kind === 'activate' ? '激活' : action.kind === 'stop' ? '停止' : '禁用'}状态：${scene?.states.find(state => state.id === action.stateId)?.name || '未选择'}`
}
export function compareValue(value: number | boolean, comparator: Comparator, expected: number | boolean, upper: number): boolean {
  if (typeof value === 'boolean') return comparator === '!=' ? value !== expected : value === expected
  if (typeof expected !== 'number') return false
  switch (comparator) {
    case '==': return Math.abs(value - expected) < 0.0001
    case '!=': return Math.abs(value - expected) >= 0.0001
    case '>': return value > expected
    case '>=': return value >= expected
    case '<': return value < expected
    case '<=': return value <= expected
    case 'between': return value >= expected && value <= upper
  }
}
