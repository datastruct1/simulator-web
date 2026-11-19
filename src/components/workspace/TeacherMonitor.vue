<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { workflows } from '../../data/catalog'
import type { WorkspaceStudent } from '../../data/workspace'
import { formatDate, matches } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
import RosterManager from './RosterManager.vue'
import TrainingPreviewGraphic from './TrainingPreviewGraphic.vue'
const workspace = useWorkspace(), simulator = useSimulator(), query = ref(''), group = ref(''), selected = ref<WorkspaceStudent | null>(null), flowId = ref('supply')
const students = computed(() => workspace.data.students.filter(student => (!group.value || student.group === group.value) && matches(`${student.name} ${student.studentNo}`, query.value)))
const groups = computed(() => [...new Set(workspace.data.students.map(student => student.group))])
const demo = computed(() => simulator.state.workspaces.teacherDemo as { flowId: string; title: string } | undefined)
function progress(student: WorkspaceStudent) { return workspace.data.activeOperation?.studentId === student.id ? workspace.operationProgress() : 0 }
function status(student: WorkspaceStudent) { return workspace.data.activeOperation?.studentId === student.id ? '本浏览器操作训练中' : workspace.data.activeTheory?.studentId === student.id ? '本浏览器理论作答中' : '未在本浏览器训练' }
function showTab(tab: string) { workspace.data.teacherTab = tab }
function startDemo() {
  if (workspace.active.value || workspace.data.pendingLaunch) { simulator.notify('请先结束当前考核，自动演示不能代替手动考核。', 'warning'); return }
  const flow = workflows.find(item => item.id === flowId.value)
  if (flow && simulator.startFlow(flow.id, true)) { simulator.state.workspaces.teacherDemo = { flowId: flow.id, title: flow.name }; simulator.notify('已开始本浏览器内流程演示，没有建立图传连接，也不会控制其他电脑。', 'info') }
}
function stopDemo() { if (simulator.state.autoDemo) simulator.stopFlow(); simulator.state.workspaces.teacherDemo = null; simulator.notify('本地教师演示已停止。') }
</script>
<template>
  <div class="ws-metrics">
    <div class="ws-metric"><div class="ws-metric-label">本地学生名册<UiIcon name="Users" :size="17" /></div><div class="ws-metric-value">{{ workspace.data.students.length }}<small>人</small></div><div class="ws-metric-foot">不是服务器在线人数</div></div>
    <div class="ws-metric"><div class="ws-metric-label">已发布任务<UiIcon name="ClipboardList" :size="17" /></div><div class="ws-metric-value">{{ workspace.data.tasks.filter(task => task.publishedAt).length }}<small>项</small></div><div class="ws-metric-foot">当前浏览器的教学任务</div></div>
    <div class="ws-metric"><div class="ws-metric-label">理论题库<UiIcon name="Library" :size="17" /></div><div class="ws-metric-value">{{ workspace.data.questions.length }}<small>题</small></div><div class="ws-metric-foot">原 T11 / T12 + 本地编辑题目</div></div>
    <div class="ws-metric"><div class="ws-metric-label">已提交考核<UiIcon name="ChartNoAxesCombined" :size="17" /></div><div class="ws-metric-value">{{ workspace.data.scores.length }}<small>次</small></div><div class="ws-metric-foot">按实际答案和操作评分</div></div>
  </div>
  <div class="ws-note"><UiIcon name="Monitor" :size="16" /> 在线学生监视 / 屏幕监控为<strong>本地演示视图</strong>：没有教师服务器、学生心跳、IP 连接或视频流。以下名册卡片只展示当前浏览器保存的训练信息，不冒充远程桌面。</div>
  <div class="ws-monitor-layout">
    <aside class="ws-panel"><header class="ws-panel-header"><h3>学生列表</h3><span class="badge badge-muted">{{ students.length }}</span></header><div class="ws-panel-body ws-small-stack"><input v-model="query" class="field" placeholder="搜索姓名 / 学号" /><select v-model="group" class="field"><option value="">全部班级</option><option v-for="item in groups" :key="item">{{ item }}</option></select><div class="ws-list"><button v-for="student in students" :key="student.id" class="ws-list-row" :class="{ active: selected?.id === student.id }" @click="selected = student"><UiIcon name="UserRound" :size="16" /><div><strong>{{ student.name }}</strong><small>{{ student.studentNo }}</small><small>{{ status(student) }}</small></div></button><div v-if="!students.length" class="empty-state">暂无匹配学员</div></div><RosterManager /></div></aside>
    <section class="ws-panel"><header class="ws-panel-header"><h3><UiIcon name="Monitor" :size="17" /> 在线学生监视</h3><span class="badge">本地示意 / 非图传</span></header><div class="ws-panel-body"><div class="ws-monitor-grid"><button v-for="student in students" :key="student.id" class="ws-screen-card" style="text-align:left;padding:0" @click="selected = student"><div class="ws-screen-demo"><TrainingPreviewGraphic :title="student.name + ' · ' + status(student)" :progress="progress(student)" /><span class="ws-screen-demo-tag">本地训练示意</span></div><div class="ws-screen-card-footer"><strong>{{ student.name }}</strong><small>{{ student.studentNo }}</small></div><div style="padding:9px 12px" class="ws-subtext">{{ status(student) }}</div></button></div><div v-if="!students.length" class="empty-state"><UiIcon name="MonitorOff" :size="50" class="ws-empty-icon" /><p>暂无匹配学生。可在本地名册中新增学员。</p></div></div></section>
    <aside class="ws-panel ws-monitor-console"><header class="ws-panel-header"><h3>教师控制台</h3></header><div class="ws-panel-body ws-small-stack"><select v-model="flowId" class="field" aria-label="演示流程"><option v-for="flow in workflows" :key="flow.id" :value="flow.id">{{ flow.name }}</option></select><button v-if="!demo" class="btn btn-primary" @click="startDemo"><UiIcon name="Play" :size="15" />开始演示</button><button v-else class="btn btn-danger" @click="stopDemo">停止演示</button><button class="btn" @click="showTab('files')">文件管理 / 下发文件</button><button class="btn" @click="showTab('tasks')">任务管理</button><button class="btn" @click="showTab('papers')">试卷管理</button><button class="btn" @click="showTab('questions')">题库管理</button><button class="btn" @click="showTab('operations')">操作题管理</button><button class="btn" @click="simulator.navigate('overview')">回到主页</button><div class="ws-subtext">开始演示仅运行本机流程。需要安全检查的流程仍执行安全门禁。</div></div></aside>
  </div>
  <BaseModal v-if="selected" :title="'屏幕监控 · ' + selected.name + '（本地演示）'" :width="1000" @close="selected = null"><div class="ws-modal-content"><div class="ws-note">{{ selected.name }} · {{ selected.studentNo }} · {{ status(selected) }}。未连接任何 IP 地址；图像是本地工艺示意，不是学生屏幕截图。</div><div class="ws-screen-full"><TrainingPreviewGraphic :title="selected.name + ' 的本地训练信息'" :progress="progress(selected)" /></div><div class="ws-details" style="margin-top:18px"><div class="ws-detail-item"><span>已提交记录</span><strong>{{ workspace.data.scores.filter(score => score.studentId === selected?.id).length }} 次</strong></div><div class="ws-detail-item"><span>最近提交</span><strong>{{ formatDate(workspace.data.scores.find(score => score.studentId === selected?.id)?.submittedAt) }}</strong></div></div></div><template #footer><button class="btn" @click="selected = null">关闭</button></template></BaseModal>
</template>
