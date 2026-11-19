import { computed, reactive, ref, watch } from 'vue'
import { workflows } from '../data/catalog'
import { builtinMaterials, createSeedQuestions, WORKSPACE_SCHEMA } from '../data/workspace'
import type { AssessmentMode, DeviceProperty, OperationLaunch, OperationSession, ReturnPage, SceneDefinition, TheorySession, WorkspaceFile, WorkspacePaper, WorkspaceQuestion, WorkspaceScore, WorkspaceState, WorkspaceStudent, WorkspaceTask } from '../data/workspace'
import { safetyGateEnabled, useSimulator } from './simulator'
import { asObject, clone, downloadBlob, downloadText, emptyScene, isoNow, makeCsv, matches, newId, normalisePaper, normaliseQuestion, normaliseScene, normaliseStudent, normaliseWorkload, round, safeName, sceneFromWorkflow, shuffled, validateQuestion, validateScene } from '../components/workspace/lib/domain'
import { evaluateCondition, makeScore, operationDetails, theoryDetails } from '../components/workspace/lib/assessment'
import { createFlowAssessment, feedFlowAssessment } from '../components/workspace/lib/flowAssessment'
import { getFile, removeStoredFile, storeFile } from '../components/workspace/lib/files'
import { decodeWorkspace, readWorkspace, writeWorkspace } from '../components/workspace/lib/storage'
import { useIlab } from './ilab'
import { useInternalTest } from './internalTest'

const simulator = useSimulator()
const ilab = useIlab()
function platformStudentId() {
  const session = ilab.state.session, config = ilab.state.config
  return session && config && simulator.state.role === 'student' && simulator.state.userName === ilab.platformLabel()
    ? `ilab:${session.mode}:${config.appid}:${encodeURIComponent(session.username)}` : ''
}
function seedState(): WorkspaceState {
  const createdAt = isoNow(), startAt = new Date(Date.now() - 86400000).toISOString(), endAt = new Date(Date.now() + 7 * 86400000).toISOString()
  const questions = createSeedQuestions()
  const papers: WorkspacePaper[] = [
    { id: 'paper-t11', title: 'T11 基础培训测验', description: '原 WPF T11 题库前 20 题，本地示例试卷。答案及解析请教师校核。', questionIds: questions.filter(question => question.tags.includes('T11')).slice(0, 20).map(question => question.id), durationMinutes: 60, maxScore: 100, passPercent: 60, shuffle: false, createdAt, updatedAt: createdAt },
    { id: 'paper-t12', title: 'T12 高级培训测验', description: '原 WPF T12 题库前 20 题，本地示例试卷。', questionIds: questions.filter(question => question.tags.includes('T12')).slice(0, 20).map(question => question.id), durationMinutes: 60, maxScore: 100, passPercent: 60, shuffle: true, createdAt, updatedAt: createdAt },
  ]
  const taskBase = { mode: 'exam' as const, startAt, endAt, durationMinutes: 60, allStudents: true, participants: [], attachmentIds: ['material-guide'], scoreVisible: true, remark: '仅发布到当前浏览器的本地演示任务。', publishedAt: createdAt, createdAt, updatedAt: createdAt }
  return {
    questions, papers, students: [
      { id: 'student-demo', studentNo: '20240001', name: '演示学员', group: '甲醇培训一班' },
      { id: 'student-2', studentNo: '20240002', name: '张同学', group: '甲醇培训一班' },
      { id: 'student-3', studentNo: '20240003', name: '李同学', group: '甲醇培训一班' },
      { id: 'student-4', studentNo: '20240004', name: '王同学', group: '甲醇培训二班' },
    ],
    tasks: [
      { ...taskBase, id: 'task-theory', title: 'T11 理论基础考评（本地演示）', description: '请完成基础培训测验。作答和提交仅保存在当前浏览器，没有教师服务器。', kind: 'theory', paperId: 'paper-t11', operationId: '', snapshot: { questions: clone(questions.filter(question => papers[0]!.questionIds.includes(question.id))), maxScore: 100, passPercent: 60 } },
      { ...taskBase, id: 'task-operation', title: '岸载惰化操作任务（本地演示）', description: '先完成安全检查，然后按工艺流程手动操作。考核按实际完成步骤评分。', kind: 'operation', paperId: '', operationId: 'shore-inerting', durationMinutes: 20, snapshot: { flowId: 'shore-inerting', maxScore: 100, passPercent: 60 } },
    ],
    files: builtinMaterials.map(material => ({ id: material.id, name: material.name, type: 'text/plain', size: new Blob([material.text]).size, addedAt: createdAt, publishedAt: createdAt, allStudents: true, participants: [], origin: 'builtin', storage: 'builtin', builtinText: material.text })),
    scores: [], scenes: [sceneFromWorkflow('pump-failure')], hiddenFlowIds: [], favourites: {}, submittedTaskKeys: [], activeTheory: null, activeOperation: null,
    pendingLaunch: null, lastScoreId: '', offlineStudentId: 'student-demo', teacherTab: 'home', studentTab: 'home', examTab: 'menu', editorDraft: null,
    editorSelectedState: '', recording: { active: false, autoIncrement: true, nextIndex: 1, lastLogId: '' },
  }
}
const initial = readWorkspace(seedState())
const data = reactive(initial.state)
const storage = reactive(initial.status)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let observing = false
let processingLogs = false
const currentStudent = computed(() => data.students.find(student => student.id === platformStudentId()) ?? data.students.find(student => student.name === simulator.state.userName) ?? data.students.find(student => student.id === 'student-demo') ?? data.students[0])
const offlineStudent = computed(() => data.students.find(student => student.id === data.offlineStudentId) ?? currentStudent.value)
const tags = computed(() => [...new Set(data.questions.flatMap(question => question.tags))].sort())
const active = computed(() => data.activeTheory ?? data.activeOperation)
const myScores = computed(() => data.scores.filter(score => score.studentId === currentStudent.value?.id))
const operationItems = computed(() => [
  ...workflows.filter(flow => !data.hiddenFlowIds.includes(flow.id)).map(flow => ({ id: flow.id, name: flow.name, category: flow.category, flowId: flow.id, source: flow.source, scene: null as SceneDefinition | null })),
  ...data.scenes.map(scene => ({ id: `scene:${scene.id}`, name: scene.name, category: '自编操作题', flowId: scene.flowId, source: '本地场景编辑器', scene })),
])

