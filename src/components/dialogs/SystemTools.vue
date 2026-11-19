<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { pages, workflows } from '../../data/catalog'
import { sensorDefinitions } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import type { FlowStep } from '../../types/simulator'
import { clone, deviceStatus, deviceView, errorMessage, kindLabel, locateDevice, numberValue, openDevice, readJsonFile } from './toolHelpers'
import TrendChart from '../common/TrendChart.vue'
import ToolTable from './ToolTable.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ mode?: string }>(), { mode: '' })
const {
  state, currentFlow, currentStep, setDevice, ensureDevice, record, notify, navigate, openModal, closeModal,
  startFlow, nextStep, stopFlow, setSpeed, tickSimulation, loadSnapshot, downloadJson, clearFault,
} = useSimulator()
const mode = computed(() => props.mode || String(state.modal?.type || 'speed'))

/* ------------------------------- 速度控制 ------------------------------- */
const speed = ref(state.speed || 1)
const speedPresets = [{ value: 0.1, label: '拟真 0.1x' }, { value: 1, label: '正常 1x' }, { value: 100, label: '最大 100x' }]
function applySpeed(value: number) {
  const next = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 1))
  speed.value = next
  setSpeed(next)
}
function togglePause() {
  if (state.paused) {
    state.paused = false
    if (state.speed <= 0) applySpeed(1)
    record('恢复仿真运行')
    notify('仿真已继续。', 'success')
  } else {
    state.paused = true
    record('暂停仿真运行')
    notify('仿真已暂停。', 'warning')
  }
}
function advance(seconds: number) {
  if (state.paused || state.speed <= 0) { notify('仿真已暂停，请先继续运行或设置大于 0 的倍速。', 'warning'); return }
  tickSimulation(seconds)
  notify(`已手动推进 ${seconds} 秒仿真时间。`, 'success')
}

/* -------------------------------- 操作提示 ------------------------------- */
const hintSteps = computed<FlowStep[]>(() => currentFlow.value?.steps || [])
function stepDeviceId(step: FlowStep) { return step.deviceId?.split(/\s+/).filter(Boolean)[0] || '' }
function openStepDevice(step: FlowStep) {
  const id = stepDeviceId(step)
  if (!id) { notify('该步骤没有绑定单个设备，请按描述在工艺图中操作。', 'warning'); return }
  openDevice(id)
}
function pageTitle(id: string) { return pages.find(page => page.id === id)?.title || id }
function startHintFlow(flowId: string) { startFlow(flowId) }

/* -------------------------------- 系统介绍 ------------------------------- */
const illustrations = [
  { src: '/simulator-web/assets/illustrations/加注.jpg', title: '甲醇加注作业', text: '加注前端撬块与加注撬块的原 WPF 工艺图示，对应加注、加注扫气与岸载惰化流程。' },
  { src: '/simulator-web/assets/illustrations/供应.jpg', title: '甲醇供应系统', text: '燃料准备间、机舱主机 / 辅机供应与负载均衡流程的原工艺图示。' },
  { src: '/simulator-web/assets/illustrations/漂亮的加注.png', title: '加注撬块与管路', text: '原项目加注撬块示意图，包含软管、阀门、流量计与氮气吹扫接口。' },
  { src: '/simulator-web/assets/illustrations/甲醇泄露.png', title: '甲醇泄漏应急', text: '甲醇泄漏场景示意，对应“甲醇泄露”Playbook 的检测、隔离、回收与复位步骤。' },
]
const introModules = [
  { title: '氮气供应与惰化', text: '氮气瓶组、氧含量与风压监测、船载 / 岸载惰化流程。' },
  { title: '甲醇加注', text: '加注前端、加注撬块、软管连接、加注量与储罐液位趋势。' },
  { title: '燃料舱与准备间', text: '燃料隔离空舱、LFSS 准备间、通风主备机与回收。' },
  { title: '机舱与冷热水', text: '主机 / 辅机甲醇供应、负载均衡、水乙二醇加热与降温。' },
  { title: '废液回收', text: '整备间、燃料舱、积液盘、加注站与排岸回收流程。' },
  { title: '总控与训练', text: '总控室、安全检查、教师 / 学生 / 考试工作区与本地记录。' },
]
function gotoPage(id: string) { navigate(id); closeModal() }

/* -------------------------------- 实时趋势 ------------------------------- */
const statsGroups = [...new Set(sensorDefinitions.map(sensor => sensor.sensorType))]
const statsGroup = ref(statsGroups[0] || '')
const statsRoom = ref('全部')
const statsQuery = ref('')
const statsSelected = ref<string[]>([])
const statsRooms = computed(() => ['全部', ...new Set(sensorDefinitions.filter(sensor => sensor.sensorType === statsGroup.value).map(sensor => sensor.room))])
const statsCandidates = computed(() => sensorDefinitions.filter(sensor => sensor.sensorType === statsGroup.value
  && (statsRoom.value === '全部' || sensor.room === statsRoom.value)
  && (!statsQuery.value || `${sensor.id} ${sensor.name} ${sensor.room}`.toLowerCase().includes(statsQuery.value.toLowerCase()))))
const statsCharts = computed(() => {
  const ids = statsSelected.value.length ? statsSelected.value : statsCandidates.value.slice(0, 4).map(sensor => sensor.id)
  return ids.slice(0, 4).map(id => deviceView(id))
})
watch(statsGroup, () => { statsRoom.value = '全部'; statsSelected.value = [] })
watch(statsRoom, () => { statsSelected.value = [] })
function toggleStats(id: string) {
  if (statsSelected.value.includes(id)) { statsSelected.value = statsSelected.value.filter(item => item !== id); return }
  if (statsSelected.value.length >= 4) { notify('最多同时显示 4 条真实趋势曲线，请先取消一个选择。', 'warning'); return }
  statsSelected.value = [...statsSelected.value, id]
}

