import { computed, reactive, watch } from 'vue'
import { initialDevices, pageAliases, pages, presets, workflows } from '../data/catalog'
import { sensorDefinitions } from '../data/tools'
import type { Alarm, DeviceChanges, DeviceState, ModalState, OperationLog } from '../types/simulator'
import { createDevice, evaluateRule, inferDeviceKind, isDeviceId, rulePatch, validateSnapshot } from './engine'
import { evaluateManualSafety, type ManualSafetyWarning } from './manualSafety'

const STORAGE = 'simulator_web.settings.v1'
const defaultSettings = {
  bunkerFlow: 600, serverAddress: 'http://127.0.0.1:25565', localCoach: true, imageQuality: '高',
  autoNitrogenFan: true, autoFuelCutoff: true, autoFuelPump: true, autoPreparationFan: true, autoCofferdamFan: true, autoWater: true,
  successAutoClose: true, successCloseMs: 3500, informationAutoClose: true, informationCloseMs: 3500,
  warningAutoClose: false, warningCloseMs: 3500, errorAutoClose: false, errorCloseMs: 3500, criticalAutoClose: false, criticalCloseMs: 3500,
  highlightMs: 5000, showDeviceLabels: true, sound: true,
}
function readSettings(): Record<string, any> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}')
    return { ...defaultSettings, ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) }
  } catch { return { ...defaultSettings } }
}

function makeInitialDevices(): Record<string, DeviceState> {
  const devices = structuredClone(initialDevices) as Record<string, DeviceState>
  // XAML DisplayIds are often uppercase while ISensorManager/Playbooks use
  // mixed case. They are aliases of one device, not independent instruments.
  const preferred = new Map(sensorDefinitions.map(sensor => [sensor.id.toLowerCase(), sensor.id]))
  for (const hose of ['Rg001', 'Rg002', 'Rg003']) preferred.set(hose.toLowerCase(), hose)
  const aliases = new Map<string, string[]>()
  for (const key of Object.keys(devices)) { const ids = aliases.get(key.toLowerCase()) || []; ids.push(key); aliases.set(key.toLowerCase(), ids) }
  for (const [folded, ids] of aliases) {
    const configuredId = preferred.get(folded)
    const canonicalId = configuredId && devices[configuredId] ? configuredId : ids.find(key => Object.keys(devices[key]?.sourceValues as object || {}).length) || ids[0]!
    const device = devices[canonicalId]!
    const sourcePages = [...new Set(ids.flatMap(key => Array.isArray(devices[key]?.sourcePages) ? devices[key]!.sourcePages as string[] : []))]
    if (sourcePages.length) device.sourcePages = sourcePages
    for (const key of ids) devices[key] = device
  }
  const links: Record<string, string> = { Pipe1756445628569: 'Rg001', Pipe34: 'Rg002', Pipe1705854637: 'Rg003' }
  for (const [source, target] of Object.entries(links)) {
    devices[target] ||= createDevice(target, 'hose')
    devices[target]!.kind = 'hose'
    devices[source] = devices[target]!
  }
  return devices
}

const state = reactive({
  loggedIn: false,
  role: 'teacher' as 'teacher' | 'student' | 'offline',
  userName: '演示教师',
  page: 'overview',
  previousPage: 'overview',
  devices: makeInitialDevices(),
  modal: null as ModalState | null,
  alarms: [] as Alarm[],
  logs: [] as OperationLog[],
  checklist: {} as Record<string, boolean>,
  requiredSafetyKeys: [] as string[],
  safetyComplete: false,
  settings: readSettings(),
  speed: 1,
  paused: false,
  elapsed: 0,
  flowId: '',
  stepIndex: 0,
  flowRunning: false,
  autoDemo: true,
  highlightId: '',
  muted: false,
  flashOff: false,
  toasts: [] as { id: string; message: string; tone: string }[],
  snapshots: [] as any[],
  workspaces: {} as Record<string, any>,
  manualWarnings: [] as ManualSafetyWarning[],
  manualAutoStart: true,
  manualFlowId: 'bunkering',
  manualFlowExplicit: false,
})

