<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReturnPage, WorkspaceScore } from '../../data/workspace'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { formatDate, formatDuration, matches, round, usePagination } from './lib/domain'
import WorkspacePager from './WorkspacePager.vue'
import ScoreDetailModal from './ScoreDetailModal.vue'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ returnPage?: ReturnPage; initialKind?: '' | 'theory' | 'operation' }>(), { returnPage: 'student', initialKind: '' })
const workspace = useWorkspace(), simulator = useSimulator()
const query = ref(''), kind = ref(props.initialKind), mode = ref(''), result = ref(''), fromDate = ref(''), toDate = ref('')
const selectedIds = ref<string[]>([]), detailId = ref(''), removingIds = ref<string[] | null>(null)
const student = computed(() => props.returnPage === 'exam' ? workspace.offlineStudent.value : workspace.currentStudent.value)
const records = computed(() => workspace.data.scores.filter(score => score.studentId === student.value?.id).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)))
const visibleRecords = computed(() => records.value.filter(score => score.scoreVisible))
const average = computed(() => visibleRecords.value.length ? round(visibleRecords.value.reduce((sum, score) => sum + score.score / score.maxScore * 100, 0) / visibleRecords.value.length) : null)
const passRate = computed(() => visibleRecords.value.length ? round(visibleRecords.value.filter(score => score.passed).length / visibleRecords.value.length * 100) : null)
const totalDuration = computed(() => records.value.reduce((sum, score) => sum + score.durationSeconds, 0))
const invalidRange = computed(() => !!fromDate.value && !!toDate.value && fromDate.value > toDate.value)
const filtered = computed(() => invalidRange.value ? [] : records.value.filter(score => {
  const submittedAt = Date.parse(score.submittedAt)
  return (!kind.value || score.kind === kind.value) && (!mode.value || score.mode === mode.value)
    && (!result.value || (result.value === 'hidden' ? !score.scoreVisible : score.scoreVisible && (result.value === 'passed' ? score.passed : !score.passed)))
    && (!fromDate.value || submittedAt >= Date.parse(`${fromDate.value}T00:00:00`))
    && (!toDate.value || submittedAt <= Date.parse(`${toDate.value}T23:59:59.999`))
    && matches(`${score.title} ${score.category} ${score.studentNo} ${score.studentName}`, query.value)
}))
const { page, pageSize, rows } = usePagination(filtered, 10)
const selected = computed(() => records.value.filter(score => selectedIds.value.includes(score.id)))
const visibleSelected = computed(() => selected.value.filter(score => score.scoreVisible))
const visibleFiltered = computed(() => filtered.value.filter(score => score.scoreVisible))
const lastRecord = computed(() => records.value.find(score => score.id === workspace.data.lastScoreId))
const detail = computed(() => records.value.find(score => score.id === detailId.value))
const removing = computed(() => records.value.filter(score => removingIds.value?.includes(score.id)))
watch(() => props.initialKind, value => { kind.value = value })
watch([query, kind, mode, result, fromDate, toDate], () => { page.value = 1 })
watch(() => records.value.map(score => score.id), ids => {
  selectedIds.value = selectedIds.value.filter(id => ids.includes(id))
  if (!ids.includes(detailId.value)) detailId.value = ''
  if (removingIds.value && !removing.value.length) removingIds.value = null
})
function resetFilters() { query.value = ''; kind.value = ''; mode.value = ''; result.value = ''; fromDate.value = ''; toDate.value = '' }
function selectPage(event: Event) {
  selectedIds.value = (event.target as HTMLInputElement).checked ? [...new Set([...selectedIds.value, ...rows.value.map(score => score.id)])] : selectedIds.value.filter(id => !rows.value.some(score => score.id === id))
}
function exportRecords(items: WorkspaceScore[]) {
  const visible = items.filter(score => score.scoreVisible && score.studentId === student.value?.id)
  if (!visible.length) { simulator.notify('此选择没有可见成绩，隐藏分数和答案不会导出。', 'warning'); return }
  workspace.exportScores(visible, `本地学员成绩-${workspace.safeName(student.value?.name || '学员')}.csv`)
  if (visible.length !== items.length) simulator.notify(`已导出 ${visible.length} 条可见成绩；${items.length - visible.length} 条隐藏成绩未导出。`, 'info')
}
function remove() {
  workspace.removeScores(removing.value.map(score => score.id))
  selectedIds.value = selectedIds.value.filter(id => !removingIds.value?.includes(id))
  removingIds.value = null
}
</script>