/* -------------------------------- 仿真调试 ------------------------------- */
const debugTabs = ['动作', '设备', '管道', '介质填充', '连接拓扑', '替换', '动画'] as const
const debugTab = ref<string>('动作')
const deviceRows = computed(() => [...new Set(Object.values(state.devices))].map(device => ({
  id: device.id, name: String(device.name || device.id), kind: device.kind, kindText: kindLabel(device.kind),
  value: numberValue(device.value), working: device.working === true, enabled: device.enabled !== false,
  error: device.error === true, frozen: device.frozen === true,
  status: deviceStatus(deviceView(device.id)),
})).sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true })))
const deviceQuery = ref('')
const kindFilter = ref('全部')
const deviceKinds = computed(() => ['全部', ...new Set(deviceRows.value.map(row => row.kind))])
const deviceFiltered = computed(() => deviceRows.value.filter(row => (kindFilter.value === '全部' || row.kind === kindFilter.value)
  && (!deviceQuery.value || `${row.id} ${row.name} ${row.kindText}`.toLowerCase().includes(deviceQuery.value.toLowerCase()))))
const deviceColumns = [
  { key: 'id', label: '设备编号' }, { key: 'name', label: '名称' }, { key: 'kindText', label: '类型' },
  { key: 'value', label: '数值', numeric: true }, { key: 'status', label: '状态' }, { key: 'actions', label: '操作', sortable: false },
]
const selectedDeviceId = ref(String(Object.keys(state.devices)[0] || 'P101'))
const selectedDevice = computed(() => deviceView(selectedDeviceId.value))
const editValue = ref(0)
const editWorking = ref(false)
const editEnabled = ref(true)
const editMode = ref('手动')
function syncEditor() {
  const device = selectedDevice.value
  editValue.value = numberValue(device.value)
  editWorking.value = device.working === true
  editEnabled.value = device.enabled !== false
  editMode.value = String(device.mode || '手动')
}
syncEditor()
watch(selectedDeviceId, syncEditor)
function selectDevice(row: { id: string }) { selectedDeviceId.value = row.id }
function applyDeviceEdit() {
  const value = Number(editValue.value)
  if (!Number.isFinite(value)) { notify('设备数值必须是有限数字。', 'error'); return }
  setDevice(selectedDevice.value.id, { value, working: editWorking.value, enabled: editEnabled.value, mode: editMode.value })
  syncEditor()
  notify(`${selectedDevice.value.id} 的本地状态已更新。`, 'success')
}
function toggleFreeze() {
  const device = selectedDevice.value
  setDevice(device.id, { frozen: device.frozen !== true })
  notify(`${device.id} 已${device.frozen !== true ? '冻结' : '解除冻结'}。`, 'success')
}

const pipeRows = computed(() => deviceRows.value.filter(row => ['hose', 'pipe'].includes(row.kind)).map(row => ({ ...row, connected: row.working || row.value > 0 })))
const pipeColumns = [{ key: 'id', label: '软管 / 管道' }, { key: 'name', label: '名称' }, { key: 'value', label: '连通度', numeric: true }, { key: 'status', label: '状态' }, { key: 'actions', label: '操作', sortable: false }]
function setPipe(id: string, open: boolean) {
  setDevice(id, { value: open ? 100 : 0, working: open, connected: open })
  notify(`${id} 已${open ? '连通' : '断开'}。`, 'success')
}

const tankRows = computed(() => deviceRows.value.filter(row => ['tank', 'water-tank', 'balance-tank', 'nitrogen-cylinder'].includes(row.kind)))
const tankColumns = [{ key: 'id', label: '储罐 / 容器' }, { key: 'name', label: '名称' }, { key: 'value', label: '当前值', numeric: true }, { key: 'status', label: '状态' }, { key: 'actions', label: '操作', sortable: false }]
const fillTarget = ref('')
const fillPercent = ref(50)
function fillTank(percent?: number) {
  const id = fillTarget.value || tankRows.value[0]?.id
  if (!id) { notify('当前没有被识别的储罐或容器设备。', 'warning'); return }
  const device = ensureDevice(id)
  const ratio = Math.min(100, Math.max(0, percent ?? (Number(fillPercent.value) || 0))) / 100
  const value = device.min + (device.max - device.min) * ratio
  setDevice(device.id, { value, working: value > device.min, medium: ratio > 0 ? '已填充' : '空' })
  notify(`${device.id} 填充至 ${(ratio * 100).toFixed(0)}%（${value.toFixed(2)} ${device.unit}）。`, 'success')
}

const topologyRows = computed(() => deviceRows.value.filter(row => ['hose', 'pipe', 'station'].includes(row.kind)).map(row => {
  const device = deviceView(row.id)
  return { ...row, from: String(device.from ?? '—'), to: String(device.to ?? '—'), connected: device.connected === false ? '断开' : row.working || row.value > 0 ? '连通' : '断开' }
}))
const topologyColumns = [{ key: 'id', label: '设备' }, { key: 'kindText', label: '类型' }, { key: 'from', label: '起点' }, { key: 'to', label: '终点' }, { key: 'connected', label: '连通状态' }, { key: 'actions', label: '操作', sortable: false }]

