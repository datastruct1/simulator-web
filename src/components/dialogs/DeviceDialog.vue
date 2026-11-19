<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useSimulator } from '../../state/simulator'
import type { DeviceState } from '../../types/simulator'
import type { SceneNode } from '../../types/scene'
import { gaugeVisualKind } from '../scene/gauge'
import { nodeRange, nodeUnit, nodeValue } from '../scene/scenes'
import { deviceView, deviceStatus, kindLabel, sensorDefinition, sensorConfiguration, thresholdLabels, thresholdErrors, nullableNumber, numberValue, clone, locateDevice, checkSensorAlarms } from './toolHelpers'
import { useHistoryRecorder, sampleHistory } from './history'
import DeviceVisual from './DeviceVisual.vue'
import TrendChart from '../common/TrendChart.vue'

interface DevicePayload { id?: string; kind?: string; node?: { deviceId?: string; kind?: string; label?: string; width?: number; height?: number; attributes?: Record<string, any> } }
const { state, ensureDevice, setDevice, record, notify, closeModal, clearFault, openModal } = useSimulator()
useHistoryRecorder()
const payload = computed(() => (state.modal?.payload || {}) as DevicePayload)
const deviceId = computed(() => (payload.value.id || payload.value.node?.deviceId || payload.value.node?.label || '本地设备').trim().split(/\s+/)[0] || '本地设备')
const attributes = computed(() => payload.value.node?.attributes || {})
const kind = computed(() => {
  const supplied = payload.value.kind || payload.value.node?.kind || deviceView(deviceId.value).kind
  if (deviceView(deviceId.value, supplied).kind === 'sensor') return 'sensor'
  return ({ dynamo: 'engine', softpipe: 'hose', 'fuel-ship': 'station', fuelship: 'station', nitrogen: 'nitrogen-cylinder' } as Record<string, string>)[supplied] || supplied
})
const device = computed(() => deviceView(deviceId.value, kind.value, payload.value.node?.label))
// Preserve the clicked face independently of the sensor's semantic state kind.
const visualKind = computed(() => gaugeVisualKind(payload.value.node) ?? gaugeVisualKind({ kind: payload.value.kind }) ?? kind.value)
const gaugeNode = computed<SceneNode | undefined>(() => gaugeVisualKind({ kind: visualKind.value }) ? { id: 'dialog-gauge', kind: visualKind.value === 'gauge' ? 'gauge' : 'digital-gauge', label: '', x: 0, y: 0, width: 180, height: 180, attributes: attributes.value } : undefined)
const isValve = computed(() => kind.value === 'valve')
const isTriple = computed(() => isValve.value && (deviceId.value.toUpperCase() === 'C1401' || String(attributes.value.valveType || device.value.valveType).includes('三通')))
const isSensor = computed(() => ['sensor', 'gauge', 'digital-gauge'].includes(kind.value))
const isTank = computed(() => ['tank', 'water-tank', 'balance-tank', 'nitrogen-cylinder'].includes(kind.value))
const isMotor = computed(() => ['pump', 'fan', 'engine', 'heater', 'station'].includes(kind.value))
const draft = reactive<Record<string, any>>({})
const original = ref<Record<string, any>>({})
const activeTab = ref('操作控制')
const tabs = ['操作控制', '历史趋势', '设备资料']
const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(original.value))
const valveAngle = computed({ get: () => numberValue(draft.value) * 3.6, set: (angle: number) => { draft.value = Math.max(0, Math.min(100, angle / 3.6)) } })
const tripleOptions = [{ value: 0, name: '全部关闭', ports: '关闭所有通道' }, { value: 25, name: '下口 → 上口', ports: '下方入口连通上方出口' }, { value: 50, name: '右口 → 上口', ports: '右侧入口连通上方出口' }, { value: 75, name: '下 / 右口 → 上口', ports: '下方和右侧共同连通上方' }]
const tripleImage = computed(() => `/simulator-web/assets/controls/Valve/TripleValve/TripleValve${[25, 50, 75].includes(numberValue(draft.value)) ? draft.value : 0}.png`)
const tripleDescription = computed(() => tripleOptions.find(option => option.value === draft.value)?.ports || '关闭所有通道')
const pairId = computed(() => {
  if (/^P(10|20|40)[12]$/i.test(deviceId.value)) return deviceId.value.slice(0, -1) + (deviceId.value.endsWith('1') ? '2' : '1')
  if (/Master$/i.test(deviceId.value)) return deviceId.value.replace(/Master$/i, 'Backup')
  if (/Backup$/i.test(deviceId.value)) return deviceId.value.replace(/Backup$/i, 'Master')
  return ''
})
const thresholdWarnings = computed(() => isSensor.value ? thresholdErrors({ lowLow: nullableNumber(draft.lowLow), low: nullableNumber(draft.low), high: nullableNumber(draft.high), highHigh: nullableNumber(draft.highHigh), alarmEnabled: Boolean(draft.alarmEnabled) }, numberValue(draft.min), numberValue(draft.max)) : [])
const deviceLogs = computed(() => state.logs.filter(log => log.deviceId.toLowerCase() === deviceId.value.toLowerCase()).slice(0, 6))
const volumePercent = computed(() => numberValue(draft.maxCapacity) > 0 ? numberValue(draft.currentCapacity) / numberValue(draft.maxCapacity) * 100 : 0)
const draftDevice = computed(() => ({ ...device.value, value: numberValue(draft.value), unit: String(draft.unit ?? ''), min: numberValue(draft.min), max: numberValue(draft.max) }))
const displayValue = computed(() => isTank.value ? volumePercent.value : gaugeNode.value ? nodeValue(gaugeNode.value, draftDevice.value) : numberValue(draft.value))
const displayUnit = computed(() => isValve.value || isTank.value ? '%' : gaugeNode.value ? nodeUnit(gaugeNode.value, draftDevice.value) : String(draft.unit ?? ''))
const displayRange = computed(() => gaugeNode.value ? nodeRange(gaugeNode.value, draftDevice.value) : { min: numberValue(draft.min), max: numberValue(draft.max) })

