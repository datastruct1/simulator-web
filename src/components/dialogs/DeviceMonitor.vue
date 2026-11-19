<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSimulator } from '../../state/simulator'
import { legendGroups, sensorRooms, valveDefinitions } from '../../data/tools'
import type { DeviceState } from '../../types/simulator'
import { clone, deviceView, deviceStatus, kindLabel, openDevice, locateDevice, downloadCsv, devicePage } from './toolHelpers'
import { sampleHistory } from './history'
import ToolTable from './ToolTable.vue'
import DeviceVisual from './DeviceVisual.vue'

const { state, setDevice, record, notify } = useSimulator()
const activeTab = ref('设备监测')
const tabs = ['设备监测','设备列表','图示说明']
const search = ref('')
const kind = ref('全部')
const status = ref('全部')
const room = ref('全部')
const autoRefresh = ref(true)
const frozenRows = ref<DeviceState[]>([])
const selected = ref<string[]>([])
const refreshedAt = ref(new Date().toLocaleTimeString('zh-CN',{hour12:false}))
const table = ref<InstanceType<typeof ToolTable>>()
const legend = ref<{ name: string; color?: string; image?: string } | null>(null)
const liveRows = computed(() => [...new Map(Object.values(state.devices).map(device => [device.id,deviceView(device.id)])).values()])
watch(autoRefresh, value => { if (!value) frozenRows.value = clone(liveRows.value); else sampleHistory(true) })
const baseRows = computed(() => autoRefresh.value ? liveRows.value : frozenRows.value)
const kinds = computed(() => ['全部', ...new Set(baseRows.value.map(device => device.kind))])
const filtered = computed(() => baseRows.value.filter(device => {
  if (kind.value !== '全部' && device.kind !== kind.value) return false
  if (room.value !== '全部' && String(device.room || '') !== room.value) return false
  if (status.value === '正常运行' && !device.working) return false
  if (status.value === '运行异常' && !device.error) return false
  if (status.value === '已锁定' && device.enabled) return false
  if (status.value === '停止 / 关闭' && (device.working || device.value > 0)) return false
  return !search.value || `${device.id} ${device.name} ${kindLabel(device.kind)}`.toLowerCase().includes(search.value.toLowerCase())
}).map(device => ({...device,status:deviceStatus(device),kindText:kindLabel(device.kind),reading:`${device.value.toFixed(2)} ${device.unit}`,roomText:device.room || devicePage(device)})))
const valveRows = computed(() => valveDefinitions.filter(valve => !search.value || `${valve.id} ${valve.name} ${valve.valveType} ${valve.section}`.toLowerCase().includes(search.value.toLowerCase())).map(valve => ({...valve, valveType: valve.valveType || valve.section.replace(/^[一二三四]、/,''), reading: `${deviceView(valve.id).value.toFixed(1)}%` })))
const counts = computed(() => ({ total: baseRows.value.length, running: baseRows.value.filter(device => device.working).length, faults: baseRows.value.filter(device => device.error).length, sensors: baseRows.value.filter(device => device.kind === 'sensor').length }))
const monitorColumns = [{ key:'id',label:'编号' },{ key:'name',label:'名称' },{ key:'kindText',label:'类型' },{ key:'roomText',label:'所在处所' },{ key:'value',label:'实时值',numeric:true },{ key:'status',label:'运行状态' },{ key:'actions',label:'操作',sortable:false }]
const valveColumns = [{ key:'id',label:'编号' },{ key:'name',label:'名称' },{ key:'valveType',label:'类型' },{ key:'size',label:'阀门通径' },{ key:'pressure',label:'压力等级' },{ key:'material',label:'材质' },{ key:'certificate',label:'认证' },{ key:'reading',label:'当前开度' },{ key:'actions',label:'操作',sortable:false }]
watch([search,kind,status,room,activeTab], () => { table.value?.resetPage(); table.value?.clearSelection() })
function refresh() { frozenRows.value = clone(liveRows.value); sampleHistory(true); refreshedAt.value = new Date().toLocaleTimeString('zh-CN',{hour12:false}); notify(`已刷新 ${liveRows.value.length} 个设备的中央状态。`,'success') }
function clearSearch() { search.value = ''; kind.value = '全部'; room.value = '全部'; status.value = '全部'; refresh() }
function bulk(working: boolean) {
  let changed = 0
  for (const id of selected.value) {
    const device = deviceView(id)
    if (!device.enabled || device.error || ['sensor','gauge','digital-gauge','tank','water-tank'].includes(device.kind)) continue
    if (!setDevice(id,{working,value:working ? 100 : 0,startRequested:working})) continue
    record(`设备列表批量${working ? '启动 / 开启' : '停止 / 关闭'}`,id)
    changed++
  }
  notify(`已${working ? '启动' : '停止'} ${changed} 个可操作设备${changed < selected.value.length ? '；传感器、储罐及故障 / 锁定设备不执行启停。' : '。'}`,changed ? 'success' : 'warning')
  refresh()
}
function exportData() {
  if (activeTab.value === '设备列表') downloadCsv('原WPF设备列表.csv', ['编号','名称','类型','阀门通径','压力等级','材质','认证','当前开度'],valveRows.value.map(row => [row.id,row.name,row.valveType,row.size,row.pressure,row.material,row.certificate,row.reading]))
  else downloadCsv('设备监测.csv',['编号','名称','类型','所在处所','实时值','单位','运行状态','控制模式'],filtered.value.map(row => [row.id,row.name,row.kindText,row.roomText,row.value,row.unit,row.status,row.mode]))
  record('导出筛选后的设备列表 CSV')
}
</script>

