<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkspaceTask } from '../../data/workspace'
import { workflows } from '../../data/catalog'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { formatBytes, formatDate, formatDuration, matches, round, usePagination } from './lib/domain'
import WorkspaceFrame from './WorkspaceFrame.vue'
import WorkspacePager from './WorkspacePager.vue'
import ActiveAssessmentBanner from './ActiveAssessmentBanner.vue'
import TrainingCatalog from './TrainingCatalog.vue'
import FileManager from './FileManager.vue'
import ScoreDetailModal from './ScoreDetailModal.vue'
import TheorySetup from './TheorySetup.vue'
import TheoryAnswerPane from './TheoryAnswerPane.vue'
import OperationSessionPanel from './OperationSessionPanel.vue'
import LearnerScoreHistory from './LearnerScoreHistory.vue'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'

const workspace = useWorkspace(), simulator = useSimulator()
// The displayed identity must be the same one startTask/startTheory will resolve.
workspace.resolveStudent('student')
const student = workspace.currentStudent
const tabs = [
  { id: 'home', name: '学生首页', icon: 'House' }, { id: 'tasks', name: '已发布任务', icon: 'ClipboardList' },
  { id: 'practice', name: '理论练习', icon: 'BookOpen' }, { id: 'exam', name: '考试答题', icon: 'FilePenLine' },
  { id: 'operation', name: '操作练习', icon: 'Workflow' }, { id: 'files', name: '学习资料', icon: 'FolderOpen' },
  { id: 'history', name: '历史 / 成绩单', icon: 'History' },
]
const theory = computed(() => workspace.data.activeTheory?.returnPage === 'student' && workspace.data.activeTheory.studentId === student.value?.id ? workspace.data.activeTheory : null)
const operation = computed(() => workspace.data.activeOperation?.returnPage === 'student' && workspace.data.activeOperation.studentId === student.value?.id ? workspace.data.activeOperation : null)
const pending = computed(() => workspace.data.pendingLaunch?.returnPage === 'student' && workspace.data.pendingLaunch.studentId === student.value?.id ? workspace.data.pendingLaunch : null)
const busy = computed(() => !!(workspace.data.activeTheory || workspace.data.activeOperation || workspace.data.pendingLaunch || workspace.data.recording.active))
const panelIsActive = computed(() => theory.value ? workspace.data.studentTab === (theory.value.mode === 'exam' ? 'exam' : 'practice') : !!(operation.value || pending.value) && workspace.data.studentTab === 'operation')
if (!tabs.some(tab => tab.id === workspace.data.studentTab)) workspace.data.studentTab = theory.value ? theory.value.mode === 'exam' ? 'exam' : 'practice' : operation.value || pending.value ? 'operation' : 'home'
const tasks = computed(() => workspace.data.tasks.filter(task => workspace.canSeeTask(task, student.value?.id)).sort((a, b) => Date.parse(b.publishedAt || b.createdAt) - Date.parse(a.publishedAt || a.createdAt)))
const myScores = computed(() => workspace.data.scores.filter(score => score.studentId === student.value?.id).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)))
const visibleScores = computed(() => myScores.value.filter(score => score.scoreVisible))
const average = computed(() => visibleScores.value.length ? round(visibleScores.value.reduce((sum, score) => sum + score.score / score.maxScore * 100, 0) / visibleScores.value.length) : null)
const restrictedQuestionIds = computed(() => new Set([
  ...myScores.value.filter(score => !score.scoreVisible).flatMap(score => score.details.filter(detail => detail.kind === 'question').map(detail => detail.question?.id || detail.id)),
  ...(theory.value && !theory.value.scoreVisible ? theory.value.questions.map(question => question.id) : []),
]))
const favouriteCount = computed(() => {
  const available = new Set([...workspace.data.questions.map(question => question.id), ...visibleScores.value.flatMap(score => score.details.flatMap(detail => detail.question ? [detail.question.id] : []))])
  return (workspace.data.favourites[student.value?.id || ''] || []).filter(id => available.has(id) && !restrictedQuestionIds.value.has(id)).length
})
const readyTasks = computed(() => tasks.value.filter(task => !workspace.availableTask(task, student.value?.id || '')))
const completedTasks = computed(() => new Set([
  ...myScores.value.filter(score => score.taskId).map(score => score.taskId),
  ...tasks.value.filter(task => workspace.data.submittedTaskKeys.includes(JSON.stringify([task.id, student.value?.id]))).map(task => task.id),
]))
const taskQuery = ref(''), taskKind = ref(''), taskMode = ref(''), taskFilter = ref('')
const pickedTaskId = ref(''), agreed = ref(false), detailScoreId = ref('')
const practiceSource = ref<'bank' | 'paper' | 'wrong' | 'favourites'>('bank')
const historyKind = ref<'' | 'theory' | 'operation'>('')
function taskState(task: WorkspaceTask) {
  if (theory.value?.taskId === task.id) return '作答中'
  if (operation.value?.taskId === task.id) return '操作中'
  if (pending.value?.taskId === task.id) return '待开始操作'
  if (completedTasks.value.has(task.id)) return '已提交'
  const state = workspace.taskStatus(task)
  return state === '进行中' ? '待完成' : state
}
function taskBadge(task: WorkspaceTask) {
  const state = taskState(task)
  return state === '已提交' ? 'badge-success' : ['作答中', '操作中', '待开始操作'].includes(state) ? 'badge-warning' : state === '已截止' || state === '未开始' ? 'badge-muted' : ''
}
const filteredTasks = computed(() => tasks.value.filter(task => (!taskKind.value || task.kind === taskKind.value) && (!taskMode.value || task.mode === taskMode.value) && (!taskFilter.value || taskState(task) === taskFilter.value) && matches(`${task.title} ${task.description} ${task.remark}`, taskQuery.value)))
const { page, pageSize, rows: taskRows } = usePagination(filteredTasks, 9)
const pickedTask = computed(() => tasks.value.find(task => task.id === pickedTaskId.value))
const taskRecord = computed(() => myScores.value.find(score => score.taskId === pickedTask.value?.id))
const pickedIsActive = computed(() => !!pickedTask.value && [theory.value?.taskId, operation.value?.taskId, pending.value?.taskId].includes(pickedTask.value.id))
const taskError = computed(() => pickedTask.value ? workspace.availableTask(pickedTask.value, student.value?.id || '') : '')
const taskPaper = computed(() => workspace.data.papers.find(paper => paper.id === pickedTask.value?.paperId))
const taskOperation = computed(() => workspace.operationItems.value.find(item => item.id === pickedTask.value?.operationId))
const taskFlow = computed(() => workflows.find(flow => flow.id === (pickedTask.value?.snapshot?.flowId || taskOperation.value?.flowId || pickedTask.value?.operationId)))
const attachments = computed(() => pickedTask.value?.attachmentIds.flatMap(id => {
  const file = workspace.data.files.find(item => item.id === id)
  return file && workspace.canReadFile(file, student.value?.id) ? [file] : []
}) || [])
const detailScore = computed(() => myScores.value.find(score => score.id === detailScoreId.value))
watch([taskQuery, taskKind, taskMode, taskFilter], () => { page.value = 1 })
watch(() => tasks.value.map(task => task.id), ids => { if (!ids.includes(pickedTaskId.value)) pickedTaskId.value = '' })
function tab(id: string) { workspace.data.studentTab = id; workspace.persist() }
function practice(source: 'bank' | 'paper' | 'wrong' | 'favourites' = 'bank') { practiceSource.value = source; tab('practice') }
function history(kind: '' | 'theory' | 'operation' = '') { historyKind.value = kind; tab('history') }
function pickTask(task: WorkspaceTask) { agreed.value = false; pickedTaskId.value = task.id }
function startTask() {
  const task = pickedTask.value
  if (!task) return
  if (pickedIsActive.value) {
    tab(theory.value?.taskId === task.id ? theory.value.mode === 'exam' ? 'exam' : 'practice' : 'operation')
    pickedTaskId.value = ''
    return
  }
  if (!agreed.value || busy.value || taskError.value) return
  const started = workspace.startTask(task)
  if (started || workspace.data.pendingLaunch?.taskId === task.id) {
    if (task.kind === 'operation') tab('operation')
    pickedTaskId.value = ''
  }
}
function openStandalone() { workspace.data.examTab = 'menu'; workspace.persist(); simulator.navigate('exam') }
function refreshTasks() { simulator.notify('已更新本浏览器已发布任务列表；没有连接教师服务器或请求远程任务。') }
</script>