function loadDraft() {
  const view = device.value
  const sensor = sensorDefinition(deviceId.value)
  const config = sensor ? sensorConfiguration(sensor) : { lowLow: null, low: null, high: null, highHigh: null, alarmEnabled: true }
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, clone(view), config, {
    powered: view.powered !== false, startRequested: Boolean(view.startRequested ?? view.working), hasContent: view.hasContent !== false,
    duty: view.duty || (/Backup$|2$/i.test(view.id) ? '备用' : '主用'), hasFuel: view.hasFuel !== false,
    rpm: numberValue(view.rpm, 300), power: numberValue(view.power, 1000), load: numberValue(view.load, 60), fuelMode: view.fuelMode || '甲醇',
    targetTemperature: numberValue(view.targetTemperature, 35), heatingMode: view.heatingMode || '加热', heatingPower: numberValue(view.heatingPower, 60),
    connected: Boolean(view.connected ?? view.value > 0), pressureTested: Boolean(view.pressureTested), purged: Boolean(view.purged),
    from: view.from || '加注设施', to: view.to || '受注船', length: numberValue(view.length, 5), diameter: numberValue(view.diameter, 50),
    maxCapacity: numberValue(view.maxCapacity, 100), currentCapacity: numberValue(view.currentCapacity, view.value), area: numberValue(view.area, 20),
    tankPressure: numberValue(view.tankPressure, 3.5), tankTemperature: numberValue(view.tankTemperature, 25), oxygen: numberValue(view.oxygen, 5),
    medium: view.medium || (kind.value === 'water-tank' ? '水乙二醇' : kind.value === 'nitrogen-cylinder' ? '氮气' : '甲醇'),
    sourceType: attributes.value.sourceType || view.sourceType || '加注船', flow: numberValue(view.flow, numberValue(state.settings.bunkerFlow, 600)),
    grounded: view.grounded !== false, moored: view.moored !== false, emergencyStop: Boolean(view.emergencyStop),
    activeFilter: view.activeFilter || 'A', differentialPressure: numberValue(view.differentialPressure, .05), filterState: view.filterState || '正常',
    frozen: Boolean(view.frozen), setPressure: numberValue(view.setPressure, 1.5),
    min: view.min, max: view.max,
  })
  if (isTriple.value && ![0, 25, 50, 75].includes(draft.value)) draft.value = 0
  original.value = clone(draft)
}
watch(() => state.modal?.payload, () => { activeTab.value = '操作控制'; loadDraft() }, { immediate: true })
let lastAngle: number | undefined
function pointerAngle(event: PointerEvent): number {
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect()
  return Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2) * 180 / Math.PI
}
function startWheel(event: PointerEvent) { if (!device.value.enabled) return; lastAngle = pointerAngle(event); (event.currentTarget as SVGElement).setPointerCapture(event.pointerId) }
function moveWheel(event: PointerEvent) {
  if (lastAngle === undefined) return
  const next = pointerAngle(event)
  let delta = next - lastAngle
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  valveAngle.value += delta
  lastAngle = next
}
function testHose() {
  if (!draft.connected) return notify('请先在编辑区连接软管，再执行泄漏检查。', 'warning')
  draft.pressureTested = !device.value.leaking
  notify(draft.pressureTested ? '前端泄漏检查完成：接口连接正确，无泄漏标记。应用后保存检查结果。' : '检查未通过：设备存在泄漏故障，请先复位。', draft.pressureTested ? 'success' : 'warning')
}
function purgeHose() { if (!draft.connected) return notify('请先连接软管。', 'warning'); draft.purged = true; notify('吹扫操作已完成（本地仿真），应用后保存吹扫状态。', 'success') }
function resetDeviceFault() {
  clearFault(device.value.id)
  setDevice(device.value.id, { enabled: true, frozen: false, leaking: false, bias: 0, faultType: '', faultBackup: null })
  loadDraft()
}
function validate(): boolean {
  if (!device.value.enabled) { notify('设备已锁定，请在异常配置中复位后操作。', 'warning'); return false }
  if (device.value.error && (draft.startRequested || (isValve.value && draft.value > 0))) { notify('设备仍处于异常状态，请先复位。', 'warning'); return false }
  if (!Number.isFinite(Number(draft.value))) { notify('请输入有效的设备数值。', 'error'); return false }
  if (isSensor.value) {
    if (numberValue(draft.min) >= numberValue(draft.max) || draft.value < draft.min || draft.value > draft.max) { notify(`数值必须位于量程 ${draft.min}～${draft.max} ${draft.unit} 内。`, 'warning'); return false }
    const changed = thresholdLabels.some(threshold => nullableNumber(draft[threshold.key]) !== nullableNumber(original.value[threshold.key])) || draft.min !== original.value.min || draft.max !== original.value.max
    if (thresholdWarnings.value.length && changed) { notify(thresholdWarnings.value.join(' '), 'warning'); return false }
  } else if (isValve.value && (draft.value < 0 || draft.value > 100)) { notify('阀门开度必须为 0～100%。', 'warning'); return false }
  if (isTank.value && (!Number.isFinite(Number(draft.maxCapacity)) || draft.maxCapacity <= 0 || draft.currentCapacity < 0 || draft.currentCapacity > draft.maxCapacity || draft.area <= 0)) { notify('罐体容积须大于零，当前容量不得超过极限容积，截面积须大于零。', 'warning'); return false }
  for (const [key, label] of [['rpm', '转速'], ['power', '额定功率'], ['load', '负荷'], ['flow', '输入流量'], ['heatingPower', '加热功率'], ['length', '软管长度'], ['diameter', '软管通径']] as const) {
    if (!Number.isFinite(Number(draft[key])) || Number(draft[key]) < 0) { notify(`${label}必须是非负有限数值。`, 'warning'); return false }
  }
  if (draft.load > 100 || draft.heatingPower > 100 || draft.rpm > 500 || draft.power > 100000 || draft.length > 10000 || draft.diameter > 3000 || !Number.isFinite(Number(draft.targetTemperature))) { notify('运行参数超出有效范围，请检查转速、负荷、功率、长度与温度。', 'warning'); return false }
  return true
}
function apply(exit = false) {
  if (!validate()) return
  const view = device.value
  const current = ensureDevice(view.id, kind.value, view.name)
  let patch: Partial<DeviceState> = { name: view.name, kind: kind.value, mode: String(draft.mode), value: Number(draft.value) }
  let action = '保存设备参数'
  if (isValve.value) {
    patch = { ...patch, unit: '%', working: draft.value > 0, direction: isTriple.value ? tripleDescription.value : '', valveType: attributes.value.valveType || view.valveType || '球阀' }
    action = isTriple.value ? `三通方向：${tripleDescription.value}（${draft.value}% / ${valveAngle.value.toFixed(0)}°）` : `阀门${draft.value === 0 ? '关闭' : draft.value === 100 ? '全开' : '调节'}，开度 ${Number(draft.value).toFixed(2)}% / ${valveAngle.value.toFixed(0)}°`
  } else if (isSensor.value) {
    patch = { ...patch, unit: String(draft.unit), min: Number(draft.min), max: Number(draft.max), frozen: Boolean(draft.frozen), alarmEnabled: Boolean(draft.alarmEnabled),
      lowLow: nullableNumber(draft.lowLow), low: nullableNumber(draft.low), high: nullableNumber(draft.high), highHigh: nullableNumber(draft.highHigh), sensorType: view.sensorType, room: view.room }
    action = `更新传感器：${draft.value} ${draft.unit}，${draft.frozen ? '关闭自动更新' : '允许自动更新'}，${draft.alarmEnabled ? '启用' : '关闭'}报警`
  } else if (['pump', 'fan'].includes(kind.value)) {
    const working = Boolean(draft.startRequested && draft.powered && (kind.value !== 'pump' || draft.hasContent))
    patch = { ...patch, working, value: draft.startRequested ? 100 : 0, powered: Boolean(draft.powered), startRequested: Boolean(draft.startRequested), hasContent: Boolean(draft.hasContent), duty: draft.duty }
    action = `${kind.value === 'pump' ? '泵' : '风机'}${draft.startRequested ? '启动' : '停止'} · ${draft.duty} / ${draft.mode}`
    if (draft.startRequested && !working) notify('启动命令已记录，但设备未通电或入口无介质，不能正常运行。', 'warning')
  } else if (kind.value === 'engine') {
    const working = Boolean(draft.startRequested && draft.hasFuel && draft.powered)
    patch = { ...patch, working, value: working ? Number(draft.load) : 0, startRequested: Boolean(draft.startRequested), hasFuel: Boolean(draft.hasFuel), powered: Boolean(draft.powered), rpm: working ? Number(draft.rpm) : 0,
      power: Number(draft.power), load: Number(draft.load), fuelMode: draft.fuelMode, engineState: !draft.startRequested ? '未启动' : working ? '正常工作' : '启动但没燃料' }
    action = `发动机${draft.startRequested ? '启动' : '停机'} · ${draft.fuelMode} · 负荷 ${draft.load}%`
    if (draft.startRequested && !working) notify('启动命令已记录，当前无燃料或未通电，发动机不产生输出。', 'warning')
  } else if (kind.value === 'heater') {
    patch = { ...patch, working: Boolean(draft.startRequested && draft.powered), value: draft.startRequested ? Number(draft.heatingPower) : 0, targetTemperature: Number(draft.targetTemperature), heatingMode: draft.heatingMode, heatingPower: Number(draft.heatingPower), powered: Boolean(draft.powered) }
    action = `${draft.heatingMode}${draft.startRequested ? '投入' : '停止'}，目标 ${draft.targetTemperature}℃，功率 ${draft.heatingPower}%`
  } else if (isTank.value) {
    patch = { ...patch, unit: '%', value: volumePercent.value, maxCapacity: Number(draft.maxCapacity), currentCapacity: Number(draft.currentCapacity), area: Number(draft.area),
      tankPressure: Number(draft.tankPressure), tankTemperature: Number(draft.tankTemperature), oxygen: Number(draft.oxygen), medium: draft.medium, canSupply: volumePercent.value > 1, setPressure: Number(draft.setPressure) }
    action = `储罐参数：${draft.currentCapacity}/${draft.maxCapacity} m³，液位 ${volumePercent.value.toFixed(2)}%，${draft.medium}`
  } else if (['hose', 'pipe'].includes(kind.value)) {
    patch = { ...patch, working: Boolean(draft.connected), value: draft.connected ? 100 : 0, connected: Boolean(draft.connected), pressureTested: Boolean(draft.connected && draft.pressureTested), purged: Boolean(draft.purged), from: draft.from, to: draft.to, length: Number(draft.length), diameter: Number(draft.diameter) }
    action = `${kind.value === 'hose' ? '软管' : '管路'}${draft.connected ? '连接' : '断开'}，${draft.from} → ${draft.to}${draft.pressureTested ? '，泄漏检查通过' : ''}${draft.purged ? '，已吹扫' : ''}`
  } else if (['filter', 'dual-filter'].includes(kind.value)) {
    patch = { ...patch, activeFilter: draft.activeFilter, differentialPressure: Number(draft.differentialPressure), filterState: draft.filterState, working: draft.filterState === '正常' }
    action = `滤器 ${draft.activeFilter} 投用，压差 ${draft.differentialPressure} bar，状态 ${draft.filterState}`
  } else if (kind.value === 'station') {
    patch = { ...patch, sourceType: draft.sourceType, flow: Number(draft.flow), grounded: Boolean(draft.grounded), moored: Boolean(draft.moored), emergencyStop: Boolean(draft.emergencyStop), working: Boolean(draft.startRequested && !draft.emergencyStop), value: draft.startRequested && !draft.emergencyStop ? 100 : 0 }
    state.settings.bunkerFlow = Number(draft.flow)
    action = `${draft.sourceType}${draft.startRequested ? '开始' : '停止'}供给，输入流量 ${draft.flow} L/min${draft.emergencyStop ? '，紧急切断' : ''}`
  } else {
    patch = { ...patch, working: Boolean(draft.startRequested), value: Number(draft.value) }
    action = `控制值 ${draft.value}，${draft.startRequested ? '投入' : '退出'}，${draft.mode}`
  }
  if (!setDevice(current.id, patch)) return
  if (isSensor.value) checkSensorAlarms(ensureDevice(current.id))
  record(action, current.id)
  sampleHistory(true)
  notify(`${current.id} 操作已应用。`, 'success')
  loadDraft()
  if (exit) closeModal()
}
function swapToBackup() {
  if (!pairId.value) return
  const backup = deviceView(pairId.value, kind.value)
  if (backup.error || !backup.enabled) return notify(`备用设备 ${backup.id} 不可用，请先复位。`, 'warning')
  if (device.value.error || !device.value.enabled) return notify('当前设备不可操作，请使用异常配置进行故障复位。', 'warning')
  ensureDevice(backup.id, kind.value, backup.name)
  if (!setDevice(device.value.id, { working: false, value: 0, startRequested: false, duty: '备用' })) return
  if (!setDevice(backup.id, { working: true, value: 100, startRequested: true, duty: '主用', mode: draft.mode })) return
  record(`主备切换：${device.value.id} → ${backup.id}`, backup.id)
  notify(`已切换至 ${backup.id}。`, 'success')
  loadDraft()
}
</script>