<template>
  <div class="monitor-dialog"><div class="monitor-counters"><div><small>监测设备</small><strong>{{ counts.total }}</strong></div><div class="green"><small>正常运行</small><strong>{{ counts.running }}</strong></div><div class="orange"><small>运行异常</small><strong>{{ counts.faults }}</strong></div><div><small>传感器</small><strong>{{ counts.sensors }}</strong></div></div><nav class="tabs monitor-tabs"><button v-for="tab in tabs" :key="tab" class="tab" :class="{active:activeTab===tab}" type="button" @click="activeTab=tab">{{ tab }}</button><label class="auto-refresh"><input v-model="autoRefresh" type="checkbox">自动刷新</label></nav><div v-if="activeTab !== '图示说明'" class="toolbar"><input v-model="search" class="field search" placeholder="搜索编号、名称或类型" aria-label="搜索设备"><template v-if="activeTab === '设备监测'"><select v-model="kind" class="field" aria-label="设备类型"><option v-for="value in kinds" :key="value" :value="value">{{ value === '全部' ? '全部类型' : kindLabel(value) }}</option></select><select v-model="room" class="field" aria-label="所在处所"><option v-for="value in sensorRooms" :key="value">{{ value }}</option></select><select v-model="status" class="field" aria-label="运行状态"><option>全部</option><option>正常运行</option><option>运行异常</option><option>已锁定</option><option>停止 / 关闭</option></select></template><button class="btn" type="button" @click="clearSearch">清除</button><button class="btn" type="button" @click="refresh">刷新</button><button class="btn" type="button" @click="exportData">导出 CSV</button></div>
    <template v-if="activeTab === '设备监测'"><div class="bulk-toolbar"><span>中央状态 · 最近手动刷新 {{ refreshedAt }}<span v-if="!autoRefresh"> · 已冻结显示</span></span><button class="btn btn-success" type="button" :disabled="!selected.length" @click="bulk(true)">选中启动</button><button class="btn btn-danger" type="button" :disabled="!selected.length" @click="bulk(false)">选中停止</button></div><ToolTable ref="table" :rows="filtered" :columns="monitorColumns" selectable default-sort="id" @select="selected=$event"><template #cell-value="{row}"><span class="reading">{{ row.value.toFixed(2) }}<small>{{ row.unit }}</small></span></template><template #cell-status="{row}"><span class="badge" :class="row.error || !row.enabled ? 'error' : row.working ? 'running' : ''">{{ row.status }}</span></template><template #cell-actions="{row}"><div class="row-actions"><button class="btn" type="button" @click.stop="openDevice(row.id,row.kind)">操作</button><button class="btn" type="button" @click.stop="locateDevice(row.id)">高亮</button></div></template></ToolTable></template>
    <template v-else-if="activeTab === '设备列表'"><p class="source-note">原 WPF 设备清单 · 手动阀、气动阀、气动调节阀、安全阀共 {{ valveDefinitions.length }} 项 · 参数来自 valve.xlsx。</p><ToolTable ref="table" :rows="valveRows" :columns="valveColumns" default-sort="id"><template #cell-actions="{row}"><button class="btn row-button" type="button" @click="openDevice(row.id,'valve')">调节</button></template></ToolTable></template>
    <div v-else class="legend-content"><section v-for="group in legendGroups" :key="group.title" class="legend-card card"><h3>{{ group.title }}</h3><div class="legend-grid"><button v-for="entry in group.entries" :key="entry.name" class="legend-item" :class="{chosen:legend?.name===entry.name}" type="button" @click="legend=entry"><div v-if="entry.color" class="pipe-symbol" :style="{borderColor:entry.color}"><span :style="{background:entry.color}"/></div><DeviceVisual v-else :kind="entry.name === '泵' ? 'pump' : entry.name.includes('传感器') || entry.name.includes('探测') ? 'sensor' : entry.name.includes('主') ? 'engine' : entry.name.includes('阀') ? 'valve' : entry.name === '氮气瓶' ? 'nitrogen-cylinder' : entry.name === '水箱' ? 'water-tank' : 'tank'" :source="entry.image" :value="30"/><span>{{ entry.name }}</span></button></div></section><div v-if="legend" class="legend-detail card"><strong>{{ legend.name }}</strong><p>{{ legend.color ? `工艺图中此颜色标识${legend.name}管路介质；流动时沿管路显示动态流向。` : `${legend.name}使用原 WPF 元件图示。点击工艺图中的对应设备可打开操作、参数和历史趋势窗口。` }}</p><button class="btn" type="button" @click="legend=null">收起说明</button></div></div>
  </div>
