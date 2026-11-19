<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSimulator } from '../../state/simulator'
import { downloadCsv } from './toolHelpers'
import ToolTable from './ToolTable.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ type?: string }>(), { type: '' })
const { state, acknowledgeAlarm, record, notify } = useSimulator()
const views = [{ key: 'logs', label: '系统日志' }, { key: 'operations', label: '操作记录' }, { key: 'alerts', label: '报警历史' }]
const requested = props.type || String(state.modal?.type || 'logs')
const view = ref(views.some(item => item.key === requested) ? requested : 'logs')
const search = ref('')
const level = ref('全部')
const status = ref('全部')
const confirming = ref('')
const table = ref<InstanceType<typeof ToolTable>>()

interface LogRow { id: string; time: string; user: string; action: string; deviceId: string; level: string; changes: string }
interface AlarmRow { id: string; time: string; deviceId: string; level: string; message: string; status: string; acknowledged: boolean }
const logRows = computed<LogRow[]>(() => state.logs.map(log => ({
  id: log.id, time: log.time, user: log.user, action: log.action,
  deviceId: log.deviceId || '—', level: log.level || '信息',
  changes: Object.entries(log.changes || {}).map(([key, value]) => `${({ value: '数值 / 开度', working: '运行', enabled: '启用', error: '故障' } as Record<string, string>)[key] || key}：${log.before?.[key as keyof typeof log.before] ?? '—'} → ${value}`).join('；'),
})))
const operationRows = computed(() => logRows.value.filter(row => row.deviceId !== '—' && row.changes))
const alarmRows = computed<AlarmRow[]>(() => state.alarms.map(alarm => ({
  id: alarm.id, time: alarm.time, deviceId: alarm.deviceId || '—', level: alarm.level,
  message: alarm.message, status: alarm.acknowledged ? '已确认' : '未确认', acknowledged: alarm.acknowledged,
})))
const baseRows = computed<Array<LogRow | AlarmRow>>(() => view.value === 'alerts' ? alarmRows.value : view.value === 'operations' ? operationRows.value : logRows.value)
const levels = computed(() => ['全部', ...new Set(baseRows.value.map(row => row.level).filter(Boolean))])
const filtered = computed(() => baseRows.value.filter(row => {
  if (level.value !== '全部' && row.level !== level.value) return false
  if (view.value === 'alerts' && status.value !== '全部' && (row as AlarmRow).status !== status.value) return false
  const haystack = Object.values(row).join(' ').toLowerCase()
  return !search.value || haystack.includes(search.value.toLowerCase())
}))
const counts = computed(() => ({
  logs: state.logs.length,
  operations: operationRows.value.length,
  active: state.alarms.filter(alarm => !alarm.acknowledged).length,
  acked: state.alarms.filter(alarm => alarm.acknowledged).length,
}))
const columns = computed(() => view.value === 'alerts'
  ? [{ key: 'time', label: '时间' }, { key: 'deviceId', label: '设备编号' }, { key: 'level', label: '级别' }, { key: 'message', label: '告警内容' }, { key: 'status', label: '确认状态' }, { key: 'actions', label: '操作', sortable: false }]
  : [{ key: 'time', label: '时间' }, { key: 'user', label: '操作人' }, { key: 'action', label: '操作内容' }, { key: 'deviceId', label: '设备编号' }, ...(view.value === 'operations' ? [{ key: 'changes', label: '实际手动变更（前 → 后）' }] : []), { key: 'level', label: '级别' }])
const viewLabel = computed(() => views.find(item => item.key === view.value)?.label || '系统日志')
watch(view, () => { level.value = '全部'; status.value = '全部'; search.value = ''; confirming.value = ''; table.value?.resetPage() })