const replaceSource = ref(selectedDeviceId.value)
const replaceTarget = ref('')
const replaceConfirm = ref(false)
const replaceSourceDevice = computed(() => deviceView(replaceSource.value))
const applyReplace = ref(false)
function askReplace() {
  if (!replaceTarget.value) { notify('请选择要替换状态的目标设备。', 'warning'); return }
  if (replaceTarget.value === replaceSource.value) { notify('源设备与目标设备不能相同。', 'warning'); return }
  replaceConfirm.value = true
}
function confirmReplace() {
  const target = ensureDevice(replaceTarget.value)
  const source = replaceSourceDevice.value
  setDevice(target.id, { value: source.value, working: source.working, enabled: source.enabled, mode: source.mode, frozen: Boolean(source.frozen) })
  replaceConfirm.value = false
  applyReplace.value = true
  record(`调试：将 ${source.id} 的状态复制到 ${target.id}`, target.id)
  notify(`${source.id} 的数值与运行状态已复制到 ${target.id}。`, 'success')
}

const highlightTarget = ref(selectedDeviceId.value)
function applyHighlight() {
  if (!highlightTarget.value) return
  state.highlightId = highlightTarget.value
  record('调试：设置工艺图高亮设备', highlightTarget.value)
  notify(`工艺图将高亮 ${highlightTarget.value}。`, 'success')
}
function toggleFlag(flag: 'paused' | 'autoDemo' | 'flashOff' | 'muted') {
  const labels = { paused: '暂停', autoDemo: '自动演示', flashOff: '告警闪烁', muted: '提示音' }
  if (flag === 'paused') state.paused = !state.paused
  else if (flag === 'autoDemo') state.autoDemo = !state.autoDemo
  else if (flag === 'flashOff') state.flashOff = !state.flashOff
  else state.muted = !state.muted
  record(`调试：切换${labels[flag]}状态`)
}

const debugFlowId = ref(state.flowId || workflows[0]?.id || '')
const debugAuto = ref(true)
const debugFlow = computed(() => workflows.find(flow => flow.id === debugFlowId.value))
const debugSteps = computed(() => debugFlow.value?.steps || [])
function startDebugFlow() {
  if (!debugFlowId.value) { notify('请选择要执行的现有流程。', 'warning'); return }
  startFlow(debugFlowId.value, debugAuto.value)
}
function debugNext() { nextStep() }

function exportTopology() {
  downloadJson(`debug_devices_${new Date().toISOString().slice(0, 10)}.json`, {
    schemaVersion: 1, exportedAt: new Date().toISOString(), source: 'Simulator.Web 本地设备状态',
    devices: clone(state.devices),
  })
  record('调试：导出设备拓扑 / 状态 JSON')
  notify('设备拓扑 JSON 已导出。', 'success')
}
function exportCondition() {
  downloadJson('debug_condition.json', {
    schemaVersion: 1, name: '调试导出工况', time: new Date().toLocaleString('zh-CN', { hour12: false }),
    elapsed: state.elapsed, devices: clone(state.devices),
  })
  record('调试：导出当前工况 JSON')
  notify('当前工况 JSON 已导出，可由“加载工况”重新载入。', 'success')
}
async function importCondition(event: Event) {
  try {
    const data = await readJsonFile(event, 20 * 1024 * 1024)
    if (data === undefined) return
    if (loadSnapshot(data)) notify('调试工况已载入。', 'success')
  } catch (error) { notify(errorMessage(error), 'error') }
}
function showRecords() { openModal('logs', '系统日志') }
const recentLogs = computed(() => state.logs.slice(0, 6))
</script>

