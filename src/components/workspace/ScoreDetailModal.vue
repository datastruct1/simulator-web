<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReturnPage, WorkspaceScore } from '../../data/workspace'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { useIlab } from '../../state/ilab'
import { formatDate, formatDuration, round } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
const props = withDefaults(defineProps<{ record: WorkspaceScore; teacher?: boolean; returnPage?: ReturnPage }>(), { teacher: false, returnPage: 'student' })
const emit = defineEmits<{ close: [] }>()
const workspace = useWorkspace(), simulator = useSimulator(), tab = ref('all'), expanded = ref<string[]>([])
const visible = computed(() => props.teacher || props.record.scoreVisible)
const details = computed(() => props.record.details.filter(detail => tab.value === 'wrong' ? !detail.passed : tab.value === 'passed' ? detail.passed : true))
const percentage = computed(() => round(props.record.score / props.record.maxScore * 100))
const wrongQuestions = computed(() => props.record.details.filter(detail => detail.kind === 'question' && !detail.passed && detail.question).flatMap(detail => detail.question ? [detail.question] : []))
const ilab = useIlab()
const upload = computed(() => ilab.jobForScore(props.record.id))
const reportFile = ref<HTMLInputElement | null>(null)
async function selectReport(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file || !upload.value) return
  try { await ilab.uploadReport(upload.value, file) } catch (error) { simulator.notify(error instanceof Error ? error.message : '报告上传失败。', 'warning') }
}
function toggle(id: string) { expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value, id] }
function retryWrong() { if (workspace.startTheory({ questions: wrongQuestions.value, title: `错题复习 · ${props.record.title}`, mode: 'practice', returnPage: props.returnPage, maxScore: 100 })) emit('close') }
</script>
<template>
  <BaseModal :title="record.kind === 'theory' ? '理论题成绩详情' : '成绩详情 · 操作考核'" :width="1120" @close="emit('close')">
    <div class="ws-modal-content">
      <div v-if="upload" class="ws-note" :class="{ warning: upload.status !== 'uploaded' }" role="status" data-testid="ilab-score-status"><strong>实验空间 · {{ upload.mode === 'test' ? '测试环境' : '正式环境' }}</strong><p>{{ upload.message }}</p><small>本项目记录 ID：{{ upload.originId }}。平台确认回传与本地评分是两个独立状态。</small></div>
      <div v-if="upload?.report" class="ws-note" role="status" data-testid="ilab-report-status">{{ upload.report.message }}</div>
      <div v-if="!visible" class="empty-state"><UiIcon name="LockKeyhole" :size="48" class="ws-empty-icon" /><h3>已提交本地考核</h3><p>教师设置了“成绩暂不可见”。详细分数及答案仅能在本地教师工作台查看。</p><p class="ws-subtext">提交时间：{{ formatDate(record.submittedAt) }}</p></div>
      <template v-else>
        <div class="ws-title-line"><div><h2>{{ record.title }}</h2><p class="ws-subtext" style="margin:8px 0 0">{{ record.studentName }} · {{ record.studentNo }} · {{ record.category }} · 本地自动评分</p></div><span class="badge" :class="record.passed ? 'badge-success' : 'badge-danger'">{{ record.passed ? '通过' : '未通过' }}</span></div>
        <div class="ws-metrics" style="margin-top:20px"><div class="ws-metric"><div class="ws-metric-label">得分 / 总分</div><div class="ws-metric-value">{{ record.score }}<small>/ {{ record.maxScore }}</small></div></div><div class="ws-metric"><div class="ws-metric-label">{{ record.kind === 'theory' ? '题目正确率' : '得分点通过率' }}</div><div class="ws-metric-value">{{ record.accuracy }}<small>%</small></div></div><div class="ws-metric"><div class="ws-metric-label">真实用时</div><div class="ws-metric-value" style="font-size:24px">{{ formatDuration(record.durationSeconds) }}</div></div><div class="ws-metric"><div class="ws-metric-label">提交时间</div><div class="ws-metric-value" style="font-size:15px;margin-top:15px">{{ formatDate(record.submittedAt) }}</div><small class="ws-subtext">{{ record.reason === 'timeout' ? '时间到自动交卷' : '手动提交' }}</small></div></div>
        <div class="ws-note warning">{{ record.notes }}</div>
        <div class="ws-title-line"><h3>{{ record.kind === 'theory' ? '答题详情 / 答题情况' : '详细评分 / 实际操作' }}</h3><div class="ws-inline"><button class="ws-chip" :class="{ active: tab === 'all' }" @click="tab = 'all'">全部 {{ record.details.length }}</button><button class="ws-chip" :class="{ active: tab === 'wrong' }" @click="tab = 'wrong'">{{ record.kind === 'theory' ? '错误列表' : '未通过' }}</button><button class="ws-chip" :class="{ active: tab === 'passed' }" @click="tab = 'passed'">{{ record.kind === 'theory' ? '正确' : '已通过' }}</button></div></div>
        <div v-if="record.kind === 'operation'" class="ws-table-wrap"><table class="data-table"><thead><tr><th>步骤名称 / 得分点</th><th>对应设备</th><th>是否通过</th><th>分值</th><th>实际操作</th><th>分数变化</th><th>说明</th></tr></thead><tbody><tr v-for="detail in details" :key="detail.id"><td style="min-width:180px">{{ detail.title }}<small class="ws-subtext" style="display:block">{{ detail.expected }}</small></td><td>{{ detail.deviceId || '—' }}</td><td class="ws-nowrap"><span class="badge" :class="detail.passed ? 'badge-success' : 'badge-danger'">{{ detail.passed ? '✓ 通过' : '✗ 未通过' }}</span></td><td>{{ detail.maxScore }}</td><td style="min-width:150px">{{ detail.response }}</td><td class="ws-nowrap" :class="detail.score < 0 ? 'ws-danger' : detail.passed ? 'ws-success' : ''">{{ detail.score > 0 ? '+' : '' }}{{ detail.score }}</td><td style="min-width:180px">{{ detail.message }}</td></tr><tr v-if="!details.length"><td colspan="7" class="empty-state">此筛选下没有评分项</td></tr></tbody></table></div>
        <div v-else class="ws-stack"><article v-for="detail in details" :key="detail.id" class="ws-panel"><header class="ws-panel-header"><h3 style="font-size:14px;line-height:1.8">{{ detail.title }}</h3><span class="badge" :class="detail.passed ? 'badge-success' : 'badge-danger'">{{ detail.passed ? '✓ 正确' : '✗ 错误' }} · {{ detail.score }}/{{ detail.maxScore }}</span></header><div class="ws-panel-body" style="padding-top:13px"><div class="ws-inline"><span class="badge badge-muted">{{ detail.type }}</span><span>你的答案：<strong :class="detail.passed ? 'ws-success' : 'ws-danger'">{{ detail.response }}</strong></span><span>正确答案：<strong class="ws-success">{{ detail.expected }}</strong></span><span class="spacer" /><button class="btn btn-sm" @click="toggle(detail.id)">{{ expanded.includes(detail.id) ? '收起' : '查看题目 / 解析' }}</button></div><div v-if="expanded.includes(detail.id)" style="margin-top:12px"><div v-for="(option, index) in detail.question?.options" :key="option.id" class="ws-check-row" style="margin-top:5px"><span class="ws-option-letter">{{ String.fromCharCode(65 + index) }}</span>{{ option.text }}<UiIcon v-if="option.correct" name="Check" :size="15" class="ws-success" /></div><p class="ws-analysis-answer">{{ detail.explanation || '本题暂无解析。' }}</p></div></div></article><div v-if="!details.length" class="empty-state">此筛选下没有题目</div></div>
        <div class="ws-subtext" style="margin-top:16px">折算得分比例 {{ percentage }}%。每题 / 每步按权重计算，分值展示保留一位小数；总分从未舍入的得分点求和后统一舍入。</div>
      </template>
    </div>
    <template #footer>
      <input ref="reportFile" type="file" hidden accept=".pdf,.doc,.docx,.txt" @change="selectReport" />
      <button v-if="visible && upload?.status === 'uploaded'" class="btn" :disabled="upload.report?.status === 'uploading' || upload.report?.status === 'uploaded' || upload.report?.status === 'uncertain'" @click="reportFile?.click()">上传实验报告</button>
      <button v-if="visible && upload?.result" class="btn" @click="simulator.downloadJson('实验空间-' + upload.originId + '.json', upload.result)">导出回传 JSON</button>
      <button v-if="upload && ['failed', 'uncertain'].includes(upload.status)" class="btn" @click="ilab.retry(upload)">查询确认 / 重试回传</button>
      <button v-if="visible" class="btn" @click="simulator.downloadJson('成绩详情-' + workspace.safeName(record.title) + '.json', record)">导出详情 JSON</button>
      <button v-if="visible" class="btn" @click="workspace.exportScores([record], '成绩详情.csv')">导出成绩 CSV</button>
      <button v-if="visible && !teacher && wrongQuestions.length" class="btn btn-primary" @click="retryWrong">重练错题</button>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </BaseModal>
</template>