<template>
  <div class="device-dialog" :data-device-kind="kind">
    <div class="device-summary"><div><span class="device-number">{{ device.id }}</span><h3>{{ device.name }}</h3><span class="badge">{{ isTriple ? '三通调节阀' : kindLabel(kind) }}</span></div><span class="status-pill" :class="{ error: device.error || !device.enabled, on: device.working || (isValve && device.value > 0) }"><i/>{{ deviceStatus(device) }}</span></div>
    <nav class="tabs"><button v-for="tab in tabs" :key="tab" class="tab" :class="{ active: activeTab === tab }" type="button" @click="activeTab = tab">{{ tab }}</button><span v-if="dirty" class="draft-badge">编辑未应用</span></nav>
    <div v-if="activeTab === '操作控制'" class="control-layout">
      <aside class="device-picture card">
        <template v-if="isValve && !isTriple"><svg class="handwheel" viewBox="0 0 200 200" aria-label="拖动手轮调节阀门角度" tabindex="0" @pointerdown="startWheel" @pointermove="moveWheel" @pointerup="lastAngle = undefined" @pointercancel="lastAngle = undefined" @lostpointercapture="lastAngle = undefined" @keydown.left.prevent="valveAngle -= 10" @keydown.right.prevent="valveAngle += 10"><circle cx="100" cy="100" r="86" fill="#eef6fc" stroke="#4d809d" stroke-width="10"/><g :transform="`rotate(${valveAngle} 100 100)`"><path d="M100 17V183 M17 100H183 M41 41L159 159 M41 159L159 41" stroke="#6895ac" stroke-width="8"/><circle cx="100" cy="17" r="10" fill="#e8ae42"/></g><circle cx="100" cy="100" r="23" fill="#5787a1" stroke="#fff" stroke-width="3"/></svg><small>拖动手轮 / 使用左右方向键调节</small></template>
        <template v-else-if="isTriple"><img class="triple-image" :src="tripleImage" alt="原 WPF 三通阀方向图"><small>{{ tripleDescription }}</small></template>
        <DeviceVisual v-else :kind="visualKind" :value="displayValue" :unit="displayUnit" :working="isSensor ? device.working : Boolean(draft.startRequested || draft.connected)" :error="device.error" :source="String(attributes.source || '')" :sensor-type="String(device.sensorType || '')" :min="displayRange.min" :max="displayRange.max" :attributes="attributes" :gauge-width="payload.node?.width" :gauge-height="payload.node?.height"/>
        <div class="digital-readout"><strong>{{ displayValue.toFixed(2) }}</strong><span>{{ displayUnit }}</span></div>
        <div class="picture-actions"><button class="btn" type="button" @click="locateDevice(device.id)">高亮查看</button><button class="btn" type="button" @click="openModal('faults', '异常配置', { id: device.id })">异常配置</button></div>
        <button v-if="device.error || !device.enabled || device.frozen" class="btn btn-success" type="button" @click="resetDeviceFault">故障复位 / 解除锁定</button>
      </aside>
      <form class="device-controls card" @submit.prevent="apply(false)">
        <div class="editor-note">下列为编辑草稿，点击“应用”后生效；取消不会改变设备。</div>
        <fieldset :disabled="!device.enabled">
          <template v-if="isValve">
            <div class="form-grid"><label>总角度<input class="field" readonly value="360°"></label><label>旋转角度（°）<input v-model.number="valveAngle" class="field" type="number" min="0" max="360" :step="isTriple ? 90 : 1" :readonly="isTriple"></label></div>
            <template v-if="isTriple"><div class="direction-options"><button v-for="option in tripleOptions" :key="option.value" class="btn" :class="{ 'btn-primary': draft.value === option.value }" type="button" @click="draft.value = option.value">{{ option.name }}<small>{{ option.value * 3.6 }}°</small></button></div><input v-model.number="valveAngle" class="range" type="range" min="0" max="270" step="90" aria-label="三通阀方向"></template>
            <template v-else><label>开度（%）<input v-model.number="draft.value" class="field" type="number" min="0" max="100" step=".01"></label><input v-model.number="draft.value" class="range" type="range" min="0" max="100" step="1" aria-label="阀门开度"><div class="range-labels"><span>全关 0%</span><span>50%</span><span>100% 全开</span></div><div class="quick-buttons"><button class="btn btn-success" type="button" @click="draft.value = 100">开启</button><button class="btn btn-danger" type="button" @click="draft.value = 0">关闭</button><button v-for="value in [25,50,75]" :key="value" class="btn" type="button" @click="draft.value = value">{{ value }}%</button></div></template>
          </template>
          <template v-else-if="isSensor">
            <div class="form-grid"><label>当前值（{{ draft.unit }}）<input v-model.number="draft.value" class="field" type="number" :min="draft.min" :max="draft.max" step=".01"></label><label>单位<input v-model="draft.unit" class="field" required maxlength="20"></label><label>量程下限<input v-model.number="draft.min" class="field" type="number" step=".01"></label><label>量程上限<input v-model.number="draft.max" class="field" type="number" step=".01"></label><label v-for="threshold in thresholdLabels" :key="threshold.key">{{ threshold.label }}<input v-model="draft[threshold.key]" class="field" type="number" step=".01" placeholder="空白 = 不启用"></label></div>
            <label class="check-line"><input v-model="draft.alarmEnabled" type="checkbox">启用报警</label><label class="check-line"><input v-model="draft.frozen" type="checkbox">是否关闭更新（保持设定值）</label>
            <div v-if="thresholdWarnings.length" class="validation-note"><strong>原参数校验：</strong><p v-for="warning in thresholdWarnings" :key="warning">{{ warning }}</p><small>未编辑的原 WPF 参数可保留；修改后须符合量程与阈值顺序。</small></div>
          </template>
          <template v-else-if="['pump','fan','engine','heater','station'].includes(kind)">
            <div class="run-switch"><button class="btn btn-success" type="button" :class="{ chosen: draft.startRequested }" @click="draft.startRequested = true">{{ kind === 'engine' ? '启动发动机' : kind === 'heater' ? '投入' : '启动' }}</button><button class="btn btn-danger" type="button" :class="{ chosen: !draft.startRequested }" @click="draft.startRequested = false">{{ kind === 'engine' ? '停机' : '停止' }}</button></div>
            <div class="form-grid"><label>控制方式<select v-model="draft.mode" class="field"><option>手动</option><option>自动</option><option>远程</option></select></label><label v-if="kind === 'pump' || kind === 'fan'">主 / 备选择<select v-model="draft.duty" class="field"><option>主用</option><option>备用</option></select></label></div>
            <label v-if="kind !== 'station'" class="check-line"><input v-model="draft.powered" type="checkbox">是否通电</label><label v-if="kind === 'pump'" class="check-line"><input v-model="draft.hasContent" type="checkbox">入口有介质（正常工作条件）</label>
            <template v-if="kind === 'engine'"><label class="check-line"><input v-model="draft.hasFuel" type="checkbox">有燃料供应</label><div class="form-grid"><label>燃料模式<select v-model="draft.fuelMode" class="field"><option>甲醇</option><option>柴油</option><option>双燃料</option></select></label><label>额定功率（kW）<input v-model.number="draft.power" class="field" type="number" min="0" max="100000"></label><label>转速（r/min）<input v-model.number="draft.rpm" class="field" type="number" min="0" max="500"></label><label>负荷（%）<input v-model.number="draft.load" class="field" type="number" min="0" max="100"></label></div><input v-model.number="draft.load" class="range" type="range" min="0" max="100" aria-label="发动机负荷"></template>
            <template v-if="kind === 'heater'"><div class="form-grid"><label>工作模式<select v-model="draft.heatingMode" class="field"><option>加热</option><option>降温</option><option>恒温</option></select></label><label>目标温度（℃）<input v-model.number="draft.targetTemperature" class="field" type="number" min="-20" max="80" step=".1"></label><label>功率（%）<input v-model.number="draft.heatingPower" class="field" type="number" min="0" max="100"></label></div><input v-model.number="draft.heatingPower" class="range" type="range" min="0" max="100" aria-label="加热功率"></template>
            <template v-if="kind === 'station'"><div class="form-grid"><label>加注设施<select v-model="draft.sourceType" class="field"><option>加注船</option><option>槽罐加注车</option><option>岸站</option></select></label><label>输入流量（L/min）<input v-model.number="draft.flow" class="field" type="number" min="0" max="999999" step="10"></label></div><label class="check-line"><input v-model="draft.grounded" type="checkbox">已完成电气接地</label><label class="check-line"><input v-model="draft.moored" type="checkbox">系泊 / 槽罐车就位</label><label class="check-line danger-text"><input v-model="draft.emergencyStop" type="checkbox">紧急切断供给</label></template>
            <button v-if="pairId" class="btn" type="button" @click="swapToBackup">立即切换至备用设备 {{ pairId }}</button>
          </template>
          <template v-else-if="isTank"><div class="form-grid"><label>介质<select v-model="draft.medium" class="field"><option>甲醇</option><option>氮气</option><option>水乙二醇</option><option>回收液</option><option>淡水</option></select></label><label>极限容积（m³）<input v-model.number="draft.maxCapacity" class="field" type="number" min=".01" step=".01"></label><label>当前容量（m³）<input v-model.number="draft.currentCapacity" class="field" type="number" min="0" :max="draft.maxCapacity" step=".01"></label><label>罐体截面积（m²）<input v-model.number="draft.area" class="field" type="number" min=".01" step=".01"></label><label>压力（bar）<input v-model.number="draft.tankPressure" class="field" type="number" step=".01"></label><label>温度（℃）<input v-model.number="draft.tankTemperature" class="field" type="number" step=".1"></label><label>氧含量（%V/V）<input v-model.number="draft.oxygen" class="field" type="number" min="0" max="100" step=".1"></label><label v-if="kind === 'nitrogen-cylinder'">供气设定压力（MPa）<input v-model.number="draft.setPressure" class="field" type="number" min="0" max="25" step=".01"></label></div><div class="capacity-bar"><span :style="{ width: `${Math.max(0,Math.min(100,volumePercent))}%` }"/></div><small>当前罐体容量 {{ volumePercent.toFixed(2) }}% · {{ volumePercent > 1 ? '可供应介质' : '低液位，不能供应' }}</small></template>
          <template v-else-if="['hose','pipe'].includes(kind)"><label class="check-line"><input v-model="draft.connected" type="checkbox">{{ kind === 'hose' ? '连接加注软管' : '连通管路' }}</label><div class="form-grid"><label>起点<input v-model="draft.from" class="field" maxlength="80"></label><label>终点<input v-model="draft.to" class="field" maxlength="80"></label><label>长度（m）<input v-model.number="draft.length" class="field" type="number" min=".1" step=".1"></label><label>通径 DN（mm）<input v-model.number="draft.diameter" class="field" type="number" min="1" step="1"></label></div><div class="quick-buttons"><button class="btn" type="button" @click="testHose">泄漏测试</button><button class="btn" type="button" @click="purgeHose">氮气吹扫</button><button class="btn" type="button" @click="draft.connected = false; draft.pressureTested = false">解除连接</button></div><div class="test-result"><span class="badge">{{ draft.pressureTested && draft.connected ? '泄漏测试通过' : '未通过泄漏测试' }}</span><span class="badge">{{ draft.purged ? '已吹扫' : '未吹扫' }}</span></div></template>
          <template v-else-if="['filter','dual-filter'].includes(kind)"><div class="form-grid"><label>投用滤器<select v-model="draft.activeFilter" class="field"><option>A</option><option v-if="kind === 'dual-filter'">B</option></select></label><label>滤器状态<select v-model="draft.filterState" class="field"><option>正常</option><option>堵塞</option><option>维护</option></select></label><label>压差（bar）<input v-model.number="draft.differentialPressure" class="field" type="number" min="0" step=".01"></label></div><button class="btn btn-success" type="button" @click="draft.differentialPressure = 0; draft.filterState = '正常'">清洗当前滤器</button></template>
          <template v-else><label>设定值<input v-model.number="draft.value" class="field" type="number" step=".01"></label><input v-model.number="draft.value" class="range" type="range" :min="device.min" :max="device.max" aria-label="控制设定值"><label class="check-line"><input v-model="draft.startRequested" type="checkbox">投入 / 开启</label><label>控制方式<select v-model="draft.mode" class="field"><option>手动</option><option>自动</option></select></label></template>
        </fieldset>
        <div class="dialog-footer"><button class="btn" type="button" @click="loadDraft">撤销编辑</button><button class="btn" type="button" @click="closeModal">取消</button><button class="btn btn-primary" type="submit" :disabled="!device.enabled">应用</button><button class="btn btn-primary" type="button" :disabled="!device.enabled" @click="apply(true)">保存并退出</button></div>
      </form>
    </div>
    <div v-else-if="activeTab === '历史趋势'" class="card history-panel"><TrendChart :device-id="device.id" :title="`${device.id} · ${device.name}`" :unit="device.unit" :height="260" show-controls/><p>记录中央仿真状态的实际值变化。曲线不代表桌面版本物理解算精度。</p></div>
    <div v-else class="card information-panel"><div class="form-grid"><div><small>设备编号</small><strong>{{ device.id }}</strong></div><div><small>设备名称</small><strong>{{ device.name }}</strong></div><div><small>设备类型</small><strong>{{ kindLabel(kind) }}</strong></div><div><small>运行状态</small><strong>{{ deviceStatus(device) }}</strong></div><div v-for="entry in [['valveType','阀门类型'],['size','阀门通径'],['pressure','压力等级'],['material','材质'],['certificate','认证'],['room','所在处所'],['sensorType','传感器类型']]" :key="entry[0]"><small>{{ entry[1] }}</small><strong>{{ device[entry[0]!] || '—' }}</strong></div></div><h4>最近操作记录</h4><div v-for="log in deviceLogs" :key="log.id" class="log-line"><span>{{ log.time }}</span><strong>{{ log.action }}</strong></div><div v-if="!deviceLogs.length" class="empty-state">该设备尚无操作记录。</div></div>
  </div>