<template>
  <WorkspaceFrame title="学生主页" subtitle="任务领取、理论与操作学习、资料与成绩 · 原 WPF 学员工作台 / 浏览器本地模式" icon="GraduationCap" data-testid="student-workspace">
    <template #navigation>
      <div class="toolbar identity-bar"><span class="ws-subtext" data-testid="student-identity">{{ student?.name }} · {{ student?.studentNo }} · {{ student?.group }}</span><span class="badge badge-muted">本地身份 · 未连接教师服务器</span><span class="spacer" /><button type="button" class="btn btn-sm" :disabled="busy" data-testid="student-standalone" @click="openStandalone">单机练习 / 考评菜单</button><button type="button" class="btn btn-sm" @click="simulator.navigate('overview')"><UiIcon name="House" :size="14" />返回工艺主页</button></div>
      <nav class="tabs student-tabs" aria-label="学生工作台模块"><button v-for="item in tabs" :key="item.id" type="button" :class="{ active: workspace.data.studentTab === item.id }" :aria-current="workspace.data.studentTab === item.id ? 'page' : undefined" :data-testid="`student-tab-${item.id}`" @click="tab(item.id)"><UiIcon :name="item.icon" :size="15" /> {{ item.name }}</button></nav>
    </template>
    <ActiveAssessmentBanner v-if="!panelIsActive" />
    <template v-if="workspace.data.studentTab === 'home'">
      <section class="ws-hero" data-testid="student-home"><div><h2>{{ student?.name }}，欢迎回到学习工作台</h2><p>查看本浏览器教师发布给你的任务，按实际答案和手动操作完成学习。活动会话可继续，页面切换与刷新不重置真实时限。</p><div class="ws-inline"><button type="button" class="btn btn-primary" @click="tab('tasks')"><UiIcon name="ClipboardList" :size="16" />查看已发布任务</button><button type="button" class="btn" @click="practice()">开始理论练习</button><button type="button" class="btn" @click="tab('operation')">操作练习</button></div></div><img src="/simulator-web/assets/illustrations/漂亮的加注.png" alt="甲醇加注训练示意" /></section>
      <div class="ws-metrics">
        <div class="ws-metric"><div class="ws-metric-label">已发布 / 指派任务<UiIcon name="ClipboardList" :size="17" /></div><div class="ws-metric-value" data-testid="student-task-count">{{ tasks.length }}<small>项</small></div><div class="ws-metric-foot">{{ readyTasks.length }} 项在可开始时间内</div></div>
        <div class="ws-metric"><div class="ws-metric-label">已提交学习记录<UiIcon name="History" :size="17" /></div><div class="ws-metric-value">{{ myScores.length }}<small>次</small></div><div class="ws-metric-foot">{{ visibleScores.length }} 次成绩可见</div></div>
        <div class="ws-metric"><div class="ws-metric-label">平均得分比例（可见成绩）</div><div class="ws-metric-value" data-testid="student-average-score">{{ average == null ? '—' : average }}<small v-if="average != null">%</small></div><div class="ws-metric-foot">隐藏成绩不参与均分与通过统计</div></div>
        <div class="ws-metric"><div class="ws-metric-label">可复习收藏题目<UiIcon name="Star" :size="17" /></div><div class="ws-metric-value">{{ favouriteCount }}<small>题</small></div><div class="ws-metric-foot">按身份保存，不提供隐藏成绩快照</div></div>
      </div>
      <div class="ws-quick-grid"><button type="button" class="ws-quick" @click="practice('wrong')"><span class="ws-quick-icon"><UiIcon name="CircleX" :size="23" /></span><span><strong>错题复习</strong><small>仅使用可见成绩中的错误 / 未答题</small></span></button><button type="button" class="ws-quick" @click="practice('favourites')"><span class="ws-quick-icon"><UiIcon name="Star" :size="23" /></span><span><strong>我的收藏</strong><small>选择标签、数量、顺序 / 随机练习</small></span></button><button type="button" class="ws-quick" @click="tab('files')"><span class="ws-quick-icon"><UiIcon name="FolderOpen" :size="23" /></span><span><strong>学习资料</strong><small>预览 / 另存本浏览器真实文件</small></span></button></div>
      <div class="home-columns">
        <section class="ws-panel"><header class="ws-panel-header"><h3>最近发布任务</h3><button type="button" class="btn btn-sm" @click="tab('tasks')">全部任务</button></header><div class="ws-panel-body ws-small-stack"><button v-for="task in tasks.slice(0, 4)" :key="task.id" type="button" class="ws-list-row" @click="pickTask(task)"><UiIcon :name="task.kind === 'theory' ? 'FileText' : 'Workflow'" :size="20" /><div><strong>{{ task.title }}</strong><small>截止 {{ formatDate(task.endAt) }} · {{ task.durationMinutes }} 分钟{{ task.mode === 'practice' ? '（练习）' : '（考评）' }}</small></div><span class="badge" :class="taskBadge(task)">{{ taskState(task) }}</span></button><div v-if="!tasks.length" class="empty-state">暂无指派给当前身份的已发布任务；可先进行自由练习。</div></div></section>
        <section class="ws-panel"><header class="ws-panel-header"><h3>最近提交 / 成绩单</h3><button type="button" class="btn btn-sm" @click="history()">历史记录</button></header><div class="ws-panel-body ws-small-stack"><button v-for="score in myScores.slice(0, 4)" :key="score.id" type="button" class="ws-list-row" @click="detailScoreId = score.id"><UiIcon name="FileChartColumn" :size="20" /><div><strong>{{ score.title }}</strong><small>{{ score.category }} · {{ formatDate(score.submittedAt) }}<br />真实用时 {{ formatDuration(score.durationSeconds) }}</small></div><span v-if="score.scoreVisible" class="badge" :class="score.passed ? 'badge-success' : 'badge-danger'">{{ score.score }} / {{ score.maxScore }}</span><span v-else class="badge badge-muted">成绩隐藏</span></button><div v-if="!myScores.length" class="empty-state">尚无提交记录，不生成虚构示例成绩。</div></div></section>
      </div>
      <div class="ws-inline score-shortcuts"><button type="button" class="btn" @click="history('theory')">理论成绩单</button><button type="button" class="btn" @click="history('operation')">操作成绩单</button><span class="spacer" /><span class="ws-subtext">本地题库来源与答案仅供训练，正式规则请教师校核。</span></div>
    </template>
    <template v-else-if="workspace.data.studentTab === 'tasks'">
      <div class="ws-title-line"><h2>已发布任务列表</h2><button type="button" class="btn" data-testid="student-refresh-tasks" @click="refreshTasks"><UiIcon name="RefreshCw" :size="15" />刷新本地任务</button></div>
      <div class="ws-note">仅显示教师在<strong>本浏览器</strong>发布并指派给当前身份的任务。未发布草稿和未指派任务不可见；考评任务提交后不可重复开始，练习任务可在有效时间内重复练习。</div>
      <div class="toolbar"><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="taskQuery" class="field" placeholder="搜索任务名称 / 描述" aria-label="搜索已发布任务" data-testid="student-task-search" /></div><select v-model="taskKind" class="field task-filter" aria-label="任务类别"><option value="">全部类别</option><option value="theory">理论任务</option><option value="operation">操作任务</option></select><select v-model="taskMode" class="field task-filter" aria-label="任务模式"><option value="">练习 / 考评</option><option value="exam">考评任务</option><option value="practice">练习任务</option></select><select v-model="taskFilter" class="field task-filter" aria-label="任务状态筛选" data-testid="student-task-status"><option value="">全部状态</option><option>待完成</option><option>未开始</option><option>作答中</option><option>操作中</option><option>待开始操作</option><option>已提交</option><option>已截止</option></select></div>
      <div class="ws-training-grid student-task-grid" data-testid="student-task-list"><article v-for="task in taskRows" :key="task.id" class="ws-training-card" :data-testid="`student-task-${task.id}`"><header class="task-card-header"><UiIcon :name="task.kind === 'theory' ? 'FileText' : 'Workflow'" :size="22" /><span class="badge" :class="taskBadge(task)">{{ taskState(task) }}</span></header><div class="ws-training-card-body"><h3>{{ task.title }}</h3><p class="task-description">{{ task.description }}</p><div class="ws-small-stack"><small class="ws-subtext">{{ task.kind === 'theory' ? '理论题' : '操作题' }} · {{ task.mode === 'exam' ? '限时考评' : '练习任务' }} · 时限 {{ task.durationMinutes }} 分钟</small><small class="ws-subtext">开始：{{ formatDate(task.startAt) }}<br />截止：{{ formatDate(task.endAt) }}</small><small class="ws-subtext">{{ task.allStudents ? '发布给全体本地学员' : '指派给当前本地身份' }} · 附件 {{ task.attachmentIds.length }} 个</small></div><div class="ws-inline"><span class="badge badge-muted">{{ task.scoreVisible ? '交卷后成绩可见' : '成绩暂不可见' }}</span><span class="spacer" /><button type="button" class="btn btn-primary" :data-testid="`student-task-detail-${task.id}`" @click="pickTask(task)">查看详情</button></div></div></article></div>
      <div v-if="!filteredTasks.length" class="empty-state"><UiIcon name="ClipboardList" :size="48" class="ws-empty-icon" /><p>{{ tasks.length ? '没有符合筛选条件的任务。' : '没有发布 / 指派给当前身份的任务。' }}</p></div>
      <WorkspacePager v-model:page="page" v-model:page-size="pageSize" :total="filteredTasks.length" />
    </template>
    <template v-else-if="workspace.data.studentTab === 'practice'">
      <TheoryAnswerPane v-if="theory?.mode === 'practice'" return-page="student" />
      <TheorySetup v-else :key="practiceSource" return-page="student" :initial-source="practiceSource" @cancel="tab('home')" />
    </template>
    <template v-else-if="workspace.data.studentTab === 'exam'">
      <TheoryAnswerPane v-if="theory?.mode === 'exam'" return-page="student" />
      <section v-else class="ws-panel"><div class="ws-panel-body empty-state" data-testid="student-no-exam"><UiIcon name="FilePenLine" :size="48" class="ws-empty-icon" /><h3>当前没有理论考试会话</h3><p>理论考评由已发布任务开始，交卷前不可查看答案或解析。</p><button type="button" class="btn btn-primary" @click="taskMode = 'exam'; tab('tasks')">查看已发布考评任务</button></div></section>
    </template>
    <template v-else-if="workspace.data.studentTab === 'operation'">
      <OperationSessionPanel v-if="operation || pending" return-page="student" />
      <div v-else-if="busy" class="ws-note warning" role="status">已有其他模块 / 身份的活动考核或录制，不能同时创建第二个操作会话。请使用上方活动会话继续、提交或结束。</div>
      <TrainingCatalog v-else return-page="student" mode="practice" />
    </template>
    <FileManager v-else-if="workspace.data.studentTab === 'files'" role="student" />
    <LearnerScoreHistory v-else-if="workspace.data.studentTab === 'history'" return-page="student" :initial-kind="historyKind" />
    <BaseModal v-if="pickedTask" :title="'任务详情 · ' + pickedTask.title" :width="940" :close-on-backdrop="false" @close="pickedTaskId = ''">
      <div class="ws-modal-content ws-stack" data-testid="student-task-detail">
        <div class="ws-title-line"><h2>{{ pickedTask.title }}</h2><span class="badge" :class="taskBadge(pickedTask)">{{ taskState(pickedTask) }}</span></div>
        <p class="task-detail-description">{{ pickedTask.description }}</p>
        <div class="ws-details"><div class="ws-detail-item"><span>任务类别 / 模式</span><strong>{{ pickedTask.kind === 'theory' ? '理论题' : '操作题' }} · {{ pickedTask.mode === 'exam' ? '限时考评' : '练习任务' }}</strong></div><div class="ws-detail-item"><span>接收范围</span><strong>{{ pickedTask.allStudents ? '全体本地学员' : '已指派当前本地身份' }}</strong></div><div class="ws-detail-item"><span>开始时间</span><strong>{{ formatDate(pickedTask.startAt) }}</strong></div><div class="ws-detail-item"><span>截止时间</span><strong>{{ formatDate(pickedTask.endAt) }}</strong></div><div class="ws-detail-item"><span>本次时限</span><strong>{{ pickedTask.durationMinutes }} 分钟{{ pickedTask.mode === 'practice' ? '（练习仅受任务截止时间限制）' : '（或任务截止时间，以较早者为准）' }}</strong></div><div class="ws-detail-item"><span>成绩可见性</span><strong>{{ pickedTask.scoreVisible ? '交卷后可查看分数、答案及详细评分' : '暂不可见；提交后只显示提交记录' }}</strong></div><div v-if="pickedTask.kind === 'theory'" class="ws-detail-item full"><span>试卷信息</span><strong>{{ taskPaper?.title || '已发布试卷快照（原试卷可能已移除）' }} · {{ pickedTask.snapshot?.questions?.length ?? taskPaper?.questionIds.length ?? 0 }} 道题目 · 总分 {{ pickedTask.snapshot?.maxScore ?? taskPaper?.maxScore ?? 100 }}</strong><p class="ws-subtext">已发布任务按发布时题目快照作答；此预览不显示题目答案。{{ pickedTask.mode === 'exam' ? '考评交卷前不能揭示答案与解析。' : '练习可查看本题答案，查看后锁定本题。' }}</p></div><div v-else class="ws-detail-item full"><span>操作题信息</span><strong>{{ taskOperation?.name || pickedTask.snapshot?.scene?.name || taskFlow?.name || pickedTask.operationId }}</strong><p class="ws-subtext">{{ pickedTask.snapshot?.scene ? pickedTask.snapshot.scene.mode === 'sequence' ? '自编录制顺序操作题，按本次手动操作与录制序列评分。' : '自编状态 / 事件题，按本次状态条件和事件记录评分。' : '内置工艺题，按本次手动完成的步骤 / 规则评分。' }}{{ taskFlow?.requiresSafety || pickedTask.snapshot?.scene?.requiresSafety ? '需要先完成加注作业前安全检查；通过后才开始本次计时。' : '' }}</p></div></div>
        <div v-if="pickedTask.remark" class="ws-note">任务备注：{{ pickedTask.remark }}</div>
        <section class="ws-panel"><header class="ws-panel-header"><h3>任务附件</h3><span class="badge">{{ pickedTask.attachmentIds.length }} 个</span></header><div class="ws-panel-body ws-small-stack"><div v-for="file in attachments" :key="file.id" class="ws-check-row"><UiIcon name="FileText" :size="18" /><span>{{ file.name }}<small class="ws-subtext attachment-size">{{ formatBytes(file.size) }} · {{ file.storage === 'builtin' ? '应用内置文本' : file.storage === 'indexeddb' ? '浏览器文件库' : '仅本会话内存' }}</small></span><span class="spacer" /><button type="button" class="btn btn-sm" :aria-label="'另存为任务附件：' + file.name" :data-testid="`task-attachment-${file.id}`" @click="workspace.downloadFile(file)"><UiIcon name="Download" :size="13" />另存为</button></div><p v-if="!pickedTask.attachmentIds.length" class="ws-subtext">此任务没有附件。</p><p v-if="attachments.length < pickedTask.attachmentIds.length" class="ws-note warning">{{ pickedTask.attachmentIds.length - attachments.length }} 个附件已移除或不可读取，不生成伪下载链接。</p><button v-if="attachments.length" type="button" class="btn btn-sm" @click="pickedTaskId = ''; tab('files')">到学习资料预览附件</button></div></section>
        <div class="ws-note warning">本地任务和成绩保存在当前浏览器，不会提交至教师服务器。切换页面和刷新不会暂停考评计时；结束本次不会生成成绩。</div>
        <div v-if="taskError && !pickedIsActive" class="ws-form-error" role="status" data-testid="student-task-unavailable">{{ taskError }}</div>
        <div v-else-if="busy && !pickedIsActive" class="ws-note warning" role="status">已有未结束的会话 / 录制，请先继续、提交或结束，再领取此任务。</div>
        <label v-if="!pickedIsActive && !taskError" class="checkbox-label"><input v-model="agreed" type="checkbox" data-testid="student-task-agreement" />我已阅读任务要求、附件、时限和本地模式说明</label>
      </div>
      <template #footer><button v-if="taskRecord" type="button" class="btn" @click="detailScoreId = taskRecord.id; pickedTaskId = ''">{{ taskRecord.scoreVisible ? '查看已提交成绩' : '查看已提交记录' }}</button><button type="button" class="btn" @click="pickedTaskId = ''">关闭</button><button type="button" class="btn btn-primary" :disabled="!pickedIsActive && (!!taskError || busy || !agreed)" data-testid="student-start-task" @click="startTask"><UiIcon :name="pickedIsActive ? 'Play' : 'Send'" :size="15" />{{ pickedIsActive ? '继续本任务' : pickedTask.mode === 'practice' && taskRecord ? '再次练习' : '开始任务' }}</button></template>
    </BaseModal>
    <ScoreDetailModal v-if="detailScore" :record="detailScore" return-page="student" @close="detailScoreId = ''" />
  </WorkspaceFrame>