<template>
  <div class="system-tools">
    <!-- 速度控制 -->
    <template v-if="mode === 'speed'">
      <section class="card speed-card">
        <div class="speed-heading"><div><h3>仿真速度</h3><p>Web 版本使用前端定时器推进本地状态，速度只影响本地仿真，不连接求解服务器。</p></div><strong class="speed-value">{{ state.paused ? '暂停' : `${Number(state.speed).toFixed(1)}x` }}</strong></div>
        <input class="speed-slider" type="range" min="0" max="100" step="0.1" :value="Number(state.speed)" aria-label="仿真速度 0 到 100 倍" @input="applySpeed(Number(($event.target as HTMLInputElement).value))">
        <div class="speed-scale"><span>0x 暂停</span><span>1x</span><span>100x</span></div>
        <div class="speed-buttons">
          <button class="btn" :class="{ 'btn-warning': !state.paused }" type="button" @click="togglePause"><UiIcon :name="state.paused ? 'Play' : 'Pause'" :size="14" />{{ state.paused ? '继续运行' : '暂停' }}</button>
          <button v-for="preset in speedPresets" :key="preset.value" class="btn" :class="{ 'btn-primary': Math.abs(Number(state.speed) - preset.value) < 0.001 && !state.paused }" type="button" @click="applySpeed(preset.value)">{{ preset.label }}</button>
          <button class="btn" type="button" @click="advance(1)"><UiIcon name="Timer" :size="14" />推进 1 s</button>
          <button class="btn" type="button" @click="advance(10)"><UiIcon name="Timer" :size="14" />推进 10 s</button>
        </div>
        <div class="speed-metrics">
          <div><small>仿真时长</small><strong>{{ state.elapsed.toFixed(1) }} s</strong></div>
          <div><small>当前流程</small><strong>{{ currentFlow?.name || '未运行' }}</strong></div>
          <div><small>运行状态</small><strong>{{ state.flowRunning ? (state.paused ? '已暂停' : state.autoDemo ? '自动演示' : '手动操作') : '空闲' }}</strong></div>
          <div><small>高亮设备</small><strong>{{ state.highlightId || '无' }}</strong></div>
        </div>
      </section>
    </template>

    <!-- 操作提示 -->
    <template v-else-if="mode === 'hint'">
      <section v-if="currentFlow" class="card hint-card">
        <div class="hint-heading"><div><h3>{{ currentFlow.name }}</h3><p>{{ currentFlow.category }} · 共 {{ hintSteps.length }} 步 · 当前第 {{ Math.min(state.stepIndex + 1, hintSteps.length) }} 步</p></div><div class="hint-actions"><button class="btn btn-sm" type="button" @click="locateDevice(state.highlightId || hintSteps[state.stepIndex]?.deviceId?.split(' ')[0] || '')">高亮当前设备</button><button v-if="state.flowRunning" class="btn btn-sm btn-primary" type="button" @click="nextStep()">{{ state.autoDemo ? '执行下一步' : '确认操作' }}</button></div></div>
        <ol class="hint-steps">
          <li v-for="(step, index) in hintSteps" :key="`${step.name}-${index}`" :class="{ done: index < state.stepIndex, current: index === state.stepIndex }">
            <span class="step-index">{{ index + 1 }}</span>
            <div class="step-body"><strong>{{ step.name }}</strong><p>{{ step.description }}</p><small>{{ step.stage }}<template v-if="stepDeviceId(step)"> · 目标设备 {{ stepDeviceId(step) }}</template></small></div>
            <button v-if="stepDeviceId(step)" class="btn btn-sm" type="button" @click="openStepDevice(step)">打开设备</button>
            <span v-else class="no-device">按描述操作</span>
          </li>
        </ol>
        <p class="hint-foot"><UiIcon name="Info" :size="13" />当前高亮设备：<strong>{{ state.highlightId || '无' }}</strong> · 提示窗口可随时按 F1 打开。</p>
      </section>
      <section v-else class="card">
        <h3>尚未开始流程</h3>
        <p class="muted-note">选择一个可用的现有流程开始训练；加注相关流程仍会执行 247 项安全检查门禁。</p>
        <div class="flow-grid">
          <button v-for="flowItem in workflows" :key="flowItem.id" class="flow-card" type="button" @click="startHintFlow(flowItem.id)">
            <strong>{{ flowItem.name }}</strong><span>{{ pageTitle(flowItem.page) }} · {{ flowItem.steps.length }} 步</span><small>{{ flowItem.requiresSafety ? '需完成安全检查' : '可直接开始' }}</small>
          </button>
        </div>
      </section>
    </template>

    <!-- 系统介绍 -->
    <template v-else-if="mode === 'introduction'">
      <section class="card intro-hero">
        <div class="intro-text">
          <h3>甲醇燃料加注仿真训练系统</h3>
          <p>原 WPF 仿真系统按工艺分区拆分为 10 张工艺图：氮气供应撬块、加注前端撬块、加注撬块、燃料舱隔离空舱、燃料准备间、甲醇发动机机舱、冷热水撬块、回收撬块与总控室。Web 版本保留原设备位号、管路介质色、20 组预置工况与 {{ workflows.length }} 套 Playbook 操作流程。</p>
          <p>训练通过“工艺流程 + 设备操作 + 异常演练 + 安全门禁”完成：加注、惰化与回收流程需先在安全检查页完成全部检查项与双方确认；操作提示、设备监测与趋势记录均在浏览器本地运行。</p>
          <div class="intro-actions"><button class="btn btn-primary" type="button" @click="gotoPage('overview')">进入系统总览</button><button class="btn" type="button" @click="openModal('hint', '操作提示')">查看当前流程步骤</button></div>
        </div>
        <figure class="intro-figure"><img src="/simulator-web/assets/illustrations/加注.jpg" alt="原 WPF 甲醇加注工艺图示"><figcaption>原 WPF 加注工艺图示</figcaption></figure>
      </section>
      <section class="intro-modules">
        <article v-for="item in introModules" :key="item.title" class="card intro-module"><h4>{{ item.title }}</h4><p>{{ item.text }}</p></article>
      </section>
      <section class="gallery">
        <figure v-for="item in illustrations" :key="item.src" class="gallery-item card">
          <img :src="item.src" :alt="item.title" loading="lazy">
          <figcaption><strong>{{ item.title }}</strong><span>{{ item.text }}</span></figcaption>
        </figure>
      </section>
      <section class="card nav-card">
        <h3>可导航工艺模块</h3>
        <div class="nav-buttons"><button v-for="page in pages" :key="page.id" class="btn" type="button" @click="gotoPage(page.id)"><UiIcon :name="page.icon" :size="14" />{{ page.title }}</button><button class="btn" type="button" @click="gotoPage('safety')"><UiIcon name="ShieldCheck" :size="14" />安全检查表</button></div>
      </section>
    </template>

    <!-- 实时趋势 -->
    <template v-else-if="mode === 'statistics'">
      <section class="card">
        <div class="stats-heading"><div><h3>实时趋势</h3><p>曲线来自设备状态的真实采样（浏览器内历史记录），不是随机演示数据。</p></div><span class="badge">{{ statsCharts.length }} / 4 条曲线</span></div>
        <div class="toolbar">
          <select v-model="statsGroup" class="field" aria-label="传感器类型"><option v-for="group in statsGroups" :key="group">{{ group }}</option></select>
          <select v-model="statsRoom" class="field" aria-label="所在处所"><option v-for="room in statsRooms" :key="room">{{ room }}</option></select>
          <input v-model="statsQuery" class="field search" placeholder="搜索位号或名称" aria-label="搜索传感器">
        </div>
        <div class="stats-layout">
          <div class="stats-list">
            <label v-for="sensor in statsCandidates" :key="sensor.id" class="stats-item">
              <input type="checkbox" :checked="statsSelected.includes(sensor.id)" @change="toggleStats(sensor.id)">
              <span><strong>{{ sensor.id }}</strong> {{ sensor.name }}<small>{{ sensor.room }} · {{ Number(deviceView(sensor.id).value).toFixed(2) }} {{ sensor.unit }}</small></span>
            </label>
            <p v-if="!statsCandidates.length" class="empty-state">没有符合条件的传感器。</p>
          </div>
          <div class="stats-charts">
            <TrendChart v-for="chart in statsCharts" :key="chart.id" :device-id="chart.id" :title="`${chart.id} · ${chart.name}`" :unit="chart.unit" :height="200" show-controls />
            <p v-if="!statsCharts.length" class="empty-state">该类型暂无可绘制的传感器。</p>
          </div>
        </div>
      </section>
    </template>

    <!-- 仿真调试 -->
    <template v-else-if="mode === 'debug'">
      <div class="debug-head">
        <div><h3>仿真调试</h3><p>调试操作直接修改本地 DeviceState，只用于演示与排障；不执行任意脚本，也不调用原物理求解器。</p></div>
        <div class="debug-actions"><button class="btn btn-sm" type="button" @click="exportTopology"><UiIcon name="FileJson" :size="13" />导出设备拓扑</button><button class="btn btn-sm" type="button" @click="exportCondition"><UiIcon name="Download" :size="13" />导出工况</button><label class="btn btn-sm file-button"><UiIcon name="Upload" :size="13" />导入工况<input class="visually-hidden" type="file" accept="application/json,.json" @change="importCondition"></label><button class="btn btn-sm" type="button" @click="showRecords"><UiIcon name="ScrollText" :size="13" />查看记录</button></div>
      </div>
      <nav class="tabs debug-tabs"><button v-for="tab in debugTabs" :key="tab" :class="{ active: debugTab === tab }" type="button" @click="debugTab = tab">{{ tab }}</button></nav>

      <section v-if="debugTab === '动作'" class="debug-pane">
        <div class="debug-grid">
          <div class="card">
            <h4>执行现有流程</h4>
            <div class="field-group"><span class="field-label">流程</span><select v-model="debugFlowId" class="field"><option v-for="flowItem in workflows" :key="flowItem.id" :value="flowItem.id">{{ flowItem.name }}（{{ flowItem.steps.length }} 步）</option></select></div>
            <label class="checkbox-label"><input v-model="debugAuto" type="checkbox">自动规则执行（关闭时需手动确认每步）</label>
            <div class="button-row"><button class="btn btn-primary" type="button" @click="startDebugFlow"><UiIcon name="Play" :size="14" />开始 / 重载流程</button><button class="btn" type="button" @click="debugNext"><UiIcon name="ChevronRight" :size="14" />下一步</button><button class="btn" type="button" @click="state.paused = !state.paused"><UiIcon :name="state.paused ? 'Play' : 'Pause'" :size="14" />{{ state.paused ? '继续' : '暂停' }}</button><button class="btn btn-danger" type="button" @click="stopFlow"><UiIcon name="Square" :size="14" />结束流程</button></div>
            <p class="hint">开始流程仍会调用现有安全门禁；例如“甲醇加注”需要先完成安全检查。</p>
            <p class="debug-meta">当前流程：{{ currentFlow?.name || '无' }} · 当前步骤：{{ currentStep?.name || '无' }} · 进度 {{ currentFlow ? `${Math.min(state.stepIndex, currentFlow.steps.length)}/${currentFlow.steps.length}` : '—' }}</p>
          </div>
          <div class="card">
            <h4>步骤列表</h4>
            <ol class="debug-steps"><li v-for="(step, index) in debugSteps" :key="`${step.name}-${index}`" :class="{ done: index < state.stepIndex, current: index === state.stepIndex }"><span>{{ index + 1 }}</span><div><strong>{{ step.name }}</strong><small>{{ step.stage }} · {{ step.rules.length }} 条规则</small></div></li></ol>
            <p v-if="!debugSteps.length" class="empty-state">请选择流程。</p>
          </div>
        </div>
      </section>

      <section v-else-if="debugTab === '设备'" class="debug-pane">
        <div class="toolbar"><input v-model="deviceQuery" class="field search" placeholder="搜索设备编号或名称" aria-label="搜索调试设备"><select v-model="kindFilter" class="field" aria-label="设备类型"><option v-for="kind in deviceKinds" :key="kind" :value="kind">{{ kind === '全部' ? '全部类型' : kindLabel(kind) }}</option></select><span class="muted small">共 {{ deviceFiltered.length }} 台</span></div>
        <div class="device-layout">
          <ToolTable :rows="deviceFiltered" :columns="deviceColumns" default-sort="id" @rowClick="selectDevice">
            <template #cell-value="{ row }"><span class="digital">{{ Number(row.value).toFixed(2) }}</span></template>
            <template #cell-status="{ row }"><span class="badge" :class="row.error || !row.enabled ? 'badge-danger' : row.working ? 'badge-success' : 'badge-muted'">{{ row.status }}</span></template>
            <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" @click.stop="selectDevice(row)">编辑</button><button class="btn btn-sm" type="button" @click.stop="locateDevice(row.id)">高亮</button></div></template>
          </ToolTable>
          <aside class="card editor-card">
            <h4>{{ selectedDevice.id }} · {{ selectedDevice.name }}</h4>
            <p class="hint">{{ selectedDevice.kind }} · 量程 {{ selectedDevice.min }}～{{ selectedDevice.max }} {{ selectedDevice.unit }}</p>
            <label class="field-group"><span class="field-label">数值</span><input v-model.number="editValue" class="field" type="number" step="0.1"></label>
            <label class="field-group"><span class="field-label">控制模式</span><select v-model="editMode" class="field"><option>手动</option><option>自动</option><option>远程</option></select></label>
            <div class="toggle-list"><label class="checkbox-label"><input v-model="editWorking" type="checkbox">运行 / 动作</label><label class="checkbox-label"><input v-model="editEnabled" type="checkbox">允许操作</label></div>
            <div class="button-row"><button class="btn btn-primary btn-sm" type="button" @click="applyDeviceEdit">应用 setDevice</button><button class="btn btn-sm" type="button" @click="toggleFreeze">{{ selectedDevice.frozen ? '解除冻结' : '冻结数值' }}</button><button class="btn btn-sm" type="button" @click="clearFault(selectedDevice.id)">复位故障</button><button class="btn btn-sm" type="button" @click="syncEditor">同步当前值</button></div>
            <p class="hint">冻结仅对传感器 / 仪表的自动更新生效；复位故障会清除本地异常标记。</p>
          </aside>
        </div>
      </section>

      <section v-else-if="debugTab === '管道'" class="debug-pane">
        <p class="hint">软管与管道来自真实设备状态（kind = hose / pipe），连通操作会写入 value / working / connected。</p>
        <ToolTable :rows="pipeRows" :columns="pipeColumns" default-sort="id" empty-text="当前没有被识别的软管或管道设备。">
          <template #cell-status="{ row }"><span class="badge" :class="row.connected ? 'badge-success' : 'badge-muted'">{{ row.status }}</span></template>
          <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" @click="setPipe(row.id, true)">连通</button><button class="btn btn-sm" type="button" @click="setPipe(row.id, false)">断开</button></div></template>
        </ToolTable>
      </section>

      <section v-else-if="debugTab === '介质填充'" class="debug-pane">
        <div class="card fill-card">
          <h4>介质填充</h4>
          <div class="fill-controls">
            <label class="field-group"><span class="field-label">目标储罐 / 容器</span><select v-model="fillTarget" class="field"><option value="">{{ tankRows[0]?.id || '无可用设备' }}</option><option v-for="tank in tankRows" :key="tank.id" :value="tank.id">{{ tank.id }} · {{ tank.name }}</option></select></label>
            <label class="field-group"><span class="field-label">填充百分比</span><input v-model.number="fillPercent" class="field" type="range" min="0" max="100" step="1"></label>
            <div class="fill-readout"><span>{{ fillPercent }}%</span><button class="btn btn-primary" type="button" @click="fillTank()">应用填充</button><button class="btn" type="button" @click="fillTank(100)">注满</button><button class="btn" type="button" @click="fillTank(0)">排空</button></div>
          </div>
          <p class="hint">按设备 min / max 线性换算实际数值，并写入介质标记；不对应原求解器的质量平衡计算。</p>
        </div>
        <ToolTable :rows="tankRows" :columns="tankColumns" default-sort="id" empty-text="当前没有被识别的储罐或容器。">
          <template #cell-status="{ row }"><span class="badge" :class="row.status.includes('异常') ? 'badge-danger' : 'badge-muted'">{{ row.status }}</span></template>
          <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" @click="fillTarget = row.id; fillPercent = 100; fillTank(100)">注满</button><button class="btn btn-sm" type="button" @click="fillTarget = row.id; fillPercent = 0; fillTank(0)">排空</button></div></template>
        </ToolTable>
      </section>

      <section v-else-if="debugTab === '连接拓扑'" class="debug-pane">
        <p class="hint">拓扑表读取本地设备的 from / to / connected 字段；没有记录的端点显示“—”，不访问外部网络。</p>
        <ToolTable :rows="topologyRows" :columns="topologyColumns" default-sort="id">
          <template #cell-actions="{ row }"><div v-if="['hose', 'pipe'].includes(row.kind)" class="row-actions"><button class="btn btn-sm" type="button" @click="setPipe(row.id, true)">连通</button><button class="btn btn-sm" type="button" @click="setPipe(row.id, false)">断开</button></div><span v-else class="muted small">只读</span></template>
        </ToolTable>
      </section>

      <section v-else-if="debugTab === '替换'" class="debug-pane">
        <div class="card">
          <h4>设备状态替换</h4>
          <p class="hint">把源设备的数值、运行状态、模式、启用与冻结标记复制到目标设备，用于快速构造调试工况。设备编号本身不会被改名。</p>
          <div class="replace-grid">
            <label class="field-group"><span class="field-label">源设备</span><select v-model="replaceSource" class="field"><option v-for="row in deviceRows" :key="row.id" :value="row.id">{{ row.id }} · {{ row.name }}</option></select></label>
            <label class="field-group"><span class="field-label">目标设备</span><select v-model="replaceTarget" class="field"><option value="">选择目标设备</option><option v-for="row in deviceRows" :key="row.id" :value="row.id">{{ row.id }} · {{ row.name }}</option></select></label>
            <div class="replace-preview"><small>源状态</small><strong>{{ replaceSourceDevice.id }}</strong><span>数值 {{ Number(replaceSourceDevice.value).toFixed(2) }} · {{ replaceSourceDevice.working ? '运行' : '停止' }} · {{ String(replaceSourceDevice.mode || '手动') }}</span></div>
            <button class="btn btn-primary" type="button" @click="askReplace">复制状态</button>
          </div>
          <div v-if="replaceConfirm" class="confirm-strip"><span>确认用 {{ replaceSourceDevice.id }} 的状态覆盖 {{ replaceTarget }}？</span><button class="btn btn-danger btn-sm" type="button" @click="confirmReplace">确认替换</button><button class="btn btn-sm" type="button" @click="replaceConfirm = false">取消</button></div>
          <p v-if="applyReplace" class="hint text-success">最近一次替换已完成并写入操作记录。</p>
        </div>
      </section>

      <section v-else class="debug-pane">
        <div class="debug-grid">
          <div class="card">
            <h4>动画与提示</h4>
            <div class="toggle-list"><label class="checkbox-label"><input type="checkbox" :checked="state.paused" @change="toggleFlag('paused')">暂停仿真</label><label class="checkbox-label"><input type="checkbox" :checked="state.autoDemo" @change="toggleFlag('autoDemo')">自动演示推进</label><label class="checkbox-label"><input type="checkbox" :checked="state.flashOff" @change="toggleFlag('flashOff')">关闭告警闪烁</label><label class="checkbox-label"><input type="checkbox" :checked="state.muted" @change="toggleFlag('muted')">静音提示</label></div>
            <div class="highlight-row"><select v-model="highlightTarget" class="field"><option v-for="row in deviceRows" :key="row.id" :value="row.id">{{ row.id }} · {{ row.name }}</option></select><button class="btn" type="button" @click="applyHighlight">设置高亮</button></div>
            <div class="button-row"><button class="btn btn-sm" type="button" @click="state.toasts = []; notify('已清空当前提示队列。', 'success')">清空提示队列</button><button class="btn btn-sm" type="button" @click="state.highlightId = ''">清除高亮</button></div>
          </div>
          <div class="card">
            <h4>动画状态</h4>
            <ul class="state-list"><li>当前流程：<strong>{{ currentFlow?.name || '无' }}</strong></li><li>运行 / 暂停：<strong>{{ state.flowRunning ? (state.paused ? '暂停' : '运行') : '空闲' }}</strong></li><li>演示模式：<strong>{{ state.autoDemo ? '自动' : '手动' }}</strong></li><li>仿真速度：<strong>{{ Number(state.speed).toFixed(1) }}x</strong></li><li>高亮设备：<strong>{{ state.highlightId || '无' }}</strong></li><li>提示数量：<strong>{{ state.toasts.length }}</strong></li></ul>
          </div>
        </div>
      </section>

      <section class="card recent-card">
        <div class="panel-heading"><h4>最近操作记录</h4><button class="btn btn-sm" type="button" @click="showRecords">打开完整日志</button></div>
        <ul class="recent-logs"><li v-for="log in recentLogs" :key="log.id"><span>{{ log.time }}</span><strong>{{ log.action }}</strong><small>{{ log.deviceId || '系统' }}</small></li></ul>
        <p v-if="!recentLogs.length" class="empty-state">还没有操作记录。</p>
      </section>
    </template>

    <section v-else class="card">
      <h3>{{ state.modal?.title || '系统工具' }}</h3>
      <p class="hint">该工具在 Web 版本中由设备弹窗、RecordTools 或 ConditionTools 提供。</p>
      <button class="btn btn-primary" type="button" @click="closeModal">关闭窗口</button>
    </section>
  </div>
