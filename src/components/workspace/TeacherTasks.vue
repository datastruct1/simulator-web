<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import type { WorkspaceScore, WorkspaceTask } from '../../data/workspace'
import { clone, downloadText, formatDate, makeCsv, matches, usePagination } from './lib/domain'
import TaskEditorDialog from './TaskEditorDialog.vue'
import ScoreDetailModal from './ScoreDetailModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import WorkspacePager from './WorkspacePager.vue'
import UiIcon from '../common/UiIcon.vue'
const workspace = useWorkspace(), simulator = useSimulator(), query = ref(''), status = ref(''), category = ref(''), selectedId = ref(workspace.data.tasks[0]?.id || ''), editing = ref<WorkspaceTask | null>(null), confirming = ref<'publish' | 'delete' | null>(null), scoreDetail = ref<WorkspaceScore | null>(null)
const filtered = computed(() => workspace.data.tasks.filter(task => (!status.value || workspace.taskStatus(task) === status.value) && (!category.value || task.kind === category.value) && matches(`${task.title} ${task.description}`, query.value)))
const { page, pageSize, rows } = usePagination(filtered, 10)
const selected = computed(() => workspace.data.tasks.find(task => task.id === selectedId.value))
const attendees = computed(() => selected.value ? workspace.taskStudents(selected.value) : [])
const scores = computed(() => selected.value ? workspace.taskScores(selected.value) : [])
const selectedPaper = computed(() => workspace.data.papers.find(paper => paper.id === selected.value?.paperId))
const selectedOperation = computed(() => workspace.operationItems.value.find(item => item.id === selected.value?.operationId))
watch([query, status, category], () => { page.value = 1 })
function create() { editing.value = workspace.newTask() }
function saved(id: string) { selectedId.value = id; editing.value = null }
function confirm() { if (!selected.value) return; if (confirming.value === 'publish') workspace.publishTask(selected.value.id); else if (workspace.deleteTask(selected.value.id)) selectedId.value = workspace.data.tasks[0]?.id || ''; confirming.value = null }
function exportTaskScores() {
  if (!selected.value) return
  const task = selected.value
  downloadText(workspace.safeName(task.title) + '_成绩.csv', makeCsv([['学号', '姓名', '班级', '最终得分', '总分', '提交时间', '备注'], ...attendees.value.map(student => { const record = scores.value.find(score => score.studentId === student.id); return [student.studentNo, student.name, student.group, record?.score ?? '未完成', record?.maxScore ?? '', record?.submittedAt ?? '', '本地浏览器成绩'] })]), 'text/csv;charset=utf-8')
}
onMounted(() => {
  const paperId = simulator.state.workspaces.taskPaperId as string | undefined, operationId = simulator.state.workspaces.taskOperationId as string | undefined
  if (paperId || operationId) { const task = workspace.newTask(); if (paperId) task.paperId = paperId; if (operationId) { task.kind = 'operation'; task.operationId = operationId }; editing.value = task; simulator.state.workspaces.taskPaperId = ''; simulator.state.workspaces.taskOperationId = '' }
})
</script>
<template>
  <div class="toolbar"><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索任务关键词" /></div><select v-model="status" class="field" style="width:130px"><option value="">全部状态</option><option>未发布</option><option>未开始</option><option>进行中</option><option>已截止</option></select><select v-model="category" class="field" style="width:140px"><option value="">全部任务类型</option><option value="theory">理论任务</option><option value="operation">操作任务</option></select><button class="btn" @click="query = ''; status = ''; category = ''; simulator.notify('已刷新当前浏览器任务列表。')"><UiIcon name="RefreshCw" :size="15" />刷新任务</button><span class="spacer" /><button class="btn btn-primary" @click="create"><UiIcon name="Plus" :size="15" />新增任务</button></div>
  <div class="ws-split">
    <aside class="ws-panel"><header class="ws-panel-header"><h3>任务列表</h3><span class="badge">{{ filtered.length }} 项</span></header><div class="ws-panel-body"><div class="ws-list"><button v-for="task in rows" :key="task.id" class="ws-list-row" :class="{ active: selectedId === task.id }" @click="selectedId = task.id"><UiIcon :name="task.kind === 'theory' ? 'FileQuestion' : 'Workflow'" :size="17" /><div><strong>{{ task.title }}</strong><small>{{ workspace.taskStatus(task) }} · {{ task.kind === 'theory' ? '理论任务' : '操作任务' }} · {{ task.mode === 'exam' ? '考试' : '练习' }}</small></div></button><div v-if="!filtered.length" class="empty-state">无匹配任务</div></div><WorkspacePager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div></aside>
    <section class="ws-panel"><header class="ws-panel-header"><h3>任务详情</h3><span v-if="selected" class="badge" :class="workspace.taskStatus(selected) === '进行中' ? 'badge-success' : 'badge-muted'">{{ workspace.taskStatus(selected) }}</span></header><div class="ws-panel-body">
      <template v-if="selected"><h2 style="font-size:22px;line-height:1.6">{{ selected.title }}</h2><p class="ws-subtext">{{ selected.description }}</p><div class="ws-details"><div class="ws-detail-item"><span>任务类型 / 模式</span><strong>{{ selected.kind === 'theory' ? '理论任务' : '操作任务' }} · {{ selected.mode === 'exam' ? '考试' : '练习' }}</strong></div><div class="ws-detail-item"><span>{{ selected.kind === 'theory' ? '试卷' : '操作题' }}</span><strong>{{ selected.kind === 'theory' ? selectedPaper?.title || '已发布试卷快照' : selectedOperation?.name || selected.snapshot?.scene?.name || '已发布流程快照' }}</strong></div><div class="ws-detail-item"><span>开始时间</span><strong>{{ formatDate(selected.startAt) }}</strong></div><div class="ws-detail-item"><span>截止时间</span><strong>{{ formatDate(selected.endAt) }}</strong></div><div class="ws-detail-item"><span>创建时间</span><strong>{{ formatDate(selected.createdAt) }}</strong></div><div class="ws-detail-item"><span>上次修改时间</span><strong>{{ formatDate(selected.updatedAt) }}</strong></div><div class="ws-detail-item"><span>考核时长 / 成绩可见性</span><strong>{{ selected.durationMinutes }} 分钟 · {{ selected.scoreVisible ? '学生可查看' : '暂仅教师可查看' }}</strong></div><div class="ws-detail-item"><span>完成率（本地已提交）</span><strong>{{ workspace.taskCompletion(selected) }}%</strong><progress class="ws-progress" :value="workspace.taskCompletion(selected)" max="100" /></div><div v-if="selected.remark" class="ws-detail-item full"><span>备注</span><strong>{{ selected.remark }}</strong></div></div>
        <hr class="ws-divider" /><div class="ws-title-line"><h3>参与人员</h3><span class="badge">{{ selected.allStudents ? '全体人员' : '指派人员' }} · {{ attendees.length }} 人</span></div><div class="ws-table-wrap"><table class="data-table"><thead><tr><th>学生姓名</th><th>学号</th><th>班级</th><th>得分</th><th>提交时间</th><th>操作</th></tr></thead><tbody><tr v-for="student in attendees" :key="student.id"><td>{{ student.name }}</td><td>{{ student.studentNo }}</td><td>{{ student.group }}</td><td><span v-if="scores.find(score => score.studentId === student.id)" class="ws-success">{{ scores.find(score => score.studentId === student.id)?.score }} / {{ scores.find(score => score.studentId === student.id)?.maxScore }}</span><span v-else class="ws-subtext">未完成</span></td><td>{{ formatDate(scores.find(score => score.studentId === student.id)?.submittedAt) }}</td><td><button class="btn btn-sm" :disabled="!scores.find(score => score.studentId === student.id)" @click="scoreDetail = scores.find(score => score.studentId === student.id) || null">查看详情</button></td></tr><tr v-if="!attendees.length"><td colspan="6" class="empty-state">暂无参与人员，请编辑任务指派学员</td></tr></tbody></table></div>
        <div v-if="selected.attachmentIds.length" class="ws-tag-row" style="margin-top:17px"><button v-for="file in workspace.data.files.filter(file => selected?.attachmentIds.includes(file.id))" :key="file.id" class="btn btn-sm" @click="workspace.downloadFile(file)"><UiIcon name="Paperclip" :size="14" />{{ file.name }}</button></div>
        <div class="ws-note" style="margin-top:18px">发布只在本浏览器生效；学生界面依据本地名册和指派人员显示任务。成绩来自真实本地提交，没有服务器确认或预置的固定分数。</div>
        <div class="form-actions"><button class="btn btn-danger" @click="confirming = 'delete'">删除任务</button><span class="spacer" /><button class="btn" :disabled="!attendees.length" @click="exportTaskScores">导出成绩</button><button class="btn" @click="editing = clone(selected)">编辑任务</button><button v-if="selected.publishedAt" class="btn" @click="workspace.withdrawTask(selected.id)">撤回发布</button><button class="btn btn-primary" @click="confirming = 'publish'"><UiIcon name="Send" :size="15" />{{ selected.publishedAt ? '重新发布任务' : '发布任务' }}</button></div>
      </template><div v-else class="empty-state"><UiIcon name="ClipboardList" :size="52" class="ws-empty-icon" /><p>选择任务查看详情，或点击“新增任务”设置试卷 / 操作题及参与人员。</p></div>
    </div></section>
  </div>
  <TaskEditorDialog v-if="editing" :task="editing" @close="editing = null" @saved="saved" />
  <ScoreDetailModal v-if="scoreDetail" :record="scoreDetail" teacher @close="scoreDetail = null" />
  <ConfirmDialog v-if="confirming && selected" :title="confirming === 'publish' ? '发布任务（本地）' : '删除任务'" :message="confirming === 'publish' ? `确定发布“${selected.title}”？发布后所选学员可以在当前浏览器查看并开始任务，不会向远程客户端下发。` : `确定删除“${selected.title}”？此操作不可撤销，历史成绩保留。`" :danger="confirming === 'delete'" :confirm-text="confirming === 'publish' ? '发布到本地' : '删除'" @confirm="confirm" @close="confirming = null" />
</template>