</template>

<style scoped>
.identity-bar{margin-bottom:8px}.student-tabs{margin-bottom:20px;flex-wrap:wrap}.home-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.score-shortcuts{margin:17px 0}.home-columns .ws-list-row{align-items:center}.home-columns .badge{white-space:nowrap}.task-filter{width:150px}.student-task-grid{margin-top:18px}.task-card-header{padding:15px 18px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(100deg,#e6f2ff,#f7fbff);color:#2f73ad;border-bottom:1px solid #d3e3f0}.task-description{white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:60px}.task-detail-description{white-space:pre-wrap;line-height:1.9;margin:0}.ws-modal-content h2{font-size:19px;margin:0}.ws-modal-content .ws-title-line{margin:0}.ws-modal-content .ws-note{margin:0}.attachment-size{display:block;margin-top:4px}.ws-detail-item p{margin:8px 0 0}.home-columns .empty-state{padding:25px}.student-task-grid h3{overflow-wrap:anywhere}
@media(max-width:950px){.home-columns{grid-template-columns:1fr}}@media(max-width:600px){.task-filter{width:100%}.student-tabs button{flex:1;white-space:nowrap}.home-columns .ws-list-row{flex-wrap:wrap}.home-columns .ws-list-row .badge{margin-left:auto}.identity-bar .badge{font-size:10px}}
</style>