let sequence = 0
let autoAccumulator = 0
let clock: ReturnType<typeof setInterval> | undefined
const id = () => `${Date.now()}-${++sequence}`
const time = () => new Date().toLocaleString('zh-CN', { hour12: false })
const currentFlow = computed(() => workflows.find(flow => flow.id === state.flowId))
const currentStep = computed(() => currentFlow.value?.steps[state.stepIndex])
const activeAlarms = computed(() => state.alarms.filter(alarm => !alarm.acknowledged))
const manualFlow = computed(() => workflows.find(flow => flow.id === state.manualFlowId))
const manualActivity = computed(() => isFreeManual() ? `${manualFlow.value?.name || '自由管路操作'}试验` : '')

function record(action: string, deviceId = '', level = '信息', changes?: DeviceChanges, before?: DeviceChanges) {
  state.logs.unshift({ id: id(), time: time(), at: Date.now(), user: state.userName, action, deviceId, level, ...(changes ? { changes: { ...changes } } : {}), ...(before ? { before: { ...before } } : {}) })
  if (state.logs.length > 5000) state.logs.length = 5000
}
function notify(message: string, tone = 'info') {
  const toastId = id()
  state.toasts.push({ id: toastId, message, tone })
  const category = ({ info: 'information', success: 'success', warning: 'warning', error: 'error' } as Record<string, string>)[tone] || 'information'
  if (state.settings[`${category}AutoClose`] !== false) setTimeout(() => { state.toasts = state.toasts.filter(item => item.id !== toastId) }, Number(state.settings[`${category}CloseMs`]) || 3500)
}
function navigate(page: string) {
  const destination = pageAliases[page] || page
  if (['teacher', 'editor'].includes(destination) && state.workspaces.activeAssessment?.mode === 'exam') { notify('考评期间不能进入教师题库或场景编辑器；请先交卷 / 结束本次。', 'warning'); return }
  if (![...pages.map(item => item.id), 'teacher', 'student', 'exam', 'editor', 'safety'].includes(destination as any)) {
    notify(`未识别的页面：${page}`, 'warning')
    return
  }
  state.previousPage = state.page
  state.page = destination
}
function openModal(type: string, title: string, payload: any = {}) {
  const active = state.workspaces.activeAssessment
  if (active?.kind === 'operation' && active.mode === 'exam' && ['hint', 'debug'].includes(type)) { notify('操作考评期间不提供操作答案或仿真调试，请使用实际工艺画面作答。', 'warning'); return }
  state.modal = { type, title, payload }
}
function closeModal() { state.modal = null }
function isFreeManual() {
  return state.loggedIn && state.flowRunning && !state.autoDemo && !state.flowId && !state.workspaces.activeAssessment
}
function defaultManualFlow(page: string, deviceId = ''): string {
  const id = deviceId.toUpperCase()
  if (['V1004', 'M1005', 'V1603', 'V1604'].includes(id)) return 'shore-inerting'
  if (['V1608', 'RG003'].includes(id)) return 'shore-discharge'
  if (id === 'C1201') return 'load-balance'
  if (/^P20[12]$/.test(id) || page === 'recovery') return 'recovery-waste'
  if (/^P40[12]$/.test(id) || page === 'water') return 'heating'
  if (page === 'nitrogen') return 'ship-inerting'
  if (/^P10[12]$|^ENGINE0[12]$/.test(id) || ['lfss', 'engine'].includes(page)) return 'supply'
  return 'bunkering'
}
function setManualFlow(flowId: string): boolean {
  if (state.workspaces.activeAssessment) { notify('考核 / 录制期间不能切换自由手动工艺。', 'warning'); return false }
  const flow = workflows.find(flow => flow.id === flowId)
  if (!flow) { notify('未找到对应的演示流程定义，没有切换介质或方向。', 'warning'); return false }
  state.manualFlowId = flow.id
  state.manualFlowExplicit = true
  record(`手动工艺切换为 ${flow.name}：沿用演示方向和介质，不载入工况、不自动开阀`)
  return true
}
let previousManualWarnings = new Set<string>()
function refreshManualWarnings() {
  if (!isFreeManual()) { state.manualWarnings = []; previousManualWarnings.clear(); return }
  const warnings = evaluateManualSafety(state.devices, state.safetyComplete)
  const added = warnings.filter(warning => !previousManualWarnings.has(warning.id))
  state.manualWarnings = warnings
  previousManualWarnings = new Set(warnings.map(warning => warning.id))
  for (const warning of added) record(`自由操作安全提示（不拦截）：${warning.title} · ${warning.message}`, warning.deviceIds[0] || '', '警告')
  if (added.length) notify(`安全提示：${added[0]!.title}${added.length > 1 ? `，另有 ${added.length - 1} 项，详见安全提示面板` : ''}。仅提醒，可继续操作。`, 'info')
}
function hasSceneAssessment() {
  const active = state.workspaces.activeAssessment
  return active?.kind === 'operation' && active.customScene && active.flowId === state.flowId
}
function simulationLocked() {
  const active = state.workspaces.activeAssessment
  if (active?.kind !== 'recording' && !(active?.kind === 'operation' && !active.pending)) return false
  notify('当前正在操作考核或录制，请先提交 / 结束本次，再载入工况或重置系统。', 'warning')
  return true
}
function ensureDevice(deviceId: string, kind = inferDeviceKind(deviceId), name?: string): DeviceState {
  if (!isDeviceId(deviceId)) throw new Error('设备编号无效。')
  const existing = (Object.hasOwn(state.devices, deviceId) ? state.devices[deviceId] : undefined) ?? Object.values(state.devices).find(item => item.id.toLowerCase() === deviceId.toLowerCase())
  if (existing) return existing
  state.devices[deviceId] = createDevice(deviceId, kind, name)
  return state.devices[deviceId]!
}
function setDevice(deviceId: string, patch: Partial<DeviceState>, log = true): boolean {
  if (!isDeviceId(deviceId) || !patch || Object.keys(patch).some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) { notify('设备编号或参数字段无效。', 'error'); return false }
  const device = ensureDevice(deviceId)
  if (device.kind === 'hose' && patch.connected === undefined && (patch.value !== undefined || patch.working !== undefined)) {
    patch = { ...patch, connected: (patch.value ?? device.value) > 0 && (patch.working ?? device.working) }
  }
  if (patch.id !== undefined && patch.id !== device.id) { notify('不能修改设备编号。', 'error'); return false }
  if (patch.value !== undefined && !Number.isFinite(patch.value)) { notify('设备数值必须是有限数字。', 'error'); return false }
  if (['working', 'enabled', 'error'].some(key => patch[key] !== undefined && typeof patch[key] !== 'boolean')) { notify('设备状态必须为布尔值。', 'error'); return false }
  // A real user opening a valve from idle is itself the start command. Internal
  // initialization/configuration writes and active assessments cannot start it.
  if (log && state.loggedIn && state.manualAutoStart && !state.flowRunning && !state.flowId && !state.workspaces.activeAssessment &&
    ['valve', 'hose', 'pump', 'fan', 'engine', 'heater', 'station'].includes(device.kind) && (patch.working === true || (patch.value ?? 0) > 0)) {
    startManual()
    if (!state.manualFlowExplicit) state.manualFlowId = defaultManualFlow(state.page, device.id)
  }
  if (!isFreeManual() && device.error && patch.working === true && patch.error !== false) { notify(`${device.id} 处于故障状态，请先复位。`, 'warning'); return false }
  if (!isFreeManual() && !device.enabled && patch.enabled !== true && patch.working !== false && patch.value !== 0) { notify(`${device.id} 已禁用。`, 'warning'); return false }
  const changed = Object.entries(patch).filter(([key, value]) => device[key] !== value)
  const before = Object.fromEntries(changed.filter(([key]) => ['value', 'working', 'error', 'enabled'].includes(key)).map(([key]) => [key, device[key]])) as DeviceChanges
  Object.assign(device, patch)
  if (changed.length && log) {
    const changes = Object.fromEntries(changed.filter(([key]) => ['value', 'working', 'error', 'enabled'].includes(key))) as DeviceChanges
    record(`设置 ${device.id}：${changed.map(([key, value]) => `${key}=${value}`).join('，')}`, device.id, '信息', changes, before)
  }
  if (state.flowRunning && !state.autoDemo && !hasSceneAssessment() && currentStep.value?.rules.length && currentStep.value.rules.every(rule => evaluateRule(rule, state.devices))) advanceStep()
  return true
}
function toggleDevice(deviceId: string) {
  const device = ensureDevice(deviceId)
  const motor = ['pump', 'fan', 'engine', 'heater'].includes(device.kind)
  const on = motor ? device.working : device.value > 0
  setDevice(device.id, { working: !on, value: on ? 0 : 100 })
}
function setSpeed(speed: number) {
  state.speed = Math.min(100, Math.max(0, Number.isFinite(speed) ? speed : 1))
  state.paused = state.speed === 0
  record(`设置仿真倍速为 ${state.speed}x`)
}
function completeSafety(requiredKeys?: string[]): boolean {
  if (requiredKeys) state.requiredSafetyKeys = [...new Set(requiredKeys)]
  const valid = state.requiredSafetyKeys.length > 0 && state.requiredSafetyKeys.every(key => state.checklist[key] === true)
  if (!valid) { state.safetyComplete = false; notify('请完成所有安全检查、数据填写及双方签收。', 'warning'); return false }
  state.safetyComplete = true
  record('加注作业前安全检查表已完成，双方确认通过')
  notify('安全检查通过，可以开始惰化和加注操作。', 'success')
  return true
}
function mergeDevices(values: Record<string, Partial<DeviceState>>, preserveMetadata = true) {
  for (const [deviceId, patch] of Object.entries(values)) {
    if (['__proto__', 'constructor', 'prototype'].includes(deviceId)) continue
    const device = ensureDevice(deviceId, patch.kind)
    const { id: originalId, name, kind, unit, min, max } = device
    Object.assign(device, patch, preserveMetadata ? { id: originalId, name, kind, unit, min, max } : { id: originalId })
    if (device.kind === 'hose' && patch.connected === undefined && (patch.value !== undefined || patch.working !== undefined)) device.connected = device.value > 0 && device.working
  }
}
export const safetyGateEnabled: boolean = false
function startManual(flowId?: string) {
  if (state.workspaces.activeAssessment) { notify('请先结束当前考核或训练。', 'warning'); return false }
  if (typeof flowId === 'string' && !setManualFlow(flowId)) return false
  // Switching directly from a demo retains that exact process definition.
  if (typeof flowId !== 'string' && state.flowId && workflows.some(flow => flow.id === state.flowId)) {
    state.manualFlowId = state.flowId
    state.manualFlowExplicit = true
  } else if (!state.manualFlowExplicit) state.manualFlowId = defaultManualFlow(state.page)
  state.flowId = ''
  state.flowRunning = true
  state.autoDemo = false
  state.paused = false
  state.highlightId = ''
  state.manualAutoStart = true
  if (state.speed <= 0) state.speed = 1
  record('开启自由手动操作：安全只提示，不拦截；管路流动为局部可视化示意')
  notify('自由手动操作已开启：可以任意顺序开关阀门；安全提示不会阻止操作。', 'success')
  return true
}
function startFlow(flowId: string, auto = true): boolean {
  if (auto && state.flowRunning && !state.autoDemo && !state.flowId) {
    notify('请先退出手动操作，再启动流程演示。', 'warning')
    return false
  }
  const flow = workflows.find(item => item.id === flowId)
  if (!flow) { notify('未找到所选仿真流程。', 'error'); return false }
  const assessment = state.workspaces.activeAssessment
  if (assessment?.kind === 'recording' || (assessment?.kind === 'operation' && (auto || assessment.flowId !== flowId))) {
    notify('当前有未结束的操作训练，请先交卷 / 结束，不能用其他流程或自动演示替换本次考核。', 'warning')
    return false
  }
  if (safetyGateEnabled && flow.requiresSafety && !state.safetyComplete) {
    notify('开始该流程前，请先完成加注作业安全检查。', 'warning')
    navigate('safety')
    return false
  }
  if (state.flowRunning) record(`结束上一个流程：${currentFlow.value?.name}`)
  mergeDevices(flow.initial)
  const demoValves: Record<string, string[]> = {
    'shore-inerting': ['M1005', 'V1004', 'M1001', 'M1002', 'V1603', 'V1604', 'Rg001', 'Rg002'],
    'ship-inerting': ['H1710', 'H1242', 'H1243', 'V1609', 'D1604', 'M1602', 'V1602', 'M1102', 'V1702', 'C1701', 'V1701'],
    bunkering: ['M1004', 'M1003', 'V1002', 'M1002', 'M1602', 'V1602', 'M1102', 'Rg002', 'M1006', 'V1001', 'M1001', 'M1601', 'V1601', 'M1101', 'Rg001'],
    'bunkering-purge': ['V1609', 'V1601', 'M1601', 'V1602', 'M1602', 'D1604', 'M1001', 'M1006', 'V1001', 'M1102', 'M1101', 'V1701', 'C1701', 'V1702', 'H1710', 'H1242', 'H1243', 'Rg001'],
    'supply-main': ['V1102', 'M1201', 'V1202', 'D1202', 'V1201', 'D1201', 'V1203', 'V1206', 'V1207', 'V1231', 'M1301', 'V1232', 'M1302', 'P101', 'Engine01', 'Engine02', 'V1404', 'V1403', 'V1401', 'V1402', 'C1401', 'P401', 'P402', 'H1406', 'H1405', 'H1404', 'H1403'],
    'recovery-waste': ['V1501', 'D1501', 'H1503', 'H1231', 'H1230', 'H1423', 'V1605', 'P201'],
    'shore-discharge': ['H1501', 'V1501', 'D1501', 'V1608', 'Rg003', 'P201'],
  }
  if (auto && demoValves[flowId]) {
    const ids = demoValves[flowId]
    for (const id of ids) {
      const device = ensureDevice(id)
      Object.assign(device, { value: 100, working: true })
      if (device.kind === 'hose') device.connected = true
    }
    if (flowId === 'bunkering-purge') for (const id of ['H1241', 'H1711']) Object.assign(ensureDevice(id), { value: 0, working: false })
    if (flowId === 'supply-main') ensureDevice('T101').value = 32
    if (flowId === 'shore-discharge') Object.assign(ensureDevice('T102'), { value: 100, working: true })
  }
  if (auto && !demoValves[flowId]) {
    for (const step of flow.steps) for (const rule of step.rules) {
      if (!['ValveOpen', 'DeviceOpen'].includes(rule.type)) continue
      for (const id of rule.name.trim().split(/\s+/).filter(Boolean)) {
        const device = ensureDevice(id)
        Object.assign(device, { value: 100, working: true })
        if (device.kind === 'hose') device.connected = true
      }
    }
  }
  state.flowId = flow.id
  state.stepIndex = 0
  state.flowRunning = true
  state.autoDemo = auto
  state.paused = false
  if (state.speed === 0) state.speed = 1
  autoAccumulator = 0
  state.highlightId = auto ? '' : flow.steps[0]?.deviceId?.split(' ')[0] || ''
  navigate(flow.page)
  closeModal()
  record(`${auto ? '自动演示' : '手动操作训练'}：${flow.name}`)
  notify(`${flow.name}已开始 · ${auto ? '自动演示' : '请按操作提示依次操作设备'}`, 'success')
  return true
}
function advanceStep() {
  const step = currentStep.value
  if (step) record(`完成步骤：${step.name}`, step.deviceId || '')
  state.stepIndex++
  if (currentFlow.value && state.stepIndex >= currentFlow.value.steps.length) {
    if (currentFlow.value.final) mergeDevices(currentFlow.value.final)
    state.flowRunning = false
    state.highlightId = ''
    record(`流程完成：${currentFlow.value.name}`)
    notify(`${currentFlow.value.name}流程已完成。`, 'success')
  } else state.highlightId = currentStep.value?.deviceId?.split(' ')[0] || ''
}
function nextStep(auto = state.autoDemo): boolean {
  if (!state.flowRunning || !currentStep.value) return false
  if (hasSceneAssessment()) return false
  if (auto && state.workspaces.activeAssessment?.kind === 'operation') { notify('自动演示不能代替本次手动考核操作。', 'warning'); return false }
  if (auto) {
    for (const rule of currentStep.value.rules) {
      for (const deviceId of rule.name.trim().split(/\s+/).filter(Boolean)) {
        const device = ensureDevice(deviceId)
        const closing = rule.type === 'ValveClose' || rule.type === 'DeviceClose' || (rule.type === 'EqualsTo' && rule.value === 0)
        if ((device.error || !device.enabled) && !closing) { notify(`${device.id} 当前故障或禁用，自动流程已暂停。`, 'warning'); state.paused = true; return false }
        if (device.kind === 'sensor' && device.frozen === true) {
          if (!evaluateRule(rule, state.devices)) { notify(`${device.id} 已冻结更新，当前条件尚未满足。`, 'warning'); state.paused = true; return false }
          continue
        }
        Object.assign(device, rulePatch(rule, device))
        if (device.kind === 'hose') device.connected = device.value > 0 && device.working
      }
    }
  }
  if (!currentStep.value.rules.every(rule => evaluateRule(rule, state.devices))) {
    notify(`尚未满足当前步骤：${currentStep.value.name}`, 'warning')
    state.highlightId = currentStep.value.deviceId?.split(' ')[0] || ''
    return false
  }
  advanceStep()
  return true
}
function stopFlow() {
  // Explicit exit must stay stopped until the user re-enters or resets.
  if (isFreeManual()) state.manualAutoStart = false
  if (state.flowId) record(`结束操作：${currentFlow.value?.name || state.flowId}`)
  state.flowRunning = false
  state.highlightId = ''
  autoAccumulator = 0
}
function injectFault(deviceId: string, message = '设备故障') {
  const device = ensureDevice(deviceId)
  Object.assign(device, { error: true, working: false })
  state.alarms.unshift({ id: id(), time: time(), deviceId, level: '严重', message: `${deviceId} · ${message}`, acknowledged: false })
  state.flashOff = false
  record(`注入异常：${message}`, deviceId, '警告', { error: true, working: false })
  notify(`${deviceId} 故障已注入。`, 'warning')
  if (!isFreeManual() && state.settings.autoFuelPump && device.kind === 'pump' && /^P10[12]$/.test(deviceId)) {
    const backup = ensureDevice(deviceId === 'P101' ? 'P102' : 'P101')
    if (!backup.error && backup.enabled) { Object.assign(backup, { working: true, value: 100 }); record(`主泵故障，自动切换至 ${backup.id}`, backup.id) }
  }
}
function clearFault(deviceId: string) {
  ensureDevice(deviceId).error = false
  for (const alarm of state.alarms) if (alarm.deviceId === deviceId) alarm.acknowledged = true
  record('设备故障复位', deviceId, '信息', { error: false })
  notify(`${deviceId} 已复位。`, 'success')
}
function acknowledgeAlarm(alarmId: string) {
  const alarm = state.alarms.find(item => item.id === alarmId)
  if (alarm) { alarm.acknowledged = true; record(`确认告警：${alarm.message}`, alarm.deviceId) }
}
function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
function saveSnapshot(name = '手动保存') {
  const snapshot = { schemaVersion: 1, name, time: time(), elapsed: state.elapsed, devices: JSON.parse(JSON.stringify(state.devices)) }
  state.snapshots.unshift(snapshot)
  if (state.snapshots.length > 20) state.snapshots.length = 20
  try { localStorage.setItem('simulator_web.snapshots.v1', JSON.stringify(state.snapshots)) } catch { notify('本地存储空间不足，请导出工况文件。', 'warning') }
  record(`保存工况：${name}`)
  return snapshot
}
function loadSnapshot(data: unknown): boolean {
  if (simulationLocked()) return false
  try {
    const snapshot = validateSnapshot(data)
    stopFlow()
    mergeDevices(snapshot.devices, false)
    state.elapsed = snapshot.elapsed
    record(`载入工况：${snapshot.name}`)
    notify(`工况“${snapshot.name}”已载入。`, 'success')
    return true
  } catch (error) { notify(error instanceof Error ? error.message : '工况文件无效。', 'error'); return false }
}
function applyPreset(name: string) {
  if (simulationLocked()) return
  const key = ({ '初始': 'init', '开始加注': 'jiazhu', '开始供应': '甲醇供应1' } as Record<string, string>)[name] || name
  const preset = (presets as Record<string, Record<string, Partial<DeviceState>>>)[key]
  if (!preset) { notify('未找到所选 WPF 工况。', 'error'); return }
  stopFlow()
  mergeDevices(preset)
  state.elapsed = 0
  record(`载入原 WPF 工况：${name}`)
  notify(`已加载${name}工况。`, 'success')
}
function reset() {
  if (simulationLocked()) return
  stopFlow()
  state.devices = makeInitialDevices()
  state.elapsed = 0
  state.flowId = ''
  state.stepIndex = 0
  state.safetyComplete = false
  state.checklist = {}
  state.alarms = []
  state.manualAutoStart = true
  state.manualFlowId = 'bunkering'
  state.manualFlowExplicit = false
  record('系统恢复初始工况')
  notify('已恢复初始工况。', 'success')
}
function login(role: 'teacher' | 'student' | 'offline', userName = '') {
  state.role = role
  state.userName = userName.trim() || (role === 'teacher' ? '演示教师' : role === 'offline' ? '离线学员' : '演示学员')
  state.loggedIn = true
  state.manualAutoStart = true
  navigate(role === 'student' ? 'student' : 'overview')
  record(`${role === 'teacher' ? '教师' : role === 'student' ? '学生' : '离线演示'}进入 Web 仿真平台（本地模式）`)
}
function logout() { stopFlow(); closeModal(); state.loggedIn = false; state.role = 'teacher' }
function tickSimulation(delta = 1) {
  if (!state.loggedIn || state.paused || state.speed <= 0) return
  if (state.workspaces.activeAssessment?.kind === 'operation' && state.autoDemo) { state.paused = true; notify('检测到自动演示切换，已暂停；自动操作不计入手动考核。', 'warning'); return }
  state.elapsed += delta * state.speed
  if (!state.flowRunning) return
  const simulated = delta * state.speed
  // Frontend-only qualitative trends; not the physical SimulatorEngine solver.
  const flow = currentFlow.value
  if (flow?.id === 'bunkering') {
    const level = ensureDevice('Lit101', 'sensor')
    if (level.frozen !== true) level.value = Math.min(level.max, level.value + simulated * (Number(state.settings.bunkerFlow) || 600) / 24)
    const tank = ensureDevice('T101', 'tank')
    if (tank.frozen !== true) tank.value = Math.min(100, level.value / Math.max(1, level.max) * 100)
  }
  if (flow?.id.includes('inerting')) {
    const oxygen = ensureDevice(flow.id.startsWith('shore') ? 'Do202' : 'Do101', 'sensor')
    if (oxygen.frozen !== true) oxygen.value = Math.max(0.015, oxygen.value - simulated * 0.003)
  }
  const updateSensor = (deviceId: string, compute: (value: number) => number) => { const device = ensureDevice(deviceId, 'sensor'); if (device.frozen !== true) device.value = compute(device.value) }
  if (flow?.id === 'supply') updateSensor('Lit101', value => Math.max(0, value - simulated * 12))
  if (flow?.id === 'heating') updateSensor('Tit42', value => Math.min(35, value + simulated * 0.1))
  if (flow?.id === 'cooling') updateSensor('Tit42', value => Math.max(25, value - simulated * 0.1))
  if (!state.autoDemo && !hasSceneAssessment() && currentStep.value?.rules.length && currentStep.value.rules.every(rule => evaluateRule(rule, state.devices))) advanceStep()
}
function startClock() {
  if (!clock) clock = setInterval(() => tickSimulation(1), 1000)
  return () => { if (clock) clearInterval(clock); clock = undefined }
}