function fail(error: unknown) { simulator.notify(error instanceof Error ? error.message : String(error), 'warning'); return false }
function persist() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  return writeWorkspace(data, storage)
}
watch(data, () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 250) }, { deep: true })
if (typeof window !== 'undefined') window.addEventListener('beforeunload', persist)
function success(message: string) { persist(); simulator.record(message); simulator.notify(message, 'success') }
function resolveStudent(returnPage: ReturnPage): WorkspaceStudent {
  if (returnPage === 'exam' && offlineStudent.value) return offlineStudent.value
  const platformId = returnPage === 'student' ? platformStudentId() : ''
  if (platformId && ilab.state.session) {
    let student = data.students.find(item => item.id === platformId)
    if (!student) { student = { id: platformId, studentNo: ilab.state.session.username, name: ilab.platformLabel(), group: '实验空间' }; data.students.push(student) }
    student.name = ilab.platformLabel()
    return student
  }
  const existing = data.students.find(student => student.name === simulator.state.userName)
  if (existing) return existing
  const student = { id: newId('student'), studentNo: `LOCAL-${data.students.length + 1}`, name: simulator.state.userName || '本地学员', group: '本地学习' }
  data.students.push(student)
  return student
}
watch(() => [simulator.state.loggedIn, simulator.state.role, simulator.state.userName], () => { if (simulator.state.loggedIn && simulator.state.role !== 'teacher') resolveStudent('student') }, { immediate: true })
function saveStudent(input: WorkspaceStudent): boolean {
  try {
    const student = normaliseStudent(input)
    if (data.students.some(item => item.studentNo === student.studentNo && item.id !== student.id)) throw new Error('该学号已存在。')
    const index = data.students.findIndex(item => item.id === student.id)
    if (index >= 0) data.students.splice(index, 1, student); else data.students.push(student)
    success('学生信息已保存到本地名册。'); return true
  } catch (error) { return fail(error) }
}
function removeStudent(id: string) {
  if (id === currentStudent.value?.id || id === data.offlineStudentId || data.activeTheory?.studentId === id || data.activeOperation?.studentId === id) return fail('不能删除当前学习身份或活动考核的学员。')
  data.students = data.students.filter(student => student.id !== id)
  data.tasks.forEach(task => { task.participants = task.participants.filter(value => value !== id) })
  data.files.forEach(file => { file.participants = file.participants.filter(value => value !== id) })
  success('学员已从本地名册移除；历史成绩仍保留姓名快照。'); return true
}
function setOfflineIdentity(studentNo: string, name: string): boolean {
  if (!studentNo.trim() || !name.trim()) return fail('请输入学号和姓名（本地身份，不进行服务器认证）。')
  let student = data.students.find(item => item.studentNo === studentNo.trim())
  if (student && student.name !== name.trim()) return fail('该学号已属于其他姓名，请使用对应姓名或创建新的本地学号。')
  if (!student) { student = { id: newId('student'), studentNo: studentNo.trim(), name: name.trim(), group: '单机考评' }; data.students.push(student) }
  data.offlineStudentId = student.id; persist(); return true
}
function saveQuestion(input: WorkspaceQuestion): boolean {
  const error = validateQuestion(input)
  if (error) return fail(error)
  const index = data.questions.findIndex(question => question.id === input.id)
  if (index >= 0 && data.questions[index]!.locked) return fail('题目已锁定，请先解锁再编辑。')
  const question = { ...clone(input), content: input.content.trim(), updatedAt: isoNow(), tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))] }
  if (index >= 0) data.questions.splice(index, 1, question); else data.questions.unshift(question)
  success('题目已保存；已发布任务和历史成绩的题目快照不受影响。'); return true
}
function deleteQuestions(ids: string[]) {
  const deleting = ids.filter(id => !data.questions.find(question => question.id === id)?.locked)
  const removed = new Set(deleting)
  data.questions = data.questions.filter(question => !removed.has(question.id))
  data.papers.forEach(paper => { paper.questionIds = paper.questionIds.filter(id => !removed.has(id)); paper.updatedAt = isoNow() })
  for (const values of Object.values(data.favourites)) { const retained = values.filter(id => !removed.has(id)); values.splice(0, values.length, ...retained) }
  success(`已从本地题库移除 ${deleting.length} 道题，锁定题目与已发布快照已保留。`); return true
}
function importQuestions(questions: WorkspaceQuestion[], mode: 'skip' | 'replace' | 'copy' = 'skip') {
  let count = 0, skipped = 0
  for (const original of questions) {
    const error = validateQuestion(original)
    if (error) { skipped++; continue }
    const question = clone(original), existing = data.questions.findIndex(item => item.id === question.id || (mode !== 'copy' && item.content === question.content && item.tags.join(',') === question.tags.join(',')))
    if (existing >= 0) {
      if (mode === 'replace' && !data.questions[existing]!.locked) { question.id = data.questions[existing]!.id; data.questions.splice(existing, 1, question); count++ }
      else if (mode === 'copy') { question.id = newId('question'); question.options.forEach((option, index) => { option.id = `${question.id}-${index}` }); data.questions.unshift(question); count++ }
      else skipped++
    } else { data.questions.unshift(question); count++ }
  }
  success(`本地导入 ${count} 道题，跳过 ${skipped} 道重复、锁定或无效题目。`)
  return count
}
function savePaper(input: WorkspacePaper): boolean {
  try {
    const paper = normalisePaper(input)
    if (paper.questionIds.some(id => !data.questions.some(question => question.id === id))) throw new Error('试卷中存在已删除题目，请重新选择。')
    if (data.papers.some(item => item.id !== paper.id && item.title === paper.title)) throw new Error('试卷名称已存在。')
    const index = data.papers.findIndex(item => item.id === paper.id); paper.updatedAt = isoNow()
    if (index >= 0) data.papers.splice(index, 1, paper); else data.papers.unshift(paper)
    success('试卷已保存到本地；已发布任务仍使用发布时的试卷快照。'); return true
  } catch (error) { return fail(error) }
}
function deletePaper(id: string): boolean {
  if (data.tasks.some(task => task.paperId === id && !task.snapshot)) return fail('有草稿任务引用此试卷，请先调整任务。')
  data.papers = data.papers.filter(paper => paper.id !== id)
  success('试卷已删除；已发布任务的快照和成绩仍保留。'); return true
}
function importPapers(text: string): boolean {
  try {
    const input = asObject(JSON.parse(text.replace(/^\uFEFF/, '')))
    if (!Array.isArray(input.papers)) throw new Error('试卷文件必须包含 papers 数组。')
    const questions = Array.isArray(input.questions) ? input.questions.map((question, index) => normaliseQuestion(question, index)) : []
    const papers = input.papers.map(normalisePaper)
    const ids = new Set([...data.questions.map(question => question.id), ...questions.map(question => question.id)])
    if (papers.some(paper => paper.questionIds.some(id => !ids.has(id)))) throw new Error('试卷引用的题目不完整。请导入包含题目快照的导出文件。')
    if (new Set(questions.map(question => question.id)).size !== questions.length || new Set(papers.map(paper => paper.id)).size !== papers.length) throw new Error('导入文件中题目或试卷编号重复。')
    // A referenced new ID must not be dropped just because its text already exists.
    for (const question of questions) if (!data.questions.some(item => item.id === question.id)) data.questions.unshift(clone(question))
    for (const paper of papers) {
      const index = data.papers.findIndex(item => item.id === paper.id)
      if (index >= 0) data.papers.splice(index, 1, paper); else data.papers.unshift(paper)
    }
    success(`已导入 ${papers.length} 套本地试卷。`); return true
  } catch (error) { return fail(error) }
}
function newTask(): WorkspaceTask {
  return { id: newId('task'), title: '', description: '', kind: 'theory', mode: 'exam', paperId: '', operationId: '', startAt: isoNow(), endAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 60,
    allStudents: true, participants: [], attachmentIds: [], scoreVisible: true, remark: '', publishedAt: null, createdAt: isoNow(), updatedAt: isoNow() }
}
function saveTask(input: WorkspaceTask): boolean {
  if (!input.title.trim() || !input.description.trim()) return fail('任务名称和描述不能为空。')
  if (data.tasks.some(task => task.id !== input.id && task.title === input.title.trim())) return fail('任务名称已存在。')
  if (Date.parse(input.endAt) <= Date.parse(input.startAt) || !Number.isFinite(Date.parse(input.endAt)) || !Number.isFinite(Date.parse(input.startAt))) return fail('截止时间必须晚于开始时间。')
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) return fail('任务时长应为 1～1440 分钟。')
  if (!input.allStudents && !input.participants.length) return fail('请选择至少一名参与人员，或选择全体人员。')
  if (input.kind === 'theory' && !data.papers.some(paper => paper.id === input.paperId && paper.questionIds.length)) return fail('请选择有效试卷。')
  if (input.kind === 'operation' && !operationItems.value.some(item => item.id === input.operationId)) return fail('请选择有效操作题。')
  const task = { ...clone(input), title: input.title.trim(), publishedAt: null, updatedAt: isoNow(), snapshot: undefined }
  const index = data.tasks.findIndex(item => item.id === task.id)
  if (index >= 0) data.tasks.splice(index, 1, task); else data.tasks.unshift(task)
  success('任务草稿已保存。点击“发布任务”后，所选学员才能在本浏览器查看。'); return true
}
function publishTask(id: string): boolean {
  const task = data.tasks.find(item => item.id === id)
  if (!task) return fail('任务不存在。')
  if (Date.parse(task.endAt) <= now.value) return fail('任务已过截止时间，请编辑时间后发布。')
  if (!task.allStudents && !task.participants.length) return fail('请先指派参与人员。')
  if (task.kind === 'theory') {
    const paper = data.papers.find(item => item.id === task.paperId)
    if (!paper) return fail('对应试卷已删除。')
    const questions = paper.questionIds.flatMap(questionId => { const question = data.questions.find(item => item.id === questionId); return question ? [clone(question)] : [] })
    if (!questions.length) return fail('试卷没有可用题目。')
    task.snapshot = { questions: paper.shuffle ? shuffled(questions) : questions, maxScore: paper.maxScore, passPercent: paper.passPercent }
  } else {
    const item = operationItems.value.find(item => item.id === task.operationId)
    if (!item) return fail('操作题已不存在。')
    task.snapshot = { flowId: item.flowId, ...(item.scene ? { scene: clone(item.scene) } : {}), maxScore: item.scene?.maxScore ?? 100, passPercent: item.scene?.passPercent ?? 60 }
  }
  task.publishedAt = isoNow(); task.updatedAt = isoNow()
  success(`任务“${task.title}”已发布到本浏览器（不会下发到远程客户端）。`); return true
}
function withdrawTask(id: string) {
  const task = data.tasks.find(item => item.id === id)
  if (task) { task.publishedAt = null; success('已撤回本地任务；正在作答的快照和历史成绩保留。') }
}
function deleteTask(id: string) {
  if (data.activeTheory?.taskId === id || data.activeOperation?.taskId === id || data.pendingLaunch?.taskId === id) return fail('此任务正在本地考核中，请先提交或结束。')
  data.tasks = data.tasks.filter(task => task.id !== id); success('本地任务已删除，历史成绩保留。'); return true
}
const taskKey = (taskId: string, studentId: string) => JSON.stringify([taskId, studentId])
function taskStatus(task: WorkspaceTask) { return !task.publishedAt ? '未发布' : now.value < Date.parse(task.startAt) ? '未开始' : now.value >= Date.parse(task.endAt) ? '已截止' : '进行中' }
function taskStudents(task: WorkspaceTask) { return task.allStudents ? data.students : data.students.filter(student => task.participants.includes(student.id)) }
function taskScores(task: WorkspaceTask) { return data.scores.filter(score => score.taskId === task.id) }
function taskCompletion(task: WorkspaceTask) { const students = taskStudents(task); return students.length ? round(new Set(taskScores(task).map(score => score.studentId)).size / students.length * 100) : 0 }
function canSeeTask(task: WorkspaceTask, studentId = currentStudent.value?.id) { return !!task.publishedAt && !!studentId && (task.allStudents || task.participants.includes(studentId)) }
function availableTask(task: WorkspaceTask, studentId: string): string {
  if (!canSeeTask(task, studentId)) return '当前本地身份未被指派此任务。'
  if (taskStatus(task) !== '进行中') return taskStatus(task) === '未开始' ? '任务尚未开始。' : '任务已截止或未发布。'
  if (task.mode === 'exam' && (data.submittedTaskKeys.includes(taskKey(task.id, studentId)) || data.scores.some(score => score.taskId === task.id && score.studentId === studentId))) return '该考评任务已经提交，不能重复考试。'
  return ''
}
function startTask(task: WorkspaceTask): boolean {
  now.value = Date.now()
  const student = resolveStudent('student'), error = availableTask(task, student.id)
  if (error) return fail(error)
  if (task.kind === 'theory') {
    const paper = data.papers.find(item => item.id === task.paperId), questions = task.snapshot?.questions ?? paper?.questionIds.flatMap(id => { const question = data.questions.find(item => item.id === id); return question ? [question] : [] }) ?? []
    return startTheory({ questions, title: task.title, mode: task.mode, returnPage: 'student', durationMinutes: task.durationMinutes, maxScore: task.snapshot?.maxScore ?? paper?.maxScore ?? 100, passPercent: task.snapshot?.passPercent ?? paper?.passPercent ?? 60, taskId: task.id, scoreVisible: task.scoreVisible, endAt: Date.parse(task.endAt) })
  }
  return requestOperation({ operationId: task.operationId, title: task.title, mode: task.mode, returnPage: 'student', durationMinutes: task.durationMinutes, taskId: task.id, scoreVisible: task.scoreVisible, scene: task.snapshot?.scene, maxScore: task.snapshot?.maxScore, passPercent: task.snapshot?.passPercent, flowId: task.snapshot?.flowId, taskDeadlineAt: Date.parse(task.endAt) })
}
function noActive(): boolean {
  if (data.activeTheory || data.activeOperation || data.pendingLaunch) return fail('已有未结束的练习 / 考核。请继续、提交或取消后再开始新的任务。')
  if (data.recording.active) return fail('请先停止操作题录制。')
  return true
}
interface TheoryOptions { questions: WorkspaceQuestion[]; title: string; mode: AssessmentMode; returnPage: ReturnPage; durationMinutes?: number; maxScore?: number; passPercent?: number; taskId?: string; scoreVisible?: boolean; endAt?: number }
function startTheory(options: TheoryOptions): boolean {
  if (!noActive()) return false
  if (!options.questions.length) return fail('当前没有可用题目。请调整来源或数量。')
  const student = resolveStudent(options.returnPage), startedAt = Date.now(), durationMinutes = options.durationMinutes ?? 60
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return fail('考试时长应为 1～1440 分钟。')
  const maxScore = options.maxScore ?? 100, passPercent = options.passPercent ?? 60
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000 || !Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) return fail('总分或通过比例无效。')
  if (options.endAt !== undefined && (!Number.isFinite(options.endAt) || options.endAt <= startedAt)) return fail('任务已经截止，不能开始答题。')
  if (new Set(options.questions.map(question => question.id)).size !== options.questions.length || options.questions.some(question => validateQuestion(question))) return fail('题目快照无效或编号重复，请重新选择。')
  const session: TheorySession = { id: newId('theory'), studentId: student.id, studentNo: student.studentNo, studentName: student.name, title: options.title, mode: options.mode,
    questions: clone(options.questions), answers: {}, revealed: [], currentIndex: 0, startedAt, deadlineAt: options.mode === 'exam' ? Math.min(startedAt + durationMinutes * 60000, options.endAt ?? Infinity) : options.endAt ?? null,
    durationMinutes, maxScore, passPercent, returnPage: options.returnPage, taskId: options.taskId ?? '', scoreVisible: options.scoreVisible !== false }
  data.activeTheory = session
  if (options.returnPage === 'student') data.studentTab = options.mode === 'exam' ? 'exam' : 'practice'; else data.examTab = 'answer'
  simulator.navigate(options.returnPage); success(`开始${options.mode === 'exam' ? '理论考评' : '理论练习'}：${options.title}（本地计时与评分）。`); return true
}
function selectAnswer(questionId: string, optionId: string) {
  const session = data.activeTheory, question = session?.questions.find(item => item.id === questionId)
  if (session?.deadlineAt && Date.now() >= session.deadlineAt) { submitTheory('timeout'); return }
  if (!session || !question || !question.options.some(option => option.id === optionId) || (session.mode === 'practice' && session.revealed.includes(questionId))) return
  const selected = session.answers[questionId] || []
  session.answers[questionId] = question.type === '多选题' ? selected.includes(optionId) ? selected.filter(id => id !== optionId) : [...selected, optionId] : [optionId]
}
function revealAnswer(questionId: string) {
  const session = data.activeTheory
  if (session?.mode === 'practice' && session.questions.some(question => question.id === questionId) && !session.revealed.includes(questionId)) { session.revealed.push(questionId); persist() }
}
function toggleFavourite(questionId: string, studentId = currentStudent.value?.id) {
  if (!studentId) return
  const favourites = data.favourites[studentId] ?? []
  data.favourites[studentId] = favourites.includes(questionId) ? favourites.filter(id => id !== questionId) : [...favourites, questionId]
}
function finishScore(score: WorkspaceScore, returnPage: ReturnPage) {
  data.scores.unshift(score); data.lastScoreId = score.id
  if (useInternalTest().state.enabled) void useInternalTest().save(score)
  if (score.taskId && score.mode === 'exam') { const key = taskKey(score.taskId, score.studentId); if (!data.submittedTaskKeys.includes(key)) data.submittedTaskKeys.push(key) }
  if (returnPage === 'student') data.studentTab = 'history'; else data.examTab = 'result'
  persist(); simulator.record(`本地${score.category}交卷：${score.title}，${score.scoreVisible ? `实际得分 ${score.score}/${score.maxScore}` : '已提交，成绩暂不可见'}`)
  simulator.notify(score.scoreVisible ? `已保存本地成绩：${score.score} / ${score.maxScore} 分。` : '已提交本地考核，教师设置为暂不向学员显示成绩。', 'success')
  simulator.navigate(returnPage)
}
function submitTheory(reason: 'manual' | 'timeout' = 'manual'): WorkspaceScore | null {
  const session = data.activeTheory
  if (!session) return null
  if (session.deadlineAt && Math.max(Date.now(), now.value) >= session.deadlineAt) reason = 'timeout'
  const score = makeScore(session, 'theory', theoryDetails(session), reason, reason === 'timeout' ? session.deadlineAt ?? Date.now() : Date.now())
  data.activeTheory = null; finishScore(score, session.returnPage); return score
}
interface OperationOptions { operationId: string; title?: string; mode?: AssessmentMode; returnPage?: ReturnPage; durationMinutes?: number; taskId?: string; scoreVisible?: boolean; scene?: SceneDefinition; maxScore?: number; passPercent?: number; flowId?: string; taskDeadlineAt?: number }
function requestOperation(options: OperationOptions): boolean {
  if (!noActive()) return false
  const item = operationItems.value.find(item => item.id === options.operationId), scene = options.scene ?? item?.scene ?? undefined, flow = workflows.find(flow => flow.id === (options.flowId ?? scene?.flowId ?? item?.flowId ?? options.operationId))
  if (!flow) return fail('未找到此操作题对应的工艺流程。')
  if (scene) { const error = validateScene(scene); if (error) return fail(error) }
  const returnPage = options.returnPage ?? 'student', student = resolveStudent(returnPage), durationMinutes = options.durationMinutes ?? scene?.durationMinutes ?? 20
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return fail('操作考核时长应为 1～1440 分钟。')
  const maxScore = options.maxScore ?? scene?.maxScore ?? 100, passPercent = options.passPercent ?? scene?.passPercent ?? 60
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000 || !Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) return fail('操作总分或通过比例无效。')
  if (options.taskDeadlineAt !== undefined && (!Number.isFinite(options.taskDeadlineAt) || options.taskDeadlineAt <= Date.now())) return fail('任务已经截止，不能开始操作。')
  const launch: OperationLaunch = { id: newId('operation'), operationId: options.operationId, flowId: flow.id, title: options.title ?? item?.name ?? flow.name, mode: options.mode ?? 'practice', returnPage,
    durationMinutes, maxScore, passPercent, taskId: options.taskId ?? '', scoreVisible: options.scoreVisible !== false, ...(options.taskDeadlineAt !== undefined ? { taskDeadlineAt: options.taskDeadlineAt } : {}),
    studentId: student.id, studentNo: student.studentNo, studentName: student.name, ...(scene ? { scene: clone(scene) } : {}) }
  data.pendingLaunch = launch
  if (safetyGateEnabled && (flow.requiresSafety || scene?.requiresSafety) && !simulator.state.safetyComplete) {
    simulator.state.workspaces.pendingFlowId = flow.id; simulator.notify('请先完成加注作业前安全检查。检查通过后点击“继续训练”，计时届时才开始。', 'warning'); simulator.navigate('safety'); persist(); return false
  }
  return resumePendingOperation()
}
function applySceneWorkload(scene?: SceneDefinition) {
  if (!scene?.workload) return
  const workload = normaliseWorkload(scene.workload)
  for (const [id, patch] of Object.entries(workload.devices)) simulator.setDevice(id, patch, false)
  simulator.record(`场景初始化工况：${scene.workloadName || workload.name}`)
}
function activateOperation(launch: OperationLaunch) {
  const flow = workflows.find(flow => flow.id === launch.flowId)
  if (!flow) return
  const existing = data.activeOperation?.id === launch.id ? data.activeOperation : null
  if (existing) {
    existing.runReady = true; existing.observedStepIndex = 0; existing.lastLogId = simulator.state.logs[0]?.id || ''
    existing.flowAssessmentReadyAfter = existing.recordedOps.length + 1
    data.pendingLaunch = null; simulator.state.workspaces.pendingFlowId = ''
    applySceneWorkload(existing.scene)
    if (existing.scene) {
      // Restore deterministic scene actions without re-awarding past score events.
      const actions = existing.scene.states.flatMap(state => state.groups.flatMap(group => group.events)).filter(event => existing.runtimeEvents[event.id] !== undefined && ['load', 'device'].includes(event.action.kind)).sort((a, b) => existing.runtimeEvents[a.id]! - existing.runtimeEvents[b.id]!)
      for (const event of actions) performSceneAction(event.action, existing)
      simulator.navigate(existing.scene.page)
    }
    persist(); return
  }
  const startedAt = Date.now(), totalWeight = flow.steps.reduce((sum, step) => sum + (step.rules.reduce((weight, rule) => weight + Math.max(0, rule.weight ?? 1), 0) || 1), 0) || 1
  const task = data.tasks.find(task => task.id === launch.taskId)
  const taskDeadlineAt = launch.taskDeadlineAt ?? (task ? Date.parse(task.endAt) : undefined)
  const session: OperationSession = { ...clone(launch), startedAt, deadlineAt: launch.mode === 'exam' ? Math.min(startedAt + launch.durationMinutes * 60000, taskDeadlineAt ?? Infinity) : taskDeadlineAt ?? null,
    steps: flow.steps.map((step, index) => ({ id: `${launch.id}-step-${index}`, name: step.name, description: step.description, deviceId: step.deviceId || '', rules: clone(step.rules), maxScore: launch.maxScore * (step.rules.reduce((sum, rule) => sum + Math.max(0, rule.weight ?? 1), 0) || 1) / totalWeight })),
    completedSteps: [], observedStepIndex: 0, recordedOps: [], lastLogId: simulator.state.logs[0]?.id || '', runtimeEvents: {}, activeStateIds: launch.scene?.mode === 'state' ? [launch.scene.states.find(state => state.kind === 'initial')!.id, ...launch.scene.initialActiveStates] : [],
    stoppedStateIds: [], disabledStateIds: [], finished: false, autoDemoDetected: false, runReady: true }
  if (!launch.scene && flow.assessment) session.flowAssessment = createFlowAssessment(flow.assessment, launch.maxScore)
  data.activeOperation = session; data.pendingLaunch = null; simulator.state.workspaces.pendingFlowId = ''
  if (launch.returnPage === 'student' && platformStudentId() === launch.studentId) ilab.beginOperation(session.id, session.startedAt)
  if (launch.returnPage === 'student') data.studentTab = 'operation'; else data.examTab = 'operation'
  try { applySceneWorkload(launch.scene) } catch (error) { fail(error) }
  if (launch.scene) simulator.navigate(launch.scene.page)
  success(`已开始${launch.mode === 'exam' ? '操作考评' : '操作练习'}：${launch.title}，请在工艺画面手动操作。`)
}
function resumePendingOperation(): boolean {
  const launch = data.pendingLaunch
  if (!launch) return false
  now.value = Date.now()
  if (data.activeOperation?.id === launch.id) {
    if (data.activeOperation.deadlineAt && now.value >= data.activeOperation.deadlineAt) { submitOperation('timeout'); return false }
  } else if (launch.taskId) {
    const task = data.tasks.find(task => task.id === launch.taskId)
    const error = task ? availableTask(task, launch.studentId) : '原任务已经不存在。'
    if (error || (launch.taskDeadlineAt !== undefined && now.value >= launch.taskDeadlineAt)) return fail(error || '任务已截止，不能开始操作。')
  }
  const flow = workflows.find(flow => flow.id === launch.flowId)
  if (safetyGateEnabled && (flow?.requiresSafety || launch.scene?.requiresSafety) && !simulator.state.safetyComplete) { simulator.navigate('safety'); simulator.notify('安全检查尚未通过，不能开始此操作。', 'warning'); return false }
  if (!simulator.startFlow(launch.flowId, false)) return false
  // The flow watcher may already activate a pending launch during startFlow.
  if (data.pendingLaunch?.id === launch.id) activateOperation(launch)
  return true
}
watch(() => [simulator.state.flowId, simulator.state.flowRunning, simulator.state.autoDemo], () => {
  const launch = data.pendingLaunch
  if (!launch || simulator.state.flowId !== launch.flowId || !simulator.state.flowRunning || simulator.state.autoDemo) return
  if (safetyGateEnabled && launch.scene?.requiresSafety && !simulator.state.safetyComplete) { simulator.stopFlow(); simulator.notify('此场景要求先完成安全检查。', 'warning'); return }
  activateOperation(launch)
})
function resumeOperation(): boolean {
  const session = data.activeOperation
  if (!session) return false
  if (session.deadlineAt && Date.now() >= session.deadlineAt) { submitOperation('timeout'); return false }
  if (session.runReady && simulator.state.flowId === session.flowId) { simulator.navigate(session.scene?.page || workflows.find(flow => flow.id === session.flowId)?.page || 'overview'); return true }
  simulator.notify('工艺画面将重新载入初始流程；已记录得分点保留，真实考核计时不会重置。', 'info')
  data.pendingLaunch = clone(session); simulator.state.workspaces.pendingFlowId = session.flowId
  return resumePendingOperation()
}
function performSceneAction(action: SceneDefinition['states'][number]['groups'][number]['events'][number]['action'], session: OperationSession) {
  const id = action.stateId
  if (action.kind === 'activate' && !session.disabledStateIds.includes(id)) { if (!session.activeStateIds.includes(id)) session.activeStateIds.push(id); session.stoppedStateIds = session.stoppedStateIds.filter(value => value !== id) }
  if (action.kind === 'stop' || action.kind === 'disable') { session.activeStateIds = session.activeStateIds.filter(value => value !== id); if (!session.stoppedStateIds.includes(id)) session.stoppedStateIds.push(id); if (action.kind === 'disable' && !session.disabledStateIds.includes(id)) session.disabledStateIds.push(id) }
  if (action.kind === 'load' && action.workload) { for (const [deviceId, patch] of Object.entries(normaliseWorkload(action.workload).devices)) simulator.setDevice(deviceId, patch, false); simulator.record(`场景动作：加载工况 ${action.workloadName}`) }
  if (action.kind === 'device') { simulator.setDevice(action.deviceId, { [action.property]: action.property === 'value' ? action.value : action.boolValue }, false); simulator.record(`场景动作：设备设置 ${action.deviceId}`, action.deviceId) }
  if (action.kind === 'notify') simulator.notify(`场景提示：${action.message}`)
}
function observeOperation() {
  const session = data.activeOperation
  if (!session || session.finished || observing || !session.runReady || (session.deadlineAt !== null && Math.max(Date.now(), now.value) >= session.deadlineAt)) return
  observing = true
  try {
    if (simulator.state.flowId !== session.flowId) return
    if (simulator.state.autoDemo) { session.autoDemoDetected = true; session.observedStepIndex = simulator.state.stepIndex; return }
    if (!session.scene) {
      if (session.flowAssessment && session.recordedOps.length >= (session.flowAssessmentReadyAfter ?? 1)) {
        const frameAt = Math.max(now.value, Date.now())
        if (session.lastFlowAssessmentAt !== frameAt) {
          session.lastFlowAssessmentAt = frameAt
          const result = feedFlowAssessment(session.flowAssessment, simulator.state.devices, frameAt)
          session.flowAssessment = result.runtime
          if (result.advanced) simulator.record(`原 WPF 阶段结算：${result.runtime.definition.stages[result.runtime.nextStageIndex - 1]?.name}`)
          if (result.completed) { session.finished = true; simulator.stopFlow(); simulator.notify('原操作题评分阶段已全部结算，请返回工作台交卷保存实际成绩。', 'success'); return }
        }
      }
      const next = Math.min(simulator.state.stepIndex, session.steps.length)
      if (next > session.observedStepIndex) for (let index = session.observedStepIndex; index < next; index++) {
        const step = session.steps[index]
        if (step && !session.completedSteps.includes(step.id)) session.completedSteps.push(step.id)
      }
      session.observedStepIndex = next
      if (!session.flowAssessment && next >= session.steps.length && !session.finished) { session.finished = true; simulator.notify('操作流程已完成，请返回工作台交卷保存实际成绩。', 'success') }
      return
    }
    if (session.scene.mode === 'sequence') return
    const context = () => ({ devices: simulator.state.devices, elapsedSeconds: (now.value - session.startedAt) / 1000, recordedOps: session.recordedOps, activeStateIds: session.activeStateIds, stoppedStateIds: session.stoppedStateIds, disabledStateIds: session.disabledStateIds })
    const initialState = session.scene.states.find(state => state.kind === 'initial')
    if (initialState && !initialState.conditions.every(condition => evaluateCondition(condition, context()))) return
    let budget = 50, changed = true
    while (changed && budget-- > 0) {
      changed = false
      for (const state of session.scene.states) {
        if (!session.activeStateIds.includes(state.id) || !state.conditions.every(condition => evaluateCondition(condition, context()))) continue
        for (const group of state.groups) for (const event of group.events) {
          if (session.runtimeEvents[event.id] !== undefined || !evaluateCondition(event.condition, context())) continue
          session.runtimeEvents[event.id] = Date.now(); changed = true
          performSceneAction(event.action, session); simulator.record(`本地场景事件：${state.name} / ${event.name || group.name}`)
        }
      }
    }
    const final = session.scene.states.find(state => state.kind === 'final')
    if (final && session.activeStateIds.includes(final.id) && final.conditions.every(condition => evaluateCondition(condition, context())) && !session.finished) { session.finished = true; simulator.stopFlow(); simulator.notify('已满足场景终止条件，请返回工作台交卷。', 'success') }
  } catch (error) { fail(error) }
  finally { observing = false }
}
watch(() => [simulator.state.stepIndex, simulator.state.flowId, simulator.state.autoDemo], observeOperation)
watch(() => simulator.state.devices, observeOperation, { deep: true })
function consumeLogs() {
  if (processingLogs) return
  processingLogs = true
  try {
    const logs = simulator.state.logs, sessions = [data.activeOperation, data.recording.active ? data.recording : null].filter(Boolean)
    for (const holder of sessions) {
      if (!holder) continue
      const position = logs.findIndex(log => log.id === holder.lastLogId), newLogs = logs.slice(0, position >= 0 ? position : logs.length).reverse()
      for (const log of newLogs) {
        if (!log.deviceId) continue
        const device = simulator.state.devices[log.deviceId]
        if (!device) continue
        const changes: Partial<Record<DeviceProperty, number | boolean>> = { ...log.changes }
        if (!log.changes && /^设置\s/.test(log.action)) {
          const value = log.action.match(/value=([-\d.eE+]+)/), working = log.action.match(/working=(true|false)/)
          if (value) changes.value = Number(value[1])
          if (working) changes.working = working[1] === 'true'
        }
        if (!Object.keys(changes).length) continue
        const motor = ['pump', 'fan', 'engine', 'heater'].includes(device.kind)
        const opened = motor ? typeof changes.working === 'boolean' ? changes.working : device.working : typeof changes.value === 'number' ? changes.value >= 0.1 : device.value >= 0.1
        const operation = opened ? '打开' as const : '关闭' as const
        const sequenceEligible = /^设置\s/.test(log.action) && ['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind) && (changes.value !== undefined || changes.working !== undefined)
        if ('recordedOps' in holder) {
          const at = log.at ?? Date.now()
          if (holder.runReady && !holder.finished && !simulator.state.autoDemo && at >= holder.startedAt && (holder.deadlineAt === null || at <= holder.deadlineAt) && holder.recordedOps.length < 3000) holder.recordedOps.push({ deviceId: device.id, operation, at, logId: log.id, changes, sequenceEligible })
        } else if (sequenceEligible && data.editorDraft && data.editorDraft.legacyOps.length < 500) {
          data.editorDraft.legacyOps.push({ id: newId('op'), index: holder.nextIndex, weight: 2, deviceId: device.id, operation })
          if (holder.autoIncrement) holder.nextIndex++
        }
      }
      holder.lastLogId = logs[0]?.id || ''
    }
    observeOperation()
  } finally { processingLogs = false }
}
watch(() => simulator.state.logs[0]?.id, consumeLogs)
function submitOperation(reason: 'manual' | 'timeout' = 'manual'): WorkspaceScore | null {
  const session = data.activeOperation
  if (!session) return null
  consumeLogs(); observeOperation()
  if (session.deadlineAt && Math.max(Date.now(), now.value) >= session.deadlineAt) reason = 'timeout'
  const score = makeScore(session, 'operation', operationDetails(session), reason, reason === 'timeout' ? session.deadlineAt ?? Date.now() : Date.now())
  if (session.autoDemoDetected) score.notes += ' 检测到自动演示，自动推进的步骤不计入手动考核。'
  if (session.flowAssessment) score.notes += `\n原 WPF 阶段判分：${session.flowAssessment.definition.source}\n${session.flowAssessment.notes.join('\n')}`
  // Freeze the real operation evidence before the existing local session is cleared.
  ilab.submitOperation(session, score)
  data.activeOperation = null; data.pendingLaunch = null; simulator.state.workspaces.pendingFlowId = ''; simulator.stopFlow(); finishScore(score, session.returnPage); return score
}
function cancelAssessment() {
  if (data.activeOperation) simulator.stopFlow()
  data.activeTheory = null; data.activeOperation = null; data.pendingLaunch = null; simulator.state.workspaces.pendingFlowId = ''
  success('已结束本地练习 / 考核，未提交的本次答案不生成成绩。')
}
function returnToAssessment() {
  const session = data.activeTheory ?? data.activeOperation ?? data.pendingLaunch
  if (!session) { if (data.recording.active) simulator.navigate('editor'); return }
  if (session.returnPage === 'student') data.studentTab = data.activeTheory ? data.activeTheory.mode === 'exam' ? 'exam' : 'practice' : 'operation'
  else data.examTab = data.activeTheory ? 'answer' : 'operation'
  simulator.navigate(session.returnPage)
}
watch(() => [data.activeTheory?.id, data.activeOperation?.id, data.pendingLaunch?.id, data.recording.active], () => {
  const session = data.activeTheory ?? data.activeOperation ?? data.pendingLaunch
  simulator.state.workspaces.activeAssessment = session ? { id: session.id, title: session.title, returnPage: session.returnPage, kind: data.activeTheory ? 'theory' : 'operation', pending: !!data.pendingLaunch && !data.activeOperation, mode: session.mode, ...('flowId' in session ? { flowId: session.flowId, customScene: !!session.scene } : {}) } : data.recording.active && data.editorDraft ? { id: `recording-${data.editorDraft.id}`, title: '操作题录制', returnPage: 'editor', kind: 'recording' } : null
  if (data.pendingLaunch) simulator.state.workspaces.pendingFlowId = data.pendingLaunch.flowId
  else if (!data.activeOperation) simulator.state.workspaces.pendingFlowId = ''
}, { immediate: true, flush: 'sync' })
function tickAssessments(at = Date.now()) {
  now.value = at
  // Deadlines take precedence over late device changes and scene timers.
  if (data.activeTheory?.deadlineAt && at >= data.activeTheory.deadlineAt) submitTheory('timeout')
  if (data.activeOperation?.deadlineAt && at >= data.activeOperation.deadlineAt) submitOperation('timeout')
  consumeLogs(); observeOperation()
}
function startClock() {
  if (timer || typeof window === 'undefined') return
  timer = setInterval(() => tickAssessments(), 1000)
}
function saveScene(input: SceneDefinition): boolean {
  const error = validateScene(input)
  if (error) return fail(error)
  const scene = clone(input); scene.updatedAt = isoNow()
  const index = data.scenes.findIndex(item => item.id === scene.id)
  if (index >= 0) data.scenes.splice(index, 1, scene); else data.scenes.unshift(scene)
  data.editorDraft = clone(scene); success('操作题已保存到本地场景库，可组建任务、训练或导出 JSON。'); return true
}
function editScene(id?: string) {
  if (data.recording.active) return fail('请先停止录制，再切换场景草稿。')
  try {
    data.editorDraft = id?.startsWith('scene:') ? clone(data.scenes.find(scene => scene.id === id.slice(6))!) : id ? sceneFromWorkflow(id) : emptyScene()
    if (!data.editorDraft) return fail('场景不存在。')
    data.editorSelectedState = data.editorDraft.states[0]?.id || ''; simulator.navigate('editor'); return true
  } catch (error) { return fail(error) }
}
function deleteScene(id: string) {
  if (data.tasks.some(task => task.operationId === `scene:${id}` && !task.snapshot)) return fail('有草稿任务引用此场景，请先调整任务。')
  data.scenes = data.scenes.filter(scene => scene.id !== id); success('本地操作题已删除，已发布快照和历史成绩保留。'); return true
}
function importScene(text: string): boolean {
  if (data.recording.active) return fail('请先停止录制，再导入场景。')
  try {
    const raw: unknown = JSON.parse(text.replace(/^\uFEFF/, '')), object = asObject(raw), scene = normaliseScene(object.scene ?? object)
    if (!saveScene(scene)) return false
    data.editorDraft = clone(scene); data.editorSelectedState = scene.states[0]?.id || ''; return true
  } catch (error) { return fail(error) }
}
function toggleRecording() {
  if (!data.recording.active && (active.value || data.pendingLaunch)) return fail('请先结束当前考核，再进行操作录制。')
  if (!data.editorDraft) return fail('请先创建操作题。')
  if (data.recording.active) consumeLogs()
  else { simulator.stopFlow(); simulator.state.autoDemo = false }
  data.editorDraft.mode = 'sequence'; data.recording.active = !data.recording.active; data.recording.lastLogId = simulator.state.logs[0]?.id || ''
  success(data.recording.active ? '开始录制本浏览器内的手动设备操作；自动流程和场景动作不会录入。' : '操作录制已停止，录制内容保留在本地草稿。'); return true
}
async function addFiles(files: File[]): Promise<number> {
  let count = 0
  for (const original of files) {
    if (original.size > 50 * 1024 * 1024) { fail(`${original.name} 超过单文件 50 MB 本地限制。`); continue }
    const id = newId('file'), stored = await storeFile(id, original)
    data.files.unshift({ id, name: original.name, type: original.type || 'application/octet-stream', size: original.size, addedAt: isoNow(), publishedAt: null, allStudents: true, participants: [], origin: 'uploaded', storage: stored })
    if (stored === 'memory') simulator.notify(`${original.name} 未能保存到浏览器文件库；本会话仍可下载，刷新后请重新添加。`, 'warning')
    count++
  }
  success(`已添加 ${count} 个用户文件；发布前仅在本地教师文件列表可见。`); return count
}
function publishFile(input: WorkspaceFile) {
  if (!input.name.trim()) return fail('文件名不能为空。')
  if (!input.allStudents && !input.participants.length) return fail('请选择文件接收人员。')
  const index = data.files.findIndex(file => file.id === input.id)
  if (index < 0) return false
  data.files.splice(index, 1, { ...clone(input), publishedAt: isoNow() }); success('文件已发布到本地学员资料列表，没有生成远程下载链接。'); return true
}
function canReadFile(file: WorkspaceFile, studentId = currentStudent.value?.id) { return !!studentId && ((!!file.publishedAt && (file.allStudents || file.participants.includes(studentId))) || data.tasks.some(task => canSeeTask(task, studentId) && task.attachmentIds.includes(file.id))) }
async function downloadFile(file: WorkspaceFile) {
  try { const blob = await getFile(file); downloadBlob(file.name, blob); simulator.record(`下载本地文件：${file.name}`); return true } catch (error) { return fail(error) }
}
async function removeFile(id: string) {
  await removeStoredFile(id); data.files = data.files.filter(file => file.id !== id); data.tasks.forEach(task => { task.attachmentIds = task.attachmentIds.filter(value => value !== id) }); success('文件已从本地管理列表移除；不会删除用户原始文件。')
}
function exportScores(scores: WorkspaceScore[], filename = '本地成绩.csv') {
  const teacher = simulator.state.page === 'teacher'
  downloadText(filename, makeCsv([['学号', '姓名', '名称', '类别', '最终得分', '总分', '正确率(%)', '用时(秒)', '提交时间', '结果', '说明'], ...scores.map(score => [score.studentNo, score.studentName, score.title, score.category, teacher || score.scoreVisible ? score.score : '暂不可见', score.maxScore, teacher || score.scoreVisible ? score.accuracy : '', score.durationSeconds, score.submittedAt, teacher || score.scoreVisible ? score.passed ? '通过' : '未通过' : '暂不可见', '本地演示成绩'])]), 'text/csv;charset=utf-8')
}
function removeScores(ids: string[]) { data.scores = data.scores.filter(score => !ids.includes(score.id)); if (ids.includes(data.lastScoreId)) data.lastScoreId = ''; success('选中的本地历史记录已删除；已提交考评任务的重考限制仍保留。') }
function exportWorkspace() { simulator.downloadJson(`本地工作台备份-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: WORKSPACE_SCHEMA, savedAt: isoNow(), data: clone(data), note: '此备份包含业务数据和文件元数据；上传的原文件内容需在文件管理中另外下载保存。' }) }
function importWorkspace(text: string): boolean {
  if (active.value || data.pendingLaunch || data.recording.active) return fail('导入备份前请先结束考核或录制。')
  try {
    const result = decodeWorkspace(JSON.parse(text.replace(/^\uFEFF/, '')), seedState())
    if (result.warnings.length) throw new Error(`备份含 ${result.warnings.length} 条损坏记录，未导入：${result.warnings[0]}`)
    result.state.activeTheory = null; result.state.activeOperation = null; result.state.pendingLaunch = null
    Object.assign(data, result.state); success('业务备份已导入本浏览器；上传文件仅恢复元数据，内容需要原本地文件库或重新添加。'); return true
  } catch (error) { return fail(error) }
}
function exportRecovery() { if (storage.recoveryData) downloadText('工作台损坏数据原始备份.json', storage.recoveryData, 'application/json;charset=utf-8') }
function operationProgress(session = data.activeOperation) { if (!session) return 0; const details = operationDetails(session); return round(Math.max(0, details.reduce((sum, detail) => sum + detail.score, 0)) / session.maxScore * 100) }

export function useWorkspace() {
  startClock()
  return { data, state: data, storage, now, currentStudent, offlineStudent, tags, active, myScores, operationItems, persist, resolveStudent, returnToAssessment, tickAssessments,
    saveStudent, removeStudent, setOfflineIdentity, saveQuestion, deleteQuestions, importQuestions, savePaper, deletePaper, importPapers,
    newTask, saveTask, publishTask, withdrawTask, deleteTask, taskStatus, taskStudents, taskScores, taskCompletion, canSeeTask, availableTask, startTask,
    startTheory, selectAnswer, revealAnswer, toggleFavourite, submitTheory, requestOperation, resumePendingOperation, resumeOperation, submitOperation, cancelAssessment, operationProgress,
    saveScene, editScene, deleteScene, importScene, toggleRecording, addFiles, publishFile, canReadFile, downloadFile, getFile, removeFile,
    exportScores, removeScores, exportWorkspace, importWorkspace, exportRecovery, clone, newId, matches, safeName, sceneFromWorkflow }
}
