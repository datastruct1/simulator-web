<script setup lang="ts">
import { computed, ref } from 'vue'
import { sensorDefinitions, sensorRooms, type SensorDefinition } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import { clone, deviceView, findDevice, sensorConfiguration, nullableNumber, thresholdLabels, thresholdErrors, openDevice, downloadCsv, readJsonFile, errorMessage, checkSensorAlarms } from './toolHelpers'
import ToolTable from './ToolTable.vue'

interface SensorDraft extends Omit<SensorDefinition,'lowLow'|'low'|'high'|'highHigh'> {
  lowLow: string | number | null; low: string | number | null; high: string | number | null; highHigh: string | number | null; alarmEnabled: boolean
}
const { state, ensureDevice, setDevice, notify, record, downloadJson, closeModal } = useSimulator()
const rows = ref<SensorDraft[]>([])
const baseline = ref<Record<string,string>>({})
const query = ref('')
const room = ref('全部')
const type = ref('全部')
const selected = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()
const table = ref<InstanceType<typeof ToolTable>>()
const types = ['全部', ...new Set(sensorDefinitions.map(sensor => sensor.sensorType))]
const columns = [{key:'id',label:'位号与名称'},{key:'sensorType',label:'传感器类型'},{key:'range',label:'量程'},...thresholdLabels.map(threshold => ({key:threshold.key,label:threshold.label,numeric:true})),{key:'alarmEnabled',label:'报警'},{key:'current',label:'当前值',numeric:true},{key:'actions',label:'操作',sortable:false}]
function rowData(row: SensorDraft) { return { lowLow:nullableNumber(row.lowLow),low:nullableNumber(row.low),high:nullableNumber(row.high),highHigh:nullableNumber(row.highHigh),alarmEnabled:row.alarmEnabled } }
function loadRows() {
  rows.value = sensorDefinitions.map(sensor => ({...sensor,...sensorConfiguration(sensor)}))
  baseline.value = Object.fromEntries(rows.value.map(row => [row.id,JSON.stringify(rowData(row))]))
}
loadRows()
const dirty = computed(() => rows.value.filter(row => JSON.stringify(rowData(row)) !== baseline.value[row.id]))
const filtered = computed(() => rows.value.filter(row => (room.value === '全部' || row.room === room.value) && (type.value === '全部' || row.sensorType === type.value) && (!query.value || `${row.id} ${row.name}`.toLowerCase().includes(query.value.toLowerCase()))))
function problems(row: SensorDraft) { return thresholdErrors(rowData(row),row.min,row.max) }
function sourceValues(row: SensorDraft) { const source = sensorDefinitions.find(sensor => sensor.id === row.id)!; return {lowLow:source.lowLow,low:source.low,high:source.high,highHigh:source.highHigh} }
function thresholdsChanged(row: SensorDraft) {
  const previous = JSON.parse(baseline.value[row.id] || '{}') as Record<string,unknown>
  return thresholdLabels.some(threshold => nullableNumber(row[threshold.key]) !== previous[threshold.key])
}
function exactOriginal(row: SensorDraft) { const original = sourceValues(row); return thresholdLabels.every(threshold => nullableNumber(row[threshold.key]) === original[threshold.key]) }
function save(exit = false, selectedOnly = false) {
  const changes = dirty.value.filter(row => !selectedOnly || selected.value.includes(row.id))
  for (const row of changes) {
    const warnings = problems(row)
    if (warnings.length && thresholdsChanged(row) && !exactOriginal(row)) { notify(`${row.id}：${warnings.join(' ')}`,'warning'); return }
  }
  let saved = 0
  for (const row of changes) {
    const device = ensureDevice(row.id,'sensor',row.name)
    if (!device.enabled) { notify(`${row.id} 已锁定，须先复位才能保存参数。`,'warning'); continue }
    setDevice(device.id,{...rowData(row),kind:'sensor',name:row.name,room:row.room,sensorType:row.sensorType,unit:row.unit,min:row.min,max:row.max},false)
    record(`保存传感器报警参数 · 低低=${nullableNumber(row.lowLow) ?? '无'}，低=${nullableNumber(row.low) ?? '无'}，高=${nullableNumber(row.high) ?? '无'}，高高=${nullableNumber(row.highHigh) ?? '无'}，报警${row.alarmEnabled ? '启用' : '停用'}`,device.id)
    checkSensorAlarms(device)
    baseline.value[row.id] = JSON.stringify(rowData(row))
    saved++
  }
  state.settings.sensorOverrides = Object.fromEntries(rows.value.map(row => [row.id,{...rowData(row),min:row.min,max:row.max,unit:row.unit}]))
  notify(saved ? `已保存 ${saved} 个传感器的更改，并写入本地设置。` : '传感器参数没有未保存更改。',saved ? 'success' : 'info')
  if (exit && !dirty.value.length) closeModal()
}
function restoreDefaults() {
  rows.value = sensorDefinitions.map(sensor => ({...sensor,alarmEnabled:true}))
  notify('编辑区已恢复原 WPF 量程和阈值；点击保存后生效。','info')
}
function fixRange(row: SensorDraft) {
  let previous = row.min
  for (const threshold of thresholdLabels) {
    const value = nullableNumber(row[threshold.key])
    if (value === null) continue
    row[threshold.key] = Math.max(previous,Math.min(row.max,Math.max(row.min,value)))
    previous = Number(row[threshold.key])
  }
  notify(`${row.id} 编辑阈值已按当前量程和顺序修正，保存后生效。`,'info')
}
function clearSearch() { query.value='';room.value='全部';type.value='全部';table.value?.resetPage() }
function exportJson() { downloadJson('传感器设置.json',{schemaVersion:1,type:'sensor-settings',sensors:rows.value.map(row => ({id:row.id,name:row.name,room:row.room,min:row.min,max:row.max,unit:row.unit,...rowData(row)}))});record('导出传感器设置 JSON') }
function exportCsv() { downloadCsv('传感器设置.csv',['位号','名称','所在处所','传感器类型','量程下限','量程上限','单位','低低切断或投入','低报警点','高报警点','高高切断','报警启用','当前值'],filtered.value.map(row => [row.id,row.name,row.room,row.sensorType,row.min,row.max,row.unit,...thresholdLabels.map(threshold => nullableNumber(row[threshold.key])),row.alarmEnabled ? '是' : '否',findDevice(row.id)?.value ?? 0]));record('导出传感器参数 CSV') }
async function importJson(event: Event) {
  try {
    const raw = await readJsonFile(event)
    if (raw === undefined) return
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as any).type !== 'sensor-settings' || (raw as any).schemaVersion !== 1 || !Array.isArray((raw as any).sensors)) throw new Error('请选择本页面导出的传感器设置 JSON。')
    const incoming = (raw as any).sensors as Record<string,unknown>[]
    const patches: {row:SensorDraft;patch:Record<string,unknown>}[] = []
    for (const item of incoming) {
      if (!item || typeof item.id !== 'string') throw new Error('传感器编号无效。')
      const row = rows.value.find(sensor => sensor.id.toLowerCase() === String(item.id).toLowerCase())
      if (!row) throw new Error(`未知传感器 ${item.id}，未修改编辑区。`)
      const patch: Record<string,unknown> = {}
      for (const threshold of thresholdLabels) { const value = item[threshold.key]; if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${row.id} 阈值必须是数字或 null。`); patch[threshold.key] = value }
      if (typeof item.alarmEnabled !== 'boolean') throw new Error(`${row.id} 报警启用字段无效。`)
      patch.alarmEnabled = item.alarmEnabled
      patches.push({row,patch})
    }
    for (const {row,patch} of patches) Object.assign(row,patch)
    notify(`已读取 ${patches.length} 个传感器配置到编辑区，请校验后保存。`,'success')
  } catch (error) { notify(errorMessage(error),'error') }
}
</script>

<template>
  <div class="sensor-settings"><div class="sensor-heading"><div><h3>传感器报警参数设置</h3><p>原量程与阈值保留 · 共 {{ sensorDefinitions.length }} 个传感器 · 空白阈值表示不启用</p></div><span v-if="dirty.length" class="badge modified">{{ dirty.length }} 个设备未保存</span><span v-else class="badge">参数与中央状态一致</span></div><div class="toolbar"><select v-model="room" class="field" aria-label="所在处所"><option v-for="name in sensorRooms" :key="name">{{ name }}</option></select><select v-model="type" class="field" aria-label="传感器类型"><option v-for="name in types" :key="name">{{ name }}</option></select><input v-model="query" class="field search" placeholder="搜索位号与名称"><button class="btn" type="button" @click="clearSearch">清空搜索</button><button class="btn" type="button" @click="loadRows">刷新 / 撤销编辑</button></div><div class="parameter-note">低低 ≤ 低 ≤ 高 ≤ 高高；修改阈值须处于量程内。少数原源码阈值存在越量程情况，黄色标记会保留并提示，不自动改写。</div><ToolTable ref="table" :rows="filtered" :columns="columns" :page-size="10" selectable default-sort="id" @select="selected=$event"><template #cell-id="{row}"><div class="sensor-name"><strong>{{ row.id }}</strong><span>{{ row.name }}</span></div></template><template #cell-range="{row}"><span class="range-text">{{ row.min }}～{{ row.max }}<small>{{ row.unit }}</small></span><button v-if="problems(row).length" class="range-warning" type="button" :title="problems(row).join(' ')" @click="fixRange(row)">⚠ 修正</button></template><template v-for="threshold in thresholdLabels" :key="threshold.key" #[`cell-${threshold.key}`]="{row}"><input v-model="row[threshold.key]" class="field threshold-input" type="number" step="any" :aria-label="`${row.id} ${threshold.label}`" placeholder="—"></template><template #cell-alarmEnabled="{row}"><input v-model="row.alarmEnabled" type="checkbox" :aria-label="`${row.id} 启用报警`"></template><template #cell-current="{row}"><span class="reading">{{ (findDevice(row.id)?.value ?? 0).toFixed(2) }}</span></template><template #cell-actions="{row}"><button class="btn row-button" type="button" @click="openDevice(row.id,'sensor')">数值 / 趋势</button></template></ToolTable><div class="settings-footer"><div class="footer-actions"><button class="btn" type="button" @click="exportJson">导出设置</button><button class="btn" type="button" @click="exportCsv">导出 CSV</button><button class="btn" type="button" @click="fileInput?.click()">加载配置</button><button class="btn" type="button" @click="restoreDefaults">恢复原参数</button><input ref="fileInput" class="hidden-file" type="file" accept=".json,application/json" @change="importJson"></div><button class="btn" type="button" @click="closeModal">取消</button><button class="btn" type="button" :disabled="!selected.length" @click="save(false,true)">保存选中</button><button class="btn btn-primary" type="button" @click="save()">保存</button><button class="btn btn-primary" type="button" @click="save(true)">保存并关闭</button></div></div>
</template>

<style scoped>
.sensor-settings { color:#405e75; }.sensor-heading { display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:17px; }.sensor-heading h3 { margin:0 0 8px;color:#3f789e;font-size:18px; }.sensor-heading p { margin:0;color:#93a7b5;font-size:11px; }.modified { color:#b38a50;background:#fff5e3; }.toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px; }.field { padding:8px 10px;border:1px solid #d9e4ee;background:white;border-radius:6px;color:#4c6c83;font-size:12px;box-sizing:border-box; }.search { flex:1;min-width:180px; }.toolbar .btn { padding:7px 9px;font-size:11px; }.parameter-note { padding:11px 14px;border:1px solid #e6dbc4;background:#fffaf0;border-radius:7px;color:#a2906e;font-size:10px;line-height:1.8;margin-bottom:15px; }.sensor-name { display:flex;flex-direction:column;gap:4px;min-width:160px; }.sensor-name strong { color:#2c779f;font-size:12px; }.sensor-name span { font-size:10px;color:#849eb0; }.range-text { display:flex;flex-direction:column;gap:4px;font-size:11px;white-space:nowrap;color:#7190a5; }.range-text small { color:#97adbc;font-size:10px; }.range-warning { border:0;background:none;color:#be9453;padding:4px 0;cursor:pointer;font-size:10px;white-space:nowrap; }.threshold-input { width:89px;padding:7px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums; }.threshold-input::placeholder { color:#b4c2cd; }.reading { color:#30799e;white-space:nowrap;font-size:12px; }.row-button { padding:5px 8px;font-size:10px;white-space:nowrap; }input[type=checkbox] { width:16px;height:16px;accent-color:#4d91b8; }.settings-footer { display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:19px; }.footer-actions { margin-right:auto;display:flex;gap:7px;flex-wrap:wrap; }.settings-footer .btn { font-size:11px;padding:8px 10px; }.hidden-file { display:none; }
</style>