function confirmAlarm(row: AlarmRow) {
  if (row.acknowledged) { notify('该告警已经确认。', 'warning'); return }
  acknowledgeAlarm(row.id)
  notify('告警已确认。', 'success')
}
function deleteAlarm(row: AlarmRow) {
  state.alarms = state.alarms.filter(alarm => alarm.id !== row.id)
  record(`删除告警记录：${row.message}`, row.deviceId === '—' ? '' : row.deviceId)
  notify('告警记录已删除。', 'success')
}
function acknowledgeAll() {
  const pending = state.alarms.filter(alarm => !alarm.acknowledged)
  if (!pending.length) { notify('没有未确认的告警。', 'warning'); return }
  for (const alarm of state.alarms) alarm.acknowledged = true
  record(`批量确认告警 ${pending.length} 条`)
  notify(`已确认 ${pending.length} 条告警。`, 'success')
}
function deleteAcknowledged() {
  const removed = state.alarms.filter(alarm => alarm.acknowledged).length
  if (!removed) { notify('没有已确认的告警可删除。', 'warning'); confirming.value = ''; return }
  state.alarms = state.alarms.filter(alarm => !alarm.acknowledged)
  record(`删除已确认告警 ${removed} 条`)
  notify(`已删除 ${removed} 条已确认告警。`, 'success')
  confirming.value = ''
}
function clearAlarms() {
  const removed = state.alarms.length
  state.alarms = []
  record(`清空告警记录 ${removed} 条（本地操作）`)
  notify('告警记录已清空。', 'success')
  confirming.value = ''
}
function exportData() {
  if (view.value === 'alerts') downloadCsv(`报警历史_${Date.now()}.csv`, ['时间', '设备编号', '级别', '告警内容', '确认状态'], filtered.value.map(row => { const alarm = row as AlarmRow; return [alarm.time, alarm.deviceId, alarm.level, alarm.message, alarm.status] }))
  else if (view.value === 'operations') downloadCsv(`操作记录_${Date.now()}.csv`, ['时间', '操作人', '设备编号', '操作内容', '实际变更（前 → 后）', '级别'], filtered.value.map(row => { const log = row as LogRow; return [log.time, log.user, log.deviceId, log.action, log.changes, log.level] }))
  else downloadCsv(`${viewLabel.value}_${Date.now()}.csv`, ['时间', '操作人', '操作内容', '设备编号', '级别'], filtered.value.map(row => { const log = row as LogRow; return [log.time, log.user, log.action, log.deviceId, log.level] }))
  record(`导出${viewLabel.value} CSV（${filtered.value.length} 条）`)
  notify(`已导出 ${filtered.value.length} 条${viewLabel.value}。`, 'success')
}
function clearFilters() { search.value = ''; level.value = '全部'; status.value = '全部'; confirming.value = '' }
</script>