</template>

<style scoped>
.system-tools { color: #405e75; }
.system-tools .card { padding: 17px 20px; margin-bottom: 14px; }
.system-tools h3 { margin: 0 0 9px; color: #2f6f99; font-size: 15px; }
.system-tools h4 { margin: 0 0 9px; color: #356f97; font-size: 13px; }
.system-tools p { margin: 0 0 9px; font-size: 12px; color: #71899c; line-height: 1.75; }
.hint { font-size: 11px; color: #8ba0b0; }
.speed-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.speed-value { font-size: 27px; color: #2f78a8; font-variant-numeric: tabular-nums; }
.speed-slider { width: 100%; margin: 14px 0 4px; accent-color: #3f87b6; }
.speed-scale { display: flex; justify-content: space-between; font-size: 10px; color: #93a8b8; }
.speed-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.speed-buttons .btn { display: inline-flex; align-items: center; gap: 5px; }
.speed-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; margin-top: 15px; }
.speed-metrics > div { padding: 10px 13px; border: 1px solid #dfe9f2; border-radius: 7px; background: #f7fbfe; display: flex; flex-direction: column; gap: 5px; }
.speed-metrics small { color: #8ba0b0; font-size: 10px; }
.speed-metrics strong { color: #2d6d97; font-size: 13px; }
.hint-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hint-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.hint-steps { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; max-height: 430px; overflow: auto; }
.hint-steps li { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid #e1ebf3; border-radius: 7px; background: #f9fbfd; }
.hint-steps li.current { border-color: #93c4e4; background: #edf7ff; box-shadow: 0 0 0 2px #d5eafa inset; }
.hint-steps li.done { opacity: .62; }
.step-index { width: 23px; height: 23px; border-radius: 50%; display: grid; place-items: center; background: #e3eef8; color: #4d7da2; font-size: 11px; flex-shrink: 0; }
.hint-steps li.current .step-index { background: #2f7fb5; color: white; }
.step-body { flex: 1; min-width: 0; }
.step-body strong { font-size: 12px; color: #3d657f; display: block; }
.step-body p { margin: 3px 0 2px; font-size: 11px; color: #8197a9; }
.step-body small { font-size: 10px; color: #9aadbc; }
.hint-steps li .btn { font-size: 10px; padding: 4px 7px; }
.no-device { font-size: 10px; color: #a3b4c2; }
.hint-foot { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; font-size: 11px; color: #7d95a8; }
.flow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.flow-card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 11px 13px; border: 1px solid #dbe7f1; border-radius: 8px; background: #f8fbfd; text-align: left; cursor: pointer; color: #456d88; }
.flow-card:hover { border-color: #96c1e1; background: #eef7ff; }
.flow-card strong { font-size: 12px; }
.flow-card span { font-size: 10px; color: #8ba0b0; }
.flow-card small { font-size: 10px; color: #b58a44; }
.intro-hero { display: grid; grid-template-columns: 1.25fr .75fr; gap: 18px; align-items: center; }
.intro-figure { margin: 0; border: 1px solid #dfe9f2; border-radius: 8px; overflow: hidden; background: #eef5fb; }
.intro-figure img { display: block; width: 100%; height: 210px; object-fit: cover; }
.intro-figure figcaption { padding: 6px 9px; font-size: 10px; color: #8599a9; }
.intro-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
.intro-modules { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
.intro-module { padding: 13px 15px; }
.intro-module h4 { margin: 0 0 5px; font-size: 12px; color: #33729c; }
.intro-module p { margin: 0; font-size: 11px; color: #7f95a7; line-height: 1.7; }
.gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
.gallery-item { margin: 0; padding: 0; overflow: hidden; }
.gallery-item img { display: block; width: 100%; height: 185px; object-fit: cover; background: #eef5fb; }
.gallery-item figcaption { display: flex; flex-direction: column; gap: 3px; padding: 9px 12px; }
.gallery-item strong { font-size: 12px; color: #356f97; }
.gallery-item span { font-size: 10px; color: #8499aa; line-height: 1.6; }
.nav-buttons { display: flex; flex-wrap: wrap; gap: 7px; }
.nav-buttons .btn { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; }
.stats-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar { margin-bottom: 11px; }
.toolbar .field { width: auto; min-width: 120px; }
.toolbar .search { flex: 1; min-width: 170px; }
.stats-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 13px; }
.stats-list { max-height: 470px; overflow: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 4px; }
.stats-item { display: flex; align-items: flex-start; gap: 7px; padding: 7px 9px; border: 1px solid #e2ecf4; border-radius: 6px; background: #f9fbfd; font-size: 11px; color: #547084; cursor: pointer; }
.stats-item:hover { background: #f1f8fe; }
.stats-item input { margin-top: 2px; accent-color: #4188b5; }
.stats-item span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.stats-item strong { font-family: Consolas, monospace; font-size: 11px; color: #2f6f99; }
.stats-item small { font-size: 10px; color: #93a7b7; }
.stats-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.stats-charts :deep(.trend-chart) { padding: 9px 11px; border: 1px solid #e0eaf3; border-radius: 8px; background: #fcfdff; }
.debug-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.debug-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.debug-actions .btn { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 5px 8px; }
.file-button { cursor: pointer; }
.debug-tabs { margin-bottom: 12px; }
.debug-pane { min-height: 250px; }
.debug-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.debug-grid .card { margin-bottom: 0; }
.field-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
.field-label { font-size: 11px; color: #6a8699; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #5e7b90; margin: 5px 0; }
.checkbox-label input { accent-color: #4188b5; }
.button-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 6px; }
.button-row .btn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 5px 8px; }
.debug-meta { margin-top: 9px !important; padding-top: 8px; border-top: 1px dashed #dfe9f2; font-size: 11px; }
.debug-steps { list-style: none; margin: 0; padding: 0; max-height: 330px; overflow: auto; display: flex; flex-direction: column; gap: 5px; }
.debug-steps li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; background: #f7fbfe; border: 1px solid #e4edf5; font-size: 11px; }
.debug-steps li.current { border-color: #94c2e2; background: #edf7ff; }
.debug-steps li.done { opacity: .62; }
.debug-steps li > span { width: 19px; height: 19px; border-radius: 50%; display: grid; place-items: center; background: #e5eff8; color: #4e7fa4; font-size: 10px; flex-shrink: 0; }
.debug-steps li > div { display: flex; flex-direction: column; gap: 2px; }
.debug-steps small { color: #93a7b7; font-size: 10px; }
.device-layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(240px, .75fr); gap: 13px; align-items: start; }
.editor-card { position: sticky; top: 0; }
.editor-card .toggle-list { display: flex; flex-direction: column; gap: 3px; margin: 4px 0 2px; }
.row-actions { display: flex; gap: 4px; }
.row-actions .btn { font-size: 10px; padding: 3px 6px; }
.fill-controls { display: grid; grid-template-columns: 1.1fr 1.2fr auto; gap: 12px; align-items: end; margin-bottom: 6px; }
.fill-readout { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.fill-readout span { font-size: 20px; color: #2e78a7; min-width: 52px; }
.fill-readout .btn { font-size: 11px; padding: 5px 8px; }
.replace-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; align-items: end; }
.replace-preview { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border: 1px solid #e1ebf3; border-radius: 7px; background: #f8fbfd; font-size: 11px; color: #7a93a6; }
.replace-preview strong { font-family: Consolas, monospace; color: #2f6f99; }
.confirm-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; border: 1px solid #ecc5c8; border-radius: 7px; background: #fff6f6; font-size: 11px; color: #a25058; }
.confirm-strip span { margin-right: auto; }
.highlight-row { display: flex; gap: 7px; margin-top: 10px; }
.highlight-row .field { flex: 1; }
.state-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: #7a93a6; }
.state-list strong { color: #2f6f99; }
.recent-card { margin-bottom: 0; }
.recent-card .panel-heading { margin-bottom: 7px; }
.recent-card .panel-heading h4 { margin: 0; }
.recent-logs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
.recent-logs li { display: flex; gap: 10px; align-items: center; padding: 5px 7px; border-radius: 5px; background: #f8fbfd; color: #7590a3; }
.recent-logs span { min-width: 132px; color: #93a7b7; font-size: 10px; }
.recent-logs strong { flex: 1; color: #4d6f88; font-weight: 500; }
.recent-logs small { color: #93a7b7; font-size: 10px; }
@media (max-width: 820px) {
  .speed-metrics { grid-template-columns: 1fr 1fr; }
  .flow-grid, .intro-modules { grid-template-columns: 1fr 1fr; }
  .intro-hero, .gallery, .debug-grid, .stats-layout, .device-layout, .replace-grid, .fill-controls { grid-template-columns: 1fr; }
}
</style>