<template>
  <section class="ws-stack learner-history" data-testid="learner-history" aria-label="本地学员历史成绩">
    <div class="ws-title-line"><h2>历史成绩 / 我的成绩单</h2><span class="ws-subtext">{{ student?.name }} · {{ student?.studentNo }} · 仅当前本地身份</span></div>
    <article v-if="lastRecord" class="ws-score-card latest-result" data-testid="history-latest-result">
      <div><h3>{{ lastRecord.reason === 'timeout' ? '时间到，已自动交卷' : '已保存本次提交' }} · {{ lastRecord.title }}</h3><p class="ws-subtext">{{ lastRecord.category }} · {{ formatDate(lastRecord.submittedAt) }} · 实际用时 {{ formatDuration(lastRecord.durationSeconds) }}</p></div>
      <div v-if="lastRecord.scoreVisible" class="ws-score-number">{{ lastRecord.score }}<small>/ {{ lastRecord.maxScore }} 分</small></div><span v-else class="badge badge-muted"><UiIcon name="LockKeyhole" :size="14" />成绩暂不可见</span>
      <button type="button" class="btn" data-testid="history-latest-detail" @click="detailId = lastRecord.id">{{ lastRecord.scoreVisible ? '查看本次成绩详情' : '查看提交记录' }}</button>
    </article>
    <div class="ws-metrics">
      <div class="ws-metric"><div class="ws-metric-label">本地提交记录<UiIcon name="History" :size="16" /></div><div class="ws-metric-value">{{ records.length }}<small>次</small></div><div class="ws-metric-foot">其中 {{ visibleRecords.length }} 次成绩可见</div></div>
      <div class="ws-metric"><div class="ws-metric-label">平均得分比例（可见成绩）</div><div class="ws-metric-value" data-testid="history-average">{{ average == null ? '—' : average }}<small v-if="average != null">%</small></div><div class="ws-metric-foot">按各次得分 / 总分归一，不含隐藏成绩</div></div>
      <div class="ws-metric"><div class="ws-metric-label">通过率（可见成绩）</div><div class="ws-metric-value">{{ passRate == null ? '—' : passRate }}<small v-if="passRate != null">%</small></div><div class="ws-metric-foot">隐藏成绩不参与统计及通过筛选</div></div>
      <div class="ws-metric"><div class="ws-metric-label">已提交学习累计用时</div><div class="ws-metric-value duration-metric">{{ formatDuration(totalDuration) }}</div><div class="ws-metric-foot">按各次真实会话用时累计</div></div>
    </div>
    <div class="ws-note"><UiIcon name="HardDrive" :size="16" />以下是本浏览器按实际答案或手动操作保存的记录，不从服务器获取。教师设置不可见的成绩不展示分数、正确率、通过结果、答案详情，也不用于错题复习、收藏快照或导出。</div>
    <section class="ws-panel">
      <header class="ws-panel-header"><h3>历史成绩记录</h3><span class="badge">筛选 {{ filtered.length }} / {{ records.length }} 条</span></header>
      <div class="ws-panel-body ws-stack">
        <div class="toolbar"><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索名称 / 类别" aria-label="历史成绩搜索" data-testid="history-search" /></div><select v-model="kind" class="field filter-field" aria-label="历史成绩题目类别" data-testid="history-kind"><option value="">全部题目类别</option><option value="theory">理论成绩</option><option value="operation">操作成绩</option></select><select v-model="mode" class="field filter-field" aria-label="历史成绩训练模式" data-testid="history-mode"><option value="">练习 / 考评</option><option value="practice">练习</option><option value="exam">考评</option></select><select v-model="result" class="field filter-field" aria-label="历史成绩结果筛选" data-testid="history-result"><option value="">全部结果</option><option value="passed">通过（可见）</option><option value="failed">未通过（可见）</option><option value="hidden">成绩暂不可见</option></select></div>
        <div class="ws-inline"><label class="date-filter">提交日期从<input v-model="fromDate" class="field" type="date" aria-label="成绩起始日期" data-testid="history-from-date" /></label><label class="date-filter">至<input v-model="toDate" class="field" type="date" aria-label="成绩截止日期" data-testid="history-to-date" /></label><button type="button" class="btn btn-sm" @click="resetFilters">清空筛选</button><span class="spacer" /><button type="button" class="btn btn-sm" data-testid="history-refresh" @click="simulator.notify('本地成绩列表已更新，未向服务器请求数据。')"><UiIcon name="RefreshCw" :size="14" />刷新本地记录</button></div>
        <p v-if="invalidRange" class="ws-form-error" role="status">起始日期不能晚于截止日期。</p>
        <div class="ws-table-wrap"><table class="data-table" aria-label="当前学员历史成绩列表" data-testid="history-table"><thead><tr><th class="select-column"><input type="checkbox" :checked="!!rows.length && rows.every(score => selectedIds.includes(score.id))" aria-label="选择当前页成绩" @change="selectPage" /></th><th>提交时间</th><th>名称 / 类别</th><th>得分 / 总分</th><th>正确率 / 得分点通过率</th><th>真实用时</th><th>结果</th><th>操作</th></tr></thead><tbody>
          <tr v-for="score in rows" :key="score.id" :class="{ 'ws-selected': selectedIds.includes(score.id) }" :data-testid="`score-row-${score.id}`"><td><input v-model="selectedIds" type="checkbox" :value="score.id" :aria-label="`选择成绩记录：${score.title}`" /></td><td class="ws-nowrap">{{ formatDate(score.submittedAt) }}<small class="ws-subtext submitted-method">{{ score.reason === 'timeout' ? '时间到自动交卷' : '手动提交' }}</small></td><td class="score-title"><strong>{{ score.title }}</strong><small class="ws-subtext submitted-method">{{ score.category }}{{ score.taskId ? ' · 任务提交' : ' · 自主学习' }}</small></td><td class="ws-nowrap"><strong v-if="score.scoreVisible">{{ score.score }} / {{ score.maxScore }}</strong><span v-else class="ws-subtext">成绩隐藏</span></td><td>{{ score.scoreVisible ? score.accuracy + '%' : '—' }}</td><td class="ws-nowrap">{{ formatDuration(score.durationSeconds) }}</td><td><span class="badge" :class="score.scoreVisible ? score.passed ? 'badge-success' : 'badge-danger' : 'badge-muted'">{{ score.scoreVisible ? score.passed ? '通过' : '未通过' : '暂不可见' }}</span></td><td><div class="ws-inline"><button type="button" class="btn btn-sm" :aria-label="`查看${score.title}的${score.scoreVisible ? '成绩详情' : '提交记录'}`" :data-testid="`score-detail-${score.id}`" @click="detailId = score.id">{{ score.scoreVisible ? '查看详情' : '提交记录' }}</button><button type="button" class="btn btn-sm btn-danger" :aria-label="`删除本地成绩记录：${score.title}`" @click="removingIds = [score.id]">删除</button></div></td></tr>
          <tr v-if="!rows.length"><td colspan="8" class="empty-state"><UiIcon name="History" :size="45" class="ws-empty-icon" /><p>{{ records.length ? '没有匹配的本地成绩记录。' : '尚未提交练习或考评，交卷后在这里查看真实成绩。' }}</p></td></tr>
        </tbody></table></div>
        <WorkspacePager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" />
        <div class="ws-inline"><span class="ws-subtext">已选 {{ selected.length }} 条；可导出 {{ visibleFiltered.length }} 条筛选内可见成绩</span><span class="spacer" /><button type="button" class="btn" :disabled="!visibleFiltered.length" data-testid="history-export" @click="exportRecords(filtered)"><UiIcon name="Download" :size="15" />导出筛选内可见成绩 CSV</button><button v-if="selected.length" type="button" class="btn" :disabled="!visibleSelected.length" data-testid="history-export-selected" @click="exportRecords(selected)">导出选中可见成绩</button><button v-if="selected.length" type="button" class="btn btn-danger" data-testid="history-delete-selected" @click="removingIds = [...selectedIds]">删除选中</button><button v-if="filtered.length" type="button" class="btn btn-sm btn-danger" data-testid="history-delete-filtered" @click="removingIds = filtered.map(score => score.id)">删除筛选内记录</button></div>
      </div>
    </section>
    <ScoreDetailModal v-if="detail" :record="detail" :return-page="returnPage" @close="detailId = ''" />
    <BaseModal v-if="removingIds && removing.length" title="删除本地历史记录" :width="510" :close-on-backdrop="false" @close="removingIds = null"><div class="ws-modal-content ws-stack" data-testid="history-delete-confirmation"><div class="ws-note danger">确定删除当前学员的 {{ removing.length }} 条本地历史记录？删除不可撤销，不影响正在作答的会话，也不向服务器发送任何删除请求。</div><p>建议先导出可见成绩。隐藏成绩不会通过导出或删除确认泄露分数及答案。</p></div><template #footer><button type="button" class="btn" @click="removingIds = null">取消</button><button type="button" class="btn btn-danger" data-testid="history-confirm-delete" @click="remove">确认删除本地记录</button></template></BaseModal>
  </section>
</template>

<style scoped>
.learner-history>.ws-title-line{margin-bottom:0}.learner-history h2{font-size:20px}.learner-history .ws-metrics{margin-bottom:0}.learner-history .ws-note{margin:0}.latest-result h3{font-size:15px;line-height:1.7;margin:0}.latest-result p{margin:6px 0 0}.duration-metric{font-size:23px;margin-top:12px}.filter-field{width:150px}.date-filter{display:flex;align-items:center;gap:9px;color:#6f849a;font-size:12px}.date-filter .field{width:165px}.select-column{width:35px}.submitted-method{display:block;margin-top:5px}.score-title{min-width:200px}.score-title strong{font-size:13px;font-weight:500}.ws-modal-content p{margin:0;line-height:1.9}
@media(max-width:600px){.filter-field{width:100%}.date-filter{width:100%}.date-filter .field{flex:1}.duration-metric{font-size:19px}.latest-result{gap:10px}}
</style>