<template>
  <div class="record-tools">
    <div class="record-counters">
      <div><small>系统日志</small><strong>{{ counts.logs }}</strong></div>
      <div class="green"><small>设备操作记录</small><strong>{{ counts.operations }}</strong></div>
      <div class="orange"><small>未确认告警</small><strong>{{ counts.active }}</strong></div>
      <div><small>已确认告警</small><strong>{{ counts.acked }}</strong></div>
    </div>
    <nav class="tabs record-tabs"><button v-for="item in views" :key="item.key" :class="{ active: view === item.key }" type="button" @click="view = item.key">{{ item.label }}</button></nav>
    <div class="toolbar">
      <input v-model="search" class="field search" placeholder="搜索时间、操作人、内容或设备编号" aria-label="搜索记录">
      <select v-model="level" class="field" aria-label="级别筛选"><option v-for="item in levels" :key="item" :value="item">{{ item === '全部' ? '全部级别' : item }}</option></select>
      <select v-if="view === 'alerts'" v-model="status" class="field" aria-label="确认状态筛选"><option>全部</option><option>未确认</option><option>已确认</option></select>
      <button class="btn" type="button" @click="clearFilters">清除筛选</button>
      <button class="btn" type="button" @click="exportData" :disabled="!filtered.length"><UiIcon name="Download" :size="14" />导出 CSV</button>
    </div>

    <template v-if="view === 'alerts'">
      <div class="alarm-toolbar">
        <span>共 {{ filtered.length }} 条筛选结果 · 全部为本地真实告警</span>
        <button class="btn btn-sm" type="button" @click="acknowledgeAll"><UiIcon name="CheckCheck" :size="13" />确认全部</button>
        <button class="btn btn-sm" type="button" @click="confirming = 'acked'"><UiIcon name="Trash2" :size="13" />删除已确认</button>
        <button class="btn btn-sm btn-danger" type="button" @click="confirming = 'clear'"><UiIcon name="Trash2" :size="13" />清空全部</button>
      </div>
      <div v-if="confirming" class="confirm-strip">
        <span>{{ confirming === 'clear' ? `确认清空全部 ${state.alarms.length} 条告警记录？` : '确认删除所有已确认的告警记录？' }}</span>
        <button class="btn btn-danger btn-sm" type="button" @click="confirming === 'clear' ? clearAlarms() : deleteAcknowledged()">确认</button>
        <button class="btn btn-sm" type="button" @click="confirming = ''">取消</button>
      </div>
      <ToolTable ref="table" :rows="filtered" :columns="columns" empty-text="没有符合条件的告警记录。">
        <template #cell-level="{ row }"><span class="badge" :class="row.level === '严重' ? 'badge-danger' : row.level === '警告' ? 'badge-warning' : 'badge-muted'">{{ row.level }}</span></template>
        <template #cell-status="{ row }"><span class="badge" :class="row.acknowledged ? 'badge-success' : 'badge-warning'">{{ row.status }}</span></template>
        <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" :disabled="row.acknowledged" @click="confirmAlarm(row)">确认</button><button class="btn btn-sm btn-danger" type="button" @click="deleteAlarm(row)">删除</button></div></template>
      </ToolTable>
    </template>
    <ToolTable v-else ref="table" :rows="filtered" :columns="columns" :empty-text="view === 'operations' ? '还没有设备操作记录，操作设备后会记录在这里。' : '当前没有系统日志。'">
      <template #cell-level="{ row }"><span class="badge" :class="row.level === '严重' ? 'badge-danger' : row.level === '警告' ? 'badge-warning' : row.level === '错误' ? 'badge-danger' : 'badge-muted'">{{ row.level }}</span></template>
    </ToolTable>
    <p class="foot-note">{{ view === 'operations' ? '操作记录只显示绑定设备的日志条目（与“系统日志”中的全局设置 / 提示记录区分）。' : view === 'logs' ? '系统日志来自当前浏览器会话的真实操作，最近 5000 条保存在内存中，刷新页面后清空。' : '告警历史和“设备监测 / 异常配置”共用同一份本地告警数据；清空操作立即生效且不可撤销。' }}</p>
  </div>
</template>

<style scoped>
.record-tools { color: #405e75; }
.record-counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.record-counters > div { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; background: #f2f8fd; border: 1px solid #dce9f3; border-radius: 9px; }
.record-counters small { color: #8ca1b2; font-size: 11px; }
.record-counters strong { color: #4283ac; font-size: 23px; }
.record-counters .green strong { color: #4f9d85; }
.record-counters .orange strong { color: #c48b59; }
.record-tabs { margin-bottom: 14px; }
.toolbar .field { flex: 0 0 auto; min-width: 120px; width: auto; }
.toolbar .search { flex: 1; min-width: 210px; }
.toolbar .btn { display: inline-flex; align-items: center; gap: 5px; }
.alarm-toolbar { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; font-size: 11px; color: #8ba0b0; }
.alarm-toolbar > span { margin-right: auto; }
.alarm-toolbar .btn { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; }
.confirm-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; padding: 10px 12px; border: 1px solid #ecc5c8; border-radius: 7px; background: #fff6f6; font-size: 11px; color: #a25058; }
.confirm-strip span { margin-right: auto; }
.row-actions { display: flex; gap: 5px; }
.row-actions .btn { font-size: 10px; padding: 4px 7px; }
.foot-note { margin: 12px 0 0; color: #8ba0b0; font-size: 11px; line-height: 1.7; }
@media (max-width: 720px) { .record-counters { grid-template-columns: 1fr 1fr; } }
</style>