</template>

<style scoped>
.monitor-dialog { color:#405e75; }.monitor-counters { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:17px; }.monitor-counters > div { padding:15px 18px;background:#f2f8fd;border:1px solid #dce9f3;border-radius:9px;display:flex;justify-content:space-between;align-items:center; }.monitor-counters small { color:#8ca1b2;font-size:11px; }.monitor-counters strong { font-size:25px;color:#4283ac; }.monitor-counters .green strong { color:#4f9d85; }.monitor-counters .orange strong { color:#c48b59; }.monitor-tabs { display:flex;gap:4px;padding:0;border-bottom:1px solid #dce7f1;margin-bottom:17px; }.tab { border:none;background:none;padding:10px 17px;border-bottom:2px solid transparent;cursor:pointer;color:#86a0b3;font:inherit;font-size:13px; }.tab.active { color:#2a7dae;border-color:#2a7dae;background:#f2f8fd; }.auto-refresh { margin-left:auto;display:flex;gap:6px;align-items:center;font-size:11px;color:#91a6b6; }.auto-refresh input { accent-color:#4188b5; }.toolbar { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:13px;align-items:center; }.toolbar .field { padding:8px 9px;border:1px solid #d8e4ee;border-radius:6px;font-size:12px;color:#5e7b90;background:white; }.search { flex:1;min-width:160px; }.toolbar .btn { font-size:11px;padding:7px 9px; }.bulk-toolbar { display:flex;gap:7px;align-items:center;margin-bottom:12px;font-size:10px;color:#92a6b4; }.bulk-toolbar > span { margin-right:auto; }.bulk-toolbar .btn { font-size:10px;padding:6px 8px; }.reading { color:#2b709b;font-variant-numeric:tabular-nums; }.reading small { margin-left:5px;color:#8da3b3;font-size:10px; }.badge { white-space:nowrap; }.badge.error { color:#bb7464;background:#fff1eb; }.badge.running { color:#459b7c;background:#eef8f3; }.row-actions { display:flex;gap:4px; }.row-actions .btn,.row-button { padding:4px 7px;font-size:10px; }.source-note { color:#96a9b8;font-size:11px; }.legend-card { padding:20px;border:1px solid #dce8f2;border-radius:10px;background:white;margin-bottom:16px; }.legend-card h3 { color:#487b9b;font-size:15px;margin:0 0 15px; }.legend-grid { display:grid;grid-template-columns:repeat(5,1fr);gap:12px; }.legend-item { display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:8px;padding:14px 8px;border:1px solid #e1eaf2;border-radius:8px;background:#f8fbfd;cursor:pointer;font-size:12px;color:#6e8ba1; }.legend-item.chosen { border-color:#7eafd0;background:#edf7fd; }.legend-item :deep(.device-visual) { height:68px;min-height:68px; }.pipe-symbol { height:28px;border:2px solid;width:85%;border-radius:5px;display:grid;align-items:center;margin:22px 0; }.pipe-symbol span { height:8px;display:block;opacity:.7; }.legend-detail { padding:16px 20px;border:1px solid #c7e0ef;border-radius:8px;font-size:12px;background:#f3f9fd; }.legend-detail p { color:#7894a8;line-height:1.8; }.legend-detail .btn { font-size:11px; }
@media(max-width:700px) { .monitor-counters {grid-template-columns:1fr 1fr;}.legend-grid {grid-template-columns:repeat(3,1fr);}.bulk-toolbar {flex-wrap:wrap;}.bulk-toolbar > span {flex-basis:100%;} }
</style>