</template>

<style scoped>
.device-dialog { color: #35536d; }.device-summary { display: flex; justify-content: space-between; gap: 15px; align-items: center; padding: 0 2px 14px; }.device-number { color: #1773b4; font-weight: 800; font-size: 13px; letter-spacing: 1px; }.device-summary h3 { margin: 5px 0 8px; font-size: 18px; }.status-pill { display: inline-flex; align-items: center; gap: 7px; border-radius: 20px; background: #f0f4f7; padding: 7px 12px; font-size: 12px; white-space: nowrap; }.status-pill i { width: 7px; height: 7px; border-radius: 50%; background: #91a3b3; }.status-pill.on { background: #ecf8f2; color: #318769; }.status-pill.on i { background: #43ae83; }.status-pill.error { color: #bd6051; background: #fff0ed; }.status-pill.error i { background: #dc7b68; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #dce7f1; margin-bottom: 17px; }.tab { border: none; padding: 10px 15px; background: none; color: #7790a5; font: inherit; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }.tab.active { color: #1875b7; border-color: #1875b7; background: #f1f8fe; }.draft-badge { margin-left: auto; align-self: center; font-size: 11px; color: #c28b35; }.control-layout { display: grid; grid-template-columns: minmax(190px, .75fr) minmax(340px, 1.6fr); gap: 18px; }.card { border: 1px solid #dce8f2; background: #fff; border-radius: 12px; padding: 18px; box-shadow: none; }.device-picture { background: linear-gradient(#f4faff, #fff); display: flex; flex-direction: column; justify-content: flex-start; gap: 17px; text-align: center; }.handwheel { width: 100%; max-height: 190px; touch-action: none; cursor: grab; outline-color: #4d92bf; }.handwheel:active { cursor: grabbing; }.triple-image { width: 100%; max-height: 160px; object-fit: contain; }.device-picture small { font-size: 11px; color: #8095a7; }.digital-readout { display: flex; justify-content: center; gap: 7px; align-items: baseline; color: #246e9e; background: #eaf4fc; border-radius: 8px; padding: 14px 6px; }.digital-readout strong { font-size: 29px; font-variant-numeric: tabular-nums; }.digital-readout span { font-size: 12px; }.picture-actions { display: flex; gap: 7px; justify-content: center; }.picture-actions .btn { padding: 7px 9px; font-size: 12px; }.editor-note { color: #8a9cac; font-size: 11px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #dbe7f1; }
fieldset { min-width: 0; padding: 0; margin: 0; border: none; }fieldset:disabled { opacity: .62; }.device-controls label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; margin-bottom: 13px; }.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }.field { width: 100%; border: 1px solid #d5e2ec; background: #fdfefe; color: #37546b; border-radius: 6px; padding: 9px 10px; font-size: 13px; box-sizing: border-box; }.field:read-only { background: #f0f5f9; }.check-line { flex-direction: row !important; align-items: center; gap: 8px !important; }.check-line input { accent-color: #277bac; width: 15px; height: 15px; }.range { width: 100%; accent-color: #287eb6; margin: 5px 0; }.range-labels { display: flex; justify-content: space-between; font-size: 10px; color: #889eae; margin: 4px 0 17px; }.quick-buttons, .run-switch { display: flex; gap: 8px; margin: 15px 0; flex-wrap: wrap; }.chosen { box-shadow: 0 0 0 3px #cfdfec; }.direction-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }.direction-options .btn { display: flex; flex-direction: column; gap: 5px; justify-content: center; }.direction-options small { font-size: 10px; opacity: .7; }.validation-note { padding: 10px; border-radius: 6px; background: #fff8e8; font-size: 11px; color: #a87d36; }.validation-note p { margin: 6px 0; }.dialog-footer { display: flex; gap: 7px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e1ebf3; flex-wrap: wrap; }.dialog-footer .btn { padding: 8px 11px; font-size: 12px; }.capacity-bar { height: 10px; background: #edf3f8; border-radius: 6px; overflow: hidden; margin: 8px 0 12px; }.capacity-bar span { display: block; height: 100%; background: #74aed0; transition: width .2s; }.test-result { display: flex; gap: 8px; margin-top: 12px; }.danger-text { color: #bd5c55; }.history-panel p { color: #8b9ead; font-size: 11px; }.information-panel small { display: block; color: #8a9dab; font-size: 11px; margin-bottom: 5px; }.information-panel .form-grid { gap: 18px; }.information-panel strong { font-size: 13px; }.information-panel h4 { margin-top: 25px; }.log-line { display: flex; gap: 15px; font-size: 11px; padding: 10px 0; border-bottom: 1px solid #e4edf5; }.log-line span { color: #8197a9; white-space: nowrap; }.log-line strong { font-size: 11px; }
@media (max-width: 740px) { .control-layout { grid-template-columns: 1fr; }.device-picture { display: grid; grid-template-columns: 130px 1fr; align-items: center; }.device-picture > small { display: none; }.device-summary { align-items: flex-start; }.device-summary h3 { font-size: 16px; }.form-grid { gap: 0 9px; } }
</style>