watch(() => state.settings, value => {
  try { localStorage.setItem(STORAGE, JSON.stringify(value)) } catch { /* Configuration stays in memory when storage is unavailable. */ }
}, { deep: true })
watch(() => state.checklist, () => {
  if (state.safetyComplete && !state.requiredSafetyKeys.every(key => state.checklist[key])) state.safetyComplete = false
}, { deep: true })
watch(() => [isFreeManual(), state.devices, state.safetyComplete], refreshManualWarnings, { deep: true })
try {
  const saved = JSON.parse(localStorage.getItem('simulator_web.snapshots.v1') || '[]')
  if (Array.isArray(saved)) state.snapshots = saved.slice(0, 20).filter(item => { try { validateSnapshot(item); return true } catch { return false } })
} catch { /* Ignore damaged or unavailable browser storage. */ }

export function useSimulator() {
  return { state, currentFlow, currentStep, activeAlarms, manualActivity, manualFlow, setManualFlow, ensureDevice, setDevice, toggleDevice, record, notify, navigate,
    openModal, closeModal, startFlow, startManual, nextStep, stopFlow, setSpeed, completeSafety, injectFault, clearFault, acknowledgeAlarm,
    saveSnapshot, loadSnapshot, downloadJson, reset, login, logout, applyPreset, startClock, tickSimulation, isFreeManual }
}
